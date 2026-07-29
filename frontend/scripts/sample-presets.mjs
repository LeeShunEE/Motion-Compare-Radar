import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bundle } from "@remotion/bundler";
import {
  openBrowser,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { webpackOverride } from "../src/remotion/webpack-override.mjs";

const PRESETS = [
  { id: "classic-indigo", title: "经典靛蓝 / Classic Indigo" },
  { id: "brass-observatory", title: "黄铜观测站 / Brass Observatory" },
  { id: "mint-terminal", title: "薄荷终端 / Mint Terminal" },
  { id: "crimson-ringside", title: "赤红擂台 / Crimson Ringside" },
  { id: "silver-cartography", title: "雾银制图 / Silver Cartography" },
];
const MODES = [
  { id: "standard", label: "标准 / Standard" },
  { id: "transition", label: "切换对比 / Transition" },
  { id: "overlay", label: "叠加对比 / Overlay" },
];
const FRAME_RATIOS = [0.18, 0.42, 0.68, 0.88];
const REPRESENTATIVE_RATIO = 0.68;
const requestedPresetId = process.env.PRESET_SAMPLE_ID;
const ACTIVE_PRESETS = requestedPresetId
  ? PRESETS.filter((preset) => preset.id === requestedPresetId)
  : PRESETS;
if (ACTIVE_PRESETS.length === 0) {
  throw new Error(`unknown PRESET_SAMPLE_ID: ${requestedPresetId}`);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const frontendDirectory = path.resolve(scriptDirectory, "..");
const outputDirectory = path.resolve(
  frontendDirectory,
  "..",
  ".preset-samples",
);
const rawDirectory = path.join(outputDirectory, "raw");
const contactSheetDirectory = path.join(outputDirectory, "contact-sheets");

function toManifestPath(absolutePath) {
  return path.relative(outputDirectory, absolutePath).split(path.sep).join("/");
}

function pickUniqueFrames(durationInFrames) {
  if (durationInFrames < FRAME_RATIOS.length) {
    throw new Error(`composition is too short: ${durationInFrames} frames`);
  }
  const lastFrame = durationInFrames - 1;
  const used = new Set();

  return FRAME_RATIOS.map((ratio) => {
    const desired = Math.max(
      0,
      Math.min(lastFrame, Math.round(lastFrame * ratio)),
    );
    for (let distance = 0; distance <= lastFrame; distance += 1) {
      for (const candidate of [desired - distance, desired + distance]) {
        if (candidate >= 0 && candidate <= lastFrame && !used.has(candidate)) {
          used.add(candidate);
          return { ratio, frame: candidate };
        }
      }
    }
    throw new Error(`could not select a unique frame for ratio ${ratio}`);
  });
}

async function assertNonEmptyFile(filePath) {
  const info = await stat(filePath);
  if (!info.isFile() || info.size === 0) {
    throw new Error(`missing or empty output: ${filePath}`);
  }
}

async function imageDataUrl(filePath) {
  const png = await readFile(filePath);
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function renderContactSheets(samples) {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const preset of ACTIVE_PRESETS) {
      const columns = await Promise.all(
        MODES.map(async (mode) => {
          const sample = samples.find(
            (item) => item.presetId === preset.id && item.mode === mode.id,
          );
          if (!sample)
            throw new Error(`missing sample ${preset.id}/${mode.id}`);
          return {
            label: mode.label,
            src: await imageDataUrl(sample.representative.absolutePath),
          };
        }),
      );
      const page = await browser.newPage({
        viewport: { width: 1920, height: 500 },
        deviceScaleFactor: 1,
      });
      try {
        await page.setContent(`<!doctype html>
          <html><head><style>
            * { box-sizing: border-box; }
            html, body { margin: 0; width: 1920px; background: #090b10; color: #f8fafc; }
            body { font-family: Inter, "Noto Sans SC", sans-serif; }
            header { height: 74px; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; border-bottom: 1px solid #303746; background: #11151d; }
            h1 { margin: 0; font-size: 28px; letter-spacing: .02em; }
            .meta { color: #94a3b8; font-size: 15px; }
            main { display: grid; grid-template-columns: repeat(3, 1fr); width: 1920px; }
            figure { margin: 0; border-right: 1px solid #303746; background: #05070b; }
            figure:last-child { border-right: 0; }
            figcaption { height: 44px; display: flex; align-items: center; justify-content: center; color: #cbd5e1; font-size: 17px; font-weight: 650; letter-spacing: .04em; background: #151a24; }
            img { display: block; width: 100%; height: auto; }
          </style></head><body>
            <header><h1>${preset.title}</h1><div class="meta">Radar Renderer · Built-in style preset</div></header>
            <main>${columns
              .map(
                (column) =>
                  `<figure><figcaption>${column.label}</figcaption><img src="${column.src}" /></figure>`,
              )
              .join("")}</main>
          </body></html>`);
        const outputPath = path.join(contactSheetDirectory, `${preset.id}.png`);
        await page.screenshot({ path: outputPath, fullPage: true });
        await assertNonEmptyFile(outputPath);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  await mkdir(rawDirectory, { recursive: true });
  await mkdir(contactSheetDirectory, { recursive: true });

  const serveUrl = await bundle({
    entryPoint: path.resolve(
      frontendDirectory,
      "src/remotion/sampling/index.ts",
    ),
    webpackOverride,
  });
  const browser = await openBrowser("chrome", { logLevel: "warn" });
  const samples = [];
  try {
    for (const preset of ACTIVE_PRESETS) {
      const presetDirectory = path.join(rawDirectory, preset.id);
      await mkdir(presetDirectory, { recursive: true });
      for (const mode of MODES) {
        const inputProps = { presetId: preset.id, mode: mode.id };
        const composition = await selectComposition({
          serveUrl,
          id: "PresetSample",
          inputProps,
        });
        const frames = pickUniqueFrames(composition.durationInFrames);
        const renderedFrames = [];
        for (const selected of frames) {
          const outputPath = path.join(
            presetDirectory,
            `${mode.id}-${selected.frame}.png`,
          );
          await renderStill({
            composition,
            serveUrl,
            output: outputPath,
            inputProps,
            frame: selected.frame,
            imageFormat: "png",
            puppeteerInstance: browser,
            overwrite: true,
            logLevel: "warn",
          });
          await assertNonEmptyFile(outputPath);
          renderedFrames.push({
            ...selected,
            path: toManifestPath(outputPath),
            absolutePath: outputPath,
          });
        }
        const representative = renderedFrames.find(
          (item) => item.ratio === REPRESENTATIVE_RATIO,
        );
        if (!representative) {
          throw new Error(
            `representative frame missing for ${preset.id}/${mode.id}`,
          );
        }
        samples.push({
          presetId: preset.id,
          mode: mode.id,
          durationInFrames: composition.durationInFrames,
          frames: renderedFrames,
          representative,
        });
      }
    }
  } finally {
    await browser.close({ silent: true });
  }

  await renderContactSheets(samples);
  const manifest = {
    generatedAt: new Date().toISOString(),
    frameRatios: FRAME_RATIOS,
    representativeRatio: REPRESENTATIVE_RATIO,
    rawImageCount: samples.reduce(
      (count, sample) => count + sample.frames.length,
      0,
    ),
    contactSheets: ACTIVE_PRESETS.map((preset) =>
      toManifestPath(path.join(contactSheetDirectory, `${preset.id}.png`)),
    ),
    samples: samples.map((sample) => ({
      ...sample,
      frames: sample.frames.map((frame) => ({
        ratio: frame.ratio,
        frame: frame.frame,
        path: frame.path,
      })),
      representative: {
        ratio: sample.representative.ratio,
        frame: sample.representative.frame,
        path: sample.representative.path,
      },
    })),
  };
  const expectedRawCount =
    ACTIVE_PRESETS.length * MODES.length * FRAME_RATIOS.length;
  if (
    manifest.rawImageCount !== expectedRawCount ||
    manifest.contactSheets.length !== ACTIVE_PRESETS.length
  ) {
    throw new Error(
      `unexpected output count: ${manifest.rawImageCount} raw, ${manifest.contactSheets.length} sheets`,
    );
  }
  await writeFile(
    path.join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Preset samples written to ${pathToFileURL(outputDirectory).href}`,
  );
}

await main();
