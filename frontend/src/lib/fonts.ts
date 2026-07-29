import {
  getInfo as getNotoSansSCInfo,
  loadFont as loadNotoSansSC,
} from "@remotion/google-fonts/NotoSansSC";
import {
  getInfo as getNotoSerifSCInfo,
  loadFont as loadNotoSerifSC,
} from "@remotion/google-fonts/NotoSerifSC";
import {
  getInfo as getZCOOLQKHInfo,
  loadFont as loadZCOOLQKH,
} from "@remotion/google-fonts/ZCOOLQingKeHuangYou";
import {
  getInfo as getZCOOLKLInfo,
  loadFont as loadZCOOLKL,
} from "@remotion/google-fonts/ZCOOLKuaiLe";
import {
  getInfo as getMaShanZhengInfo,
  loadFont as loadMaShanZheng,
} from "@remotion/google-fonts/MaShanZheng";
import {
  getInfo as getOrbitronInfo,
  loadFont as loadOrbitron,
} from "@remotion/google-fonts/Orbitron";
import {
  getInfo as getRajdhaniInfo,
  loadFont as loadRajdhani,
} from "@remotion/google-fonts/Rajdhani";
import {
  getInfo as getRussoOneInfo,
  loadFont as loadRussoOne,
} from "@remotion/google-fonts/RussoOne";
import {
  getInfo as getBebasNeueInfo,
  loadFont as loadBebasNeue,
} from "@remotion/google-fonts/BebasNeue";
import {
  getInfo as getExo2Info,
  loadFont as loadExo2,
} from "@remotion/google-fonts/Exo2";
import {
  getInfo as getAudiowideInfo,
  loadFont as loadAudiowide,
} from "@remotion/google-fonts/Audiowide";
import {
  getInfo as getPressStart2PInfo,
  loadFont as loadPressStart2P,
} from "@remotion/google-fonts/PressStart2P";
import {
  getInfo as getBlackOpsOneInfo,
  loadFont as loadBlackOpsOne,
} from "@remotion/google-fonts/BlackOpsOne";

export const CURATED_FONTS = [
  // label 为兜底展示；sans-serif 的「默认」前缀由 FontSelect 用 i18n 覆盖（editor.fontFamily.defaultFont）。
  { name: "sans-serif", label: "Default (sans-serif)", supportsChinese: true },
  { name: "Noto Sans SC", label: "Noto Sans SC", supportsChinese: true },
  { name: "Noto Serif SC", label: "Noto Serif SC", supportsChinese: true },
  { name: "ZCOOL QingKe HuangYou", label: "ZCOOL QingKe HuangYou", supportsChinese: true },
  { name: "ZCOOL KuaiLe", label: "ZCOOL KuaiLe", supportsChinese: true },
  { name: "Ma Shan Zheng", label: "Ma Shan Zheng", supportsChinese: true },
  { name: "Orbitron", label: "Orbitron" },
  { name: "Rajdhani", label: "Rajdhani" },
  { name: "Russo One", label: "Russo One" },
  { name: "Bebas Neue", label: "Bebas Neue" },
  { name: "Exo 2", label: "Exo 2" },
  { name: "Audiowide", label: "Audiowide" },
  { name: "Press Start 2P", label: "Press Start 2P" },
  { name: "Black Ops One", label: "Black Ops One" },
];

const CURATED_LOADERS: Record<
  string,
  {
    // Generated font modules expose font-specific literal unions; the registry
    // deliberately erases those variants and validates options from getInfo().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loader: (...args: any[]) => any;
    getInfo: () => {
      fonts: Record<string, Record<string, unknown>>;
      subsets: readonly string[];
    };
  }
> = {
  "Noto Sans SC": { loader: loadNotoSansSC, getInfo: getNotoSansSCInfo },
  "Noto Serif SC": { loader: loadNotoSerifSC, getInfo: getNotoSerifSCInfo },
  "ZCOOL QingKe HuangYou": {
    loader: loadZCOOLQKH,
    getInfo: getZCOOLQKHInfo,
  },
  "ZCOOL KuaiLe": { loader: loadZCOOLKL, getInfo: getZCOOLKLInfo },
  "Ma Shan Zheng": {
    loader: loadMaShanZheng,
    getInfo: getMaShanZhengInfo,
  },
  Orbitron: { loader: loadOrbitron, getInfo: getOrbitronInfo },
  Rajdhani: { loader: loadRajdhani, getInfo: getRajdhaniInfo },
  "Russo One": { loader: loadRussoOne, getInfo: getRussoOneInfo },
  "Bebas Neue": { loader: loadBebasNeue, getInfo: getBebasNeueInfo },
  "Exo 2": { loader: loadExo2, getInfo: getExo2Info },
  Audiowide: { loader: loadAudiowide, getInfo: getAudiowideInfo },
  "Press Start 2P": {
    loader: loadPressStart2P,
    getInfo: getPressStart2PInfo,
  },
  "Black Ops One": { loader: loadBlackOpsOne, getInfo: getBlackOpsOneInfo },
};

/** CJK 字体需要 chinese-simplified 子集，拉丁字体只需 latin。 */
const CJK_FONTS = new Set([
  "Noto Sans SC", "Noto Serif SC",
  "ZCOOL QingKe HuangYou", "ZCOOL KuaiLe", "Ma Shan Zheng",
]);

/** 字体加载选项：限制 weights/subsets 避免全字重全子集洪泛（Noto Sans SC 默认 ~909 请求）。 */
export function getCuratedFontLoadOptions(family: string): {
  weights: string[];
  subsets: string[];
  ignoreTooManyRequestsWarning: true;
} {
  const entry = CURATED_LOADERS[family];
  if (!entry) throw new Error(`Unknown curated font: ${family}`);
  const info = entry.getInfo();
  const availableWeights = Object.keys(info.fonts.normal ?? {});
  const weights = ["400", "700"].filter((weight) =>
    availableWeights.includes(weight),
  );
  const preferredSubsets = CJK_FONTS.has(family)
    ? ["latin", "chinese-simplified"]
    : ["latin"];
  const subsets = preferredSubsets.filter((subset) =>
    info.subsets.includes(subset),
  );
  return {
    weights: weights.length > 0 ? weights : availableWeights.slice(0, 1),
    subsets: subsets.length > 0 ? subsets : info.subsets.slice(0, 1),
    ignoreTooManyRequestsWarning: true,
  };
}

export async function loadCuratedFonts(): Promise<void> {
  await Promise.all(
    Object.entries(CURATED_LOADERS).map(([name, entry]) =>
      entry.loader("normal", getCuratedFontLoadOptions(name))
    )
  );
}

const injectedFonts = new Set<string>();

function injectGoogleFontLink(fontFamily: string): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (injectedFonts.has(fontFamily)) return Promise.resolve();
  injectedFonts.add(fontFamily);
  const href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
    fontFamily,
  ).replace(/%20/g, "+")}&display=swap`;
  return new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

export async function loadFontDynamic(fontFamily: string): Promise<void> {
  if (fontFamily === "sans-serif") return;
  if (CURATED_LOADERS[fontFamily]) {
    await CURATED_LOADERS[fontFamily].loader(
      "normal",
      getCuratedFontLoadOptions(fontFamily),
    );
    return;
  }
  await injectGoogleFontLink(fontFamily);
}

export async function loadSelectedFonts(families: string[]): Promise<void> {
  const unique = Array.from(new Set(families)).filter((f) => f && f !== "sans-serif");
  await Promise.all(unique.map(loadFontDynamic));
}
