/**
 * fonts.ts 单元测试。
 *
 * 13 个 @remotion/google-fonts/* loader 在调用时会真实出栈网络（拉 CSS/字体文件），
 * 违反 §4「unit 禁止真实 HTTP」。这里统一 mock 为 no-op loader，专注测：
 * - loadFontDynamic：sans-serif 早返回 / curated loader / 动态注入三分支
 * - injectGoogleFontLink：去重 + onload/onerror 解析
 * - loadCuratedFonts：遍历所有 loader
 * - loadSelectedFonts：去重 + 过滤 sans-serif/空
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// 每个 loader mock 为 no-op；vi 在 hoist 的 factory 内可用
const noopLoader = () => vi.fn(() => ({ waitUntil: Promise.resolve() }));
const fontModule = (
  weights = ["400", "700"],
  subsets = ["latin"],
) => ({
  loadFont: noopLoader(),
  getInfo: vi.fn(() => ({
    fonts: {
      normal: Object.fromEntries(weights.map((weight) => [weight, {}])),
    },
    subsets,
  })),
});
vi.mock("@remotion/google-fonts/NotoSansSC", () =>
  fontModule(["400", "700"], ["chinese-simplified", "latin"]),
);
vi.mock("@remotion/google-fonts/NotoSerifSC", () => fontModule());
vi.mock("@remotion/google-fonts/ZCOOLQingKeHuangYou", () => fontModule());
vi.mock("@remotion/google-fonts/ZCOOLKuaiLe", () =>
  fontModule(["400"], ["chinese-simplified", "latin"]),
);
vi.mock("@remotion/google-fonts/MaShanZheng", () => fontModule());
vi.mock("@remotion/google-fonts/Orbitron", () => fontModule());
vi.mock("@remotion/google-fonts/Rajdhani", () => fontModule());
vi.mock("@remotion/google-fonts/RussoOne", () => fontModule());
vi.mock("@remotion/google-fonts/BebasNeue", () => fontModule());
vi.mock("@remotion/google-fonts/Exo2", () => fontModule());
vi.mock("@remotion/google-fonts/Audiowide", () => fontModule());
vi.mock("@remotion/google-fonts/PressStart2P", () => fontModule());
vi.mock("@remotion/google-fonts/BlackOpsOne", () => fontModule());

import {
  CURATED_FONTS,
  getCuratedFontLoadOptions,
  loadCuratedFonts,
  loadFontDynamic,
  loadSelectedFonts,
} from "@/lib/fonts";

describe("CURATED_FONTS", () => {
  it("contains sans-serif default", () => {
    expect(CURATED_FONTS.some((f) => f.name === "sans-serif")).toBe(true);
  });
  it("contains CJK fonts with supportsChinese", () => {
    const cjk = CURATED_FONTS.filter((f) => f.supportsChinese);
    expect(cjk.length).toBeGreaterThan(0);
    expect(cjk.some((f) => f.name === "Noto Sans SC")).toBe(true);
  });
  it("contains latin-only fonts", () => {
    const latin = CURATED_FONTS.filter((f) => !f.supportsChinese);
    expect(latin.some((f) => f.name === "Orbitron")).toBe(true);
  });
});

describe("loadCuratedFonts", () => {
  it("遍历所有 curated loader 且不抛错", async () => {
    await expect(loadCuratedFonts()).resolves.toBeUndefined();
  });
});

describe("getCuratedFontLoadOptions", () => {
  it("只请求字体 normal 样式实际支持的常用字重", () => {
    expect(getCuratedFontLoadOptions("ZCOOL KuaiLe").weights).toEqual(["400"]);
    expect(getCuratedFontLoadOptions("Noto Sans SC").weights).toEqual([
      "400",
      "700",
    ]);
  });

  it("CJK 字体保留简中与拉丁子集", () => {
    expect(getCuratedFontLoadOptions("ZCOOL KuaiLe").subsets).toEqual([
      "latin",
      "chinese-simplified",
    ]);
  });
});

describe("loadFontDynamic", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("sans-serif 直接早返回，不加载", async () => {
    await expect(loadFontDynamic("sans-serif")).resolves.toBeUndefined();
  });

  it("curated 字体走 loader 分支", async () => {
    await expect(loadFontDynamic("Orbitron")).resolves.toBeUndefined();
  });

  it("非 curated 字体动态注入 <link> 并在 onload 时 resolve", async () => {
    const appended: HTMLLinkElement[] = [];
    const spy = vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      appended.push(node as HTMLLinkElement);
      return node as HTMLLinkElement;
    });

    const p = loadFontDynamic("Comic Sans MS");
    // 让 Promise 构造体执行并 append
    await Promise.resolve();
    expect(appended).toHaveLength(1);
    expect(appended[0].rel).toBe("stylesheet");
    expect(appended[0].href).toContain("fonts.googleapis.com");

    // 触发 onload 解析 Promise
    appended[0].onload?.(new Event("load"));
    await expect(p).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("同一字体重复注入走去重分支（不重复 append）", async () => {
    const appended: HTMLLinkElement[] = [];
    const spy = vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      appended.push(node as HTMLLinkElement);
      return node as HTMLLinkElement;
    });

    const first = loadFontDynamic("Custom Font A");
    await Promise.resolve();
    appended[0].onload?.(new Event("load"));
    await first;

    // 第二次：已注入，直接 resolve，不再 append
    const second = loadFontDynamic("Custom Font A");
    await expect(second).resolves.toBeUndefined();
    expect(appended).toHaveLength(1);
    spy.mockRestore();
  });

  it("onerror 也 resolve（容错）", async () => {
    const appended: HTMLLinkElement[] = [];
    const spy = vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      appended.push(node as HTMLLinkElement);
      return node as HTMLLinkElement;
    });

    const p = loadFontDynamic("Broken Font");
    await Promise.resolve();
    appended[0].onerror?.(new Event("error"));
    await expect(p).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe("loadSelectedFonts", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("去重并过滤 sans-serif/空", async () => {
    const appended: HTMLLinkElement[] = [];
    const spy = vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      appended.push(node as HTMLLinkElement);
      return node as HTMLLinkElement;
    });

    const p = loadSelectedFonts(["sans-serif", "", "Fresh Selection Font", "Fresh Selection Font", "Orbitron"]);
    await Promise.resolve();
    // sans-serif 跳过、空跳过、Fresh Selection Font 去重为 1 次、Orbitron 走 loader（不 append）
    expect(appended).toHaveLength(1);
    expect(appended[0].href).toContain("Fresh+Selection+Font");
    // 触发 onload 让待决 Promise 落定，避免悬挂
    appended[0].onload?.(new Event("load"));
    await p;
    spy.mockRestore();
  });
});
