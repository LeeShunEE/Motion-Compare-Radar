// Node 渲染 worker：内部 HTTP 服务，复用 frontend/src/remotion 的 Remotion 产物。
// 仅供 FastAPI 后端内部调用（并发由后端信号量控制，此处一次请求渲染一个任务）。
//
// 请求：POST /render { mode: "single"|"multi", codec: "h264"|"gif",
//                      outputPath: <绝对路径>, inputProps: <图表配置> }
// 响应：200 { outputPath, durationMs, totalFrames } | 4xx/5xx { error }
//
// 静态文件服务：GET /_user_media/* 与 GET /_render_tmp/*
// Remotion bundle 在 bundle 时复制 public 文件夹，运行时新增文件不会被 serve。
// 此静态端点让 worker 可以直接 serve 运行时上传的背景媒体与剪影临时文件。
//
// 启动：cd frontend && node render-worker/server.mjs   （或 pnpm worker）
// 环境变量：WORKER_PORT（默认 3100）

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
// 复用 frontend/src/remotion 的 webpack 覆盖（启用 Tailwind v4），
// 否则 src/remotion/index.ts 里的 `@import "tailwindcss"` 无法被处理。
import { webpackOverride } from "../src/remotion/webpack-override.mjs";
import {
  cancelActiveRender,
  registerActiveRender,
  unregisterActiveRender,
} from "./render-cancellation.mjs";
import { isWorkerAuthorized } from "./worker-auth.mjs";

// 与 frontend/src/types/constants.ts 的 COMP_NAME / MULTI_COMP_NAME 保持一致。
// 此处内联以让 worker 在纯 node 下运行（无需 TS loader）；Remotion bundler 自行处理组件 TS 树。
const COMP_NAME = "RadarChartVideo";
const MULTI_COMP_NAME = "MultiPageRadarVideo";

const PORT = Number(process.env.WORKER_PORT ?? 3100);
const ENTRY = path.resolve(process.cwd(), "src", "remotion", "index.ts");
const PUBLIC_DIR = path.resolve(process.cwd(), "public");
// 进度反向回调：worker 在渲染过程中把帧进度 POST 回后端内部端点。
// compose 内网调用 backend；本地直跑默认 localhost:8000。
const BACKEND_INTERNAL_URL =
  process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000";
const RENDER_CALLBACK_TOKEN = process.env.RENDER_CALLBACK_TOKEN ?? "";
// 节流参数：至少间隔多久、或进度跨过多少比例才上报一次，避免高频打爆后端。
const PROGRESS_MIN_INTERVAL_MS = 800;
const PROGRESS_MIN_DELTA = 0.02;
// 容器内已装系统 Chromium（见 Dockerfile 的 CHROMIUM_PATH）；显式指定可执行文件，
// 否则 Remotion 会尝试把无头浏览器下载到只读的 node_modules/.remotion（EACCES）。
const BROWSER_EXECUTABLE =
  process.env.REMOTION_BROWSER_EXECUTABLE ?? process.env.CHROMIUM_PATH ?? null;

// bundle 较慢，进程内缓存复用。
let bundlePromise = null;
function getBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: ENTRY,
      publicDir: PUBLIC_DIR,
      webpackOverride,
    });
  }
  return bundlePromise;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

// 静态文件服务：serve _user_media 与 _render_tmp 目录下的文件。
// Remotion bundle 在 bundle 时复制 public 文件夹，运行时新增文件不会被 serve。
// 此端点让后端可以生成完整 URL（http://worker:3100/_user_media/users/...）
// 供 Remotion 组件直接使用，绕过 staticFile 的 bundle 时复制限制。
// urlPath: 已去掉 query string 的路径（如 /_user_media/users/62/uploads/sample-bg.png）
function serveStaticFile(urlPath, res) {
  // urlPath 已去掉 query string
  const relPath = urlPath;

  // 只允许 _user_media 与 _render_tmp 子目录
  if (!relPath.startsWith("/_user_media/") && !relPath.startsWith("/_render_tmp/")) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden: only _user_media and _render_tmp allowed" }));
    return false;
  }

  const fullPath = path.join(PUBLIC_DIR, relPath);

  // 安全检查：防止路径穿越（已由前缀限制，但双重保险）
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "forbidden: path traversal" }));
    return false;
  }

  // 检查文件是否存在
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return false;
  }

  // 简单 MIME 类型推断（图片/视频/二进制）
  const ext = path.extname(resolved).toLowerCase();
  const MIME_MAP = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
  };
  const contentType = MIME_MAP[ext] || "application/octet-stream";

  // 流式响应文件内容（CORS 允许 Remotion Chromium 跨域请求）
  res.writeHead(200, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",  // 运行时文件，不缓存
  });
  fs.createReadStream(resolved).pipe(res);
  return true;
}

// 节流上报渲染进度（fire-and-forget，失败绝不中断渲染）。
function makeProgressReporter(taskId, totalFrames) {
  let lastReportAt = 0;
  let lastProgress = -1;
  // taskId 缺失或未配置回调令牌时直接禁用，避免无谓请求。
  const enabled = taskId != null && RENDER_CALLBACK_TOKEN !== "";
  return ({ renderedFrames, progress }) => {
    if (!enabled) return;
    const now = Date.now();
    const crossedDelta = progress - lastProgress >= PROGRESS_MIN_DELTA;
    const elapsedEnough = now - lastReportAt >= PROGRESS_MIN_INTERVAL_MS;
    // 终帧（progress=1）始终放行，保证进度条收尾到满。
    if (progress < 1 && !crossedDelta && !elapsedEnough) return;
    lastReportAt = now;
    lastProgress = progress;
    fetch(`${BACKEND_INTERNAL_URL}/api/v1/internal/render-progress/${taskId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Render-Callback-Token": RENDER_CALLBACK_TOKEN,
      },
      body: JSON.stringify({
        rendered_frames: renderedFrames,
        total_frames: totalFrames,
      }),
    }).catch(() => {
      // 进度上报失败不影响渲染主流程，静默忽略。
    });
  };
}

async function handleRender(body) {
  const { taskId, mode = "single", codec = "h264", outputPath, inputProps } = body;
  if (!outputPath) throw new Error("缺少 outputPath");

  const serveUrl = await getBundle();
  const isMulti = mode === "multi";
  const compositionId = isMulti ? MULTI_COMP_NAME : COMP_NAME;
  const chromiumOptions = { gl: "angle", enableMultiProcessOnLinux: true };

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
    chromiumOptions,
    browserExecutable: BROWSER_EXECUTABLE,
  });

  const reportProgress = makeProgressReporter(
    taskId,
    composition.durationInFrames,
  );
  const startedAt = Date.now();
  const { cancelSignal, cancel } = makeCancelSignal();
  registerActiveRender(taskId, cancel);
  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: codec === "gif" ? "gif" : "h264",
      outputLocation: outputPath,
      inputProps,
      concurrency: null,
      cancelSignal,
      // 容器内无 GPU：OffthreadVideo 视频背景抽帧若走硬件解码会令 Remotion 合成器
      // SIGSEGV（图片/剪影不触发，因不经视频解码路径）。显式禁用硬解，纯软件解码稳定。
      hardwareAcceleration: "disable",
      chromiumOptions,
      browserExecutable: BROWSER_EXECUTABLE,
      onProgress: reportProgress,
    });
  } finally {
    unregisterActiveRender(taskId);
  }

  // durationMs 为 wall-clock 渲染耗时，totalFrames 供后端计算平均渲速（fps）。
  return {
    outputPath,
    durationMs: Date.now() - startedAt,
    totalFrames: composition.durationInFrames,
  };
}

const server = http.createServer(async (req, res) => {
  // 解析 URL（去掉 query string）
  const urlPath = req.url.split("?")[0];

  if (req.method === "GET" && urlPath === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const cancelMatch = urlPath.match(/^\/render\/(\d+)$/);
  const isWorkerWrite =
    (req.method === "POST" && urlPath === "/render") ||
    (req.method === "DELETE" && cancelMatch !== null);
  if (
    isWorkerWrite &&
    !isWorkerAuthorized(req.headers.authorization, RENDER_CALLBACK_TOKEN)
  ) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return;
  }

  if (req.method === "DELETE" && cancelMatch) {
    const canceled = cancelActiveRender(Number(cancelMatch[1]));
    res.writeHead(canceled ? 202 : 404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ canceled }));
    return;
  }

  // 静态文件服务：_user_media 与 _render_tmp
  if (req.method === "GET" && (urlPath.startsWith("/_user_media/") || urlPath.startsWith("/_render_tmp/"))) {
    serveStaticFile(urlPath, res);
    return;
  }

  if (req.method !== "POST" || urlPath !== "/render") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  let body;
  try {
    body = await readJson(req);
    const result = await handleRender(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error("render error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error?.message ?? "render failed" }));
  } finally {
    if (Number.isInteger(body?.taskId)) unregisterActiveRender(body.taskId);
  }
});

server.listen(PORT, () => {
  console.log(`render-worker listening on http://localhost:${PORT}`);
});
