# Built-in Style Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加五套内置视觉 preset，一次应用到整份多页面配置，在不改变用户内容、模式与时序的前提下统一标准页、切换对比与叠加对比的表现，并生成五张经过逐帧检查的三模式预览图。

**Architecture:** 用 Zod 定义只含表现字段的 `RadarPreset`，静态常量在模块加载时解析；纯函数 `applyPresetToConfig` 按白名单不可变地合并到所有 pages、global override values 和 comparison 视觉字段。编辑器由独立 `PresetSelector` 发出完整 preset，`RadarEditor` 持有整份 config 并执行应用。独立 Remotion sampling entry 复用生产渲染组件，一次 bundle、复用浏览器、批量渲染关键帧，再由 Playwright 组成五张三栏 contact sheet。

**Tech Stack:** TypeScript 6、React 19、Next.js 16、Zod 4、next-intl 4、Vitest 4、Testing Library、Remotion 4.0.484（`@remotion/bundler` / `@remotion/renderer`）、Playwright 1.61、pnpm。

## Global Constraints

- 工作目录固定为 `.worktrees/built-in-style-presets`，分支固定为 `feat/built-in-style-presets`。
- preset 一次作用于整份 `MultiPageConfig`；入口文案必须明确“应用到全部页面”。
- 五套 id 固定为 `classic-indigo`、`brass-observatory`、`mint-terminal`、`crimson-ringside`、`silver-cartography`，总数严格为五。
- preset 可替换 theme、font、layout、八轴 labelOffset、slug 外观、非时序特效样式与 comparison 视觉字段。
- preset 不得替换页面/角色/属性文本与数值、页面顺序、素材、comparison 索引与 layout、动画时长/延迟/停留/切换节奏/阈值、overlay highlightOrder、overrideIgnored 或 global override enabled。
- 现有默认配置在用户未点击 preset 时完全不变；`classic-indigo` 与现有默认视觉等价。
- 不新增后端、数据库、外部依赖、用户 preset 存储或共享能力。
- 测试路径必须与 `frontend/src/` 物理路径 1:1 对齐；每个行为按 RED → GREEN → REFACTOR 执行。
- 前端包管理只用 pnpm；commit 必须 `-s` 并同时带 `Co-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>`。
- 最终必须运行 `pnpm test:unit`、`pnpm test:integration`、`pnpm lint`、`pnpm build` 与 `node scripts/sample-presets.mjs`。
- 五张 contact sheet 必须来自最后一次采样输出，并经多模态检查标准/transition/overlay 三种模式后才可展示。

---

## File Structure

- Create `frontend/src/types/presets.ts`: Zod schema、preset id 与表现层类型。
- Create `frontend/src/presets/built-in-presets.ts`: 五套静态 token、列表解析与按 id 查询。
- Create `frontend/src/lib/apply-preset.ts`: page/config 的白名单不可变应用函数。
- Create `frontend/src/components/editor/PresetSelector.tsx`: 五张可访问 preset 卡片。
- Modify `frontend/src/components/editor/ThemeEditor.tsx`: 在色板上方组合 selector。
- Modify `frontend/src/components/editor/PageConfigPanel.tsx`: 透传全局应用回调。
- Modify `frontend/src/components/editor/RadarEditor.tsx`: 拥有 apply 行为并更新整份 config。
- Modify `frontend/messages/zh.json`, `frontend/messages/en.json`: selector、范围说明、五套名称与说明。
- Create `frontend/src/remotion/sampling/sample-config.ts`: 固定三模式演示配置纯函数。
- Create `frontend/src/remotion/sampling/PresetSampleComposition.tsx`: 根据 preset id/mode 复用 `MultiPageVideo`。
- Create `frontend/src/remotion/sampling/PresetSampleRoot.tsx`: 仅供脚本 bundle 的 composition registry。
- Create `frontend/src/remotion/sampling/index.ts`: sampling `registerRoot` 入口。
- Create `frontend/scripts/sample-presets.mjs`: 一次 bundle、关键帧渲染、manifest 与 contact sheet。
- Modify `frontend/package.json`: 新增 `sample:presets` 命令，不改依赖。
- Modify `.gitignore`: 忽略 `frontend/.preset-samples/`。
- Create/modify the exact mirrored test files named in each task below.

---

### Task 1: Preset Schema and Five Built-in Token Sets

**Files:**
- Create: `frontend/src/types/presets.ts`
- Create: `frontend/src/presets/built-in-presets.ts`
- Create: `tests/unit/frontend/types/presets.test.ts`

**Interfaces:**
- Produces: `RadarPresetIdSchema`, `RadarPresetSchema`, `BuiltInPresetListSchema`, `RadarPresetId`, `RadarPreset`.
- Produces: `BUILT_IN_PRESETS: readonly RadarPreset[]` and `getBuiltInPreset(id: RadarPresetId): RadarPreset`.
- Later tasks consume the parsed list and preset objects; no later task may construct unparsed preset data.

- [ ] **Step 1: Write the failing schema/list behavior tests**

Create `tests/unit/frontend/types/presets.test.ts` with hand-derived expectations:

```ts
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PRESETS,
  getBuiltInPreset,
} from "@/presets/built-in-presets";
import {
  BuiltInPresetListSchema,
  RadarPresetSchema,
} from "@/types/presets";
import { defaultRadarProps } from "@/types/constants";

const EXPECTED_IDS = [
  "classic-indigo",
  "brass-observatory",
  "mint-terminal",
  "crimson-ringside",
  "silver-cartography",
] as const;

describe("built-in radar presets", () => {
  it("提供五个可解析且 id 唯一的内置 preset", () => {
    expect(BUILT_IN_PRESETS.map((preset) => preset.id)).toEqual(EXPECTED_IDS);
    expect(new Set(BUILT_IN_PRESETS.map((preset) => preset.id)).size).toBe(5);
    for (const preset of BUILT_IN_PRESETS) {
      expect(RadarPresetSchema.parse(preset)).toEqual(preset);
      expect(preset.page.attributeLabelOffsets).toHaveLength(8);
    }
  });

  it("拒绝重复 id，避免 selector 中出现不可区分项", () => {
    const duplicate = [
      ...BUILT_IN_PRESETS.slice(0, 4),
      BUILT_IN_PRESETS[0],
    ];
    expect(() => BuiltInPresetListSchema.parse(duplicate)).toThrow();
  });

  it("经典靛蓝与当前默认视觉保持等价", () => {
    const preset = getBuiltInPreset("classic-indigo");
    expect(preset.page.theme).toEqual(defaultRadarProps.theme);
    expect(preset.page.font).toEqual(defaultRadarProps.font);
    expect(preset.page.layout).toEqual(defaultRadarProps.layout);
  });
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
cd frontend
pnpm exec vitest run ../tests/unit/frontend/types/presets.test.ts
```

Expected: FAIL because `@/types/presets` and `@/presets/built-in-presets` do not exist.

- [ ] **Step 3: Implement the Zod whitelist schema**

In `frontend/src/types/presets.ts`, build schemas from existing Zod shapes so field types cannot drift:

```ts
import { z } from "zod";
import {
  ComparisonArrowStyleSchema,
  ComparisonPairSchema,
  OverlayHighlightSchema,
  RadarVideoSchema,
} from "./radar";

export const RadarPresetIdSchema = z.enum([
  "classic-indigo",
  "brass-observatory",
  "mint-terminal",
  "crimson-ringside",
  "silver-cartography",
]);

const AttributeLabelOffsetSchema = z.object({
  x: z.number().min(-200).max(200),
  y: z.number().min(-200).max(200),
});

const AttributeLabelOffsetsSchema = z.tuple([
  AttributeLabelOffsetSchema,
  AttributeLabelOffsetSchema,
  AttributeLabelOffsetSchema,
  AttributeLabelOffsetSchema,
  AttributeLabelOffsetSchema,
  AttributeLabelOffsetSchema,
  AttributeLabelOffsetSchema,
  AttributeLabelOffsetSchema,
]);

export const RadarPresetSchema = z.object({
  id: RadarPresetIdSchema,
  page: z.object({
    characterNameAlign: RadarVideoSchema.shape.characterNameAlign,
    theme: RadarVideoSchema.shape.theme,
    font: RadarVideoSchema.shape.font,
    layout: RadarVideoSchema.shape.layout,
    attributeLabelOffsets: AttributeLabelOffsetsSchema,
    slugStyle: RadarVideoSchema.shape.slug.pick({
      fontFamily: true,
      fontSize: true,
      offsetX: true,
      offsetY: true,
      color: true,
    }),
    animationStyle: RadarVideoSchema.shape.animation.pick({
      valuePopupEnabled: true,
      valuePopupStyle: true,
      highValueGlowEnabled: true,
      highValueGlowStyle: true,
    }),
  }),
  comparison: z.object({
    arrowStyle: ComparisonArrowStyleSchema,
    transitionStyle: ComparisonPairSchema.pick({
      polygonMode: true,
      showLegend: true,
      silhouetteSwapOffsetX: true,
      silhouetteSwapOffsetY: true,
      silhouetteFadeOutOpacity: true,
      legendFontSize: true,
      legendOffsetX: true,
      legendOffsetY: true,
      legendFontFamily: true,
      diffTriangleScale: true,
      legendDotRadius: true,
    }),
    overlayStyle: OverlayHighlightSchema.pick({
      dimOpacity: true,
      glowRadius: true,
      arrowSize: true,
      arrowSideOffset: true,
      arrowOffsetY: true,
      nameSideOffset: true,
      silhouetteBaseOpacity: true,
      silhouetteEmphasisOpacity: true,
      silhouetteDimOpacity: true,
    }),
  }),
});

export const BuiltInPresetListSchema = z
  .array(RadarPresetSchema)
  .length(5)
  .superRefine((presets, ctx) => {
    const ids = new Set<string>();
    presets.forEach((preset, index) => {
      if (ids.has(preset.id)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate preset id: ${preset.id}`,
          path: [index, "id"],
        });
      }
      ids.add(preset.id);
    });
  });

export type RadarPresetId = z.infer<typeof RadarPresetIdSchema>;
export type RadarPreset = z.infer<typeof RadarPresetSchema>;
```

- [ ] **Step 4: Implement the five exact token sets**

In `built-in-presets.ts`, define a frozen zero-offset tuple with eight `{x: 0, y: 0}` entries, declare five complete raw objects, parse the array once with `BuiltInPresetListSchema`, and implement lookup with a throwing impossible-state guard.

Use these exact page values:

| id | background / grid / fill / stroke | dot / high / label / value / glow | fonts `name/attr/rating/value` | sizes | layout `cx,cy,rings,stroke,silX,silY,silScale,nameX,nameY,attrX,attrY,ratingX,ratingY,radarScale` |
| - | - | - | - | - | - |
| classic-indigo | `#0a0a1a`; `rgba(255,255,255,0.12)`; `rgba(99,102,241,0.25)`; `rgba(99,102,241,0.8)` | `#818cf8`; `#f59e0b`; `#e2e8f0`; `#f8fafc`; `#f59e0b` | Noto Sans SC / Noto Sans SC / Noto Sans SC / Noto Sans SC | `126/63/45/54` | `1380,540,4,1.5,0,0,1,0,0,0,0,0,0,1` |
| brass-observatory | `#17130D`; `rgba(217,164,65,0.16)`; `rgba(217,164,65,0.22)`; `rgba(217,164,65,0.82)` | `#F6D365`; `#E8793E`; `#F4E7C5`; `#FFF8E7`; `#D9A441` | Noto Serif SC / Noto Serif SC / Rajdhani / Rajdhani | `118/52/42/48` | `1370,540,5,1.4,-15,0,0.95,-18,6,0,4,0,4,0.96` |
| mint-terminal | `#041714`; `rgba(94,234,212,0.14)`; `rgba(94,234,212,0.20)`; `rgba(94,234,212,0.84)` | `#A7F3D0`; `#D9F99D`; `#D1FAE5`; `#ECFDF5`; `#5EEAD4` | Exo 2 / Noto Sans SC / Rajdhani / Rajdhani | `122/54/42/50` | `1390,540,4,1.25,-10,0,0.95,0,-4,6,0,4,0,0.98` |
| crimson-ringside | `#17080C`; `rgba(252,165,165,0.14)`; `rgba(239,68,68,0.24)`; `rgba(239,68,68,0.88)` | `#FCA5A5`; `#FB923C`; `#FFE4E6`; `#FFF1F2`; `#EF4444` | ZCOOL KuaiLe / Noto Sans SC / Russo One / Russo One | `132/58/46/54` | `1375,540,4,2.2,0,8,1.02,0,-8,0,0,0,2,1.02` |
| silver-cartography | `#DCE7EA`; `rgba(30,41,59,0.18)`; `rgba(14,116,144,0.16)`; `rgba(14,116,144,0.82)` | `#155E75`; `#C2410C`; `#1E293B`; `#020617`; `#0284C7` | Noto Serif SC / Noto Sans SC / Rajdhani / Rajdhani | `116/50/40/48` | `1370,540,5,1.2,-10,0,0.92,-12,0,0,0,0,4,0.94` |

Use these remaining page values:

| id | enhance / weaken | silhouette opacity | vignette `enabled,brightness,cx,cy,inner,outer` | slug `family,size,x,y,color` | effect `popup enabled/style; glow enabled/style` |
| - | - | - | - | - | - |
| classic-indigo | `#ef4444` / `#22c55e` | `1` | `true,-30,50,50,0,100` | `Noto Sans SC,36,0,0,#e2e8f0` | `true/spring; true/ring` |
| brass-observatory | `#E8793E` / `#62C6A8` | `0.86` | `true,-36,32,50,8,100` | `Noto Serif SC,34,-12,8,#F4E7C5` | `true/fadeScale; true/pulse` |
| mint-terminal | `#FB7185` / `#A3E635` | `0.84` | `true,-28,55,48,0,100` | `Exo 2,32,0,8,#A7F3D0` | `true/slideIn; true/ripple` |
| crimson-ringside | `#FB923C` / `#34D399` | `0.90` | `true,-34,45,50,0,100` | `ZCOOL KuaiLe,36,0,4,#FFE4E6` | `true/bounce; true/ring` |
| silver-cartography | `#B91C1C` / `#047857` | `0.70` | `true,-18,48,46,12,100` | `Noto Serif SC,32,-8,8,#1E293B` | `true/fadeScale; true/pulse` |

All five use `characterNameAlign: "center"`, `syncSilhouetteOffset: false`, and eight zero attribute label offsets.

Use these exact comparison values:

| id | arrow `size,color,x,y,diffSize,diff+,diff-,diffX,diffY` | transition `polygon,legend,swapX,swapY,fade,legendSize,x,y,font,diffScale,dotRadius` | overlay `dim,glow,arrowSize,arrowSide,arrowY,nameSide,base,emphasis,dimSil` |
| - | - | - | - |
| classic-indigo | `45,#94a3b8,0,0,45,#ef4444,#22c55e,0,0` | `expand,true,80,0,0.3,22,0,0,"",1,6` | `0.15,16,24,92,0,665,0.4,0.85,0.1` |
| brass-observatory | `40,#D9A441,0,0,40,#E8793E,#62C6A8,0,0` | `expand,true,72,0,0.26,20,0,12,Rajdhani,0.9,5.5` | `0.20,10,20,84,2,650,0.34,0.76,0.10` |
| mint-terminal | `42,#5EEAD4,0,0,42,#FB7185,#A3E635,0,0` | `extend,true,80,0,0.22,20,0,4,Rajdhani,1,5` | `0.16,14,22,88,0,660,0.36,0.82,0.08` |
| crimson-ringside | `48,#FCA5A5,0,0,48,#FB923C,#34D399,0,0` | `extend,true,95,0,0.28,24,0,4,Russo One,1.15,7` | `0.14,20,26,100,0,670,0.38,0.90,0.08` |
| silver-cartography | `40,#0E7490,0,0,40,#B91C1C,#047857,0,0` | `expand,true,70,0,0.38,20,0,8,Rajdhani,0.85,5` | `0.28,8,20,84,0,640,0.46,0.72,0.18` |

- [ ] **Step 5: Run the preset tests and verify GREEN**

Run the same targeted Vitest command. Expected: 3 tests PASS and no schema warnings.

- [ ] **Step 6: Run type-adjacent regression tests**

```bash
cd frontend
pnpm exec vitest run ../tests/unit/frontend/types/radar.test.ts ../tests/unit/frontend/types/constants.test.ts ../tests/unit/frontend/types/presets.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add frontend/src/types/presets.ts frontend/src/presets/built-in-presets.ts tests/unit/frontend/types/presets.test.ts
git commit -s -m "feat(presets): 定义五套内置视觉预设" -m "加入类型化表现字段 schema 与五套静态 token。\n\nCo-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Immutable Whitelist Application

**Files:**
- Create: `frontend/src/lib/apply-preset.ts`
- Create: `tests/unit/frontend/lib/apply-preset.test.ts`

**Interfaces:**
- Consumes: `RadarPreset`, `MultiPageConfig`, `defaultOverlayHighlightConfig`.
- Produces: `applyPresetToPage(page: RadarVideoProps, preset: RadarPreset): RadarVideoProps` for sampling and config composition.
- Produces: `applyPresetToConfig(config: MultiPageConfig, preset: RadarPreset): MultiPageConfig` for editor behavior.

- [ ] **Step 1: Write a rich sentinel fixture and failing preservation tests**

Create two pages with distinct names, attributes, values, label offsets, animation timings, slugs, backgrounds, `overrideIgnored`, two comparisons (one transition, one overlay), a populated global override and sentinel music URL. Use literal assertions, not a helper shared with production.

The core tests must include:

```ts
it("只替换全部页面的白名单表现字段", () => {
  const before = makeSentinelConfig();
  const snapshot = structuredClone(before);
  const preset = getBuiltInPreset("mint-terminal");

  const result = applyPresetToConfig(before, preset);

  expect(result.pages.map((page) => page.theme.backgroundColor)).toEqual([
    "#041714",
    "#041714",
    "#041714",
    "#041714",
  ]);
  expect(result.pages.map((page) => page.font.characterNameFamily)).toEqual([
    "Exo 2",
    "Exo 2",
    "Exo 2",
    "Exo 2",
  ]);
  expect(result.pages[0].attributes[0].labelOffsetX).toBe(0);
  expect(result.pages[0].attributes[0].label).toBe("力量");
  expect(result.pages[0].attributes[0].value).toBe(91);
  expect(before).toEqual(snapshot);
});

it("保留页面内容、素材、模式和所有时序字段", () => {
  const before = makeSentinelConfig();
  const result = applyPresetToConfig(
    before,
    getBuiltInPreset("crimson-ringside"),
  );

  expect(result.pages.map((page) => page.characterName)).toEqual([
    "甲", "乙", "丙", "丁",
  ]);
  expect(result.pages[0].attributes.map((attribute) => attribute.value)).toEqual([
    91, 42, 73, 64, 58, 86, 37, 79,
  ]);
  expect(result.pages[0].animation.fillDuration).toBe(77);
  expect(result.pages[0].animation.highValueThreshold).toBe(88);
  expect(result.pages[0].slug.text).toBe("用户副标题");
  expect(result.pages[0].slug.fadeOffsetFrames).toBe(27);
  expect(result.pages[0].silhouetteSrc).toBe("silhouettes/user-a.png");
  expect(result.pages[0].background).toEqual({
    type: "image",
    media: expect.objectContaining({ src: "user-background.png" }),
  });
  expect(result.comparisons.map((comparison) => comparison.layout)).toEqual([
    "transition",
    "overlay",
  ]);
  expect(result.comparisons[0].delayFrames).toBe(31);
  expect(result.comparisons[0].swapDurationFrames).toBe(29);
  expect(result.comparisons[1].overlay.highlightOrder).toBe("right-first");
  expect(result.comparisons[1].overlay.holdFrames).toBe(93);
  expect(result.musicUrl).toBe("music/user-track.flac");
});

it("同步 global override 的样式值但保留 enabled", () => {
  const before = makeSentinelConfig();
  const enabled = structuredClone(before.globalOverride?.enabled);
  const result = applyPresetToConfig(
    before,
    getBuiltInPreset("silver-cartography"),
  );

  expect(result.globalOverride?.enabled).toEqual(enabled);
  expect(result.globalOverride?.values.theme.backgroundColor).toBe("#DCE7EA");
  expect(result.globalOverride?.values.animation.fillDuration).toBe(77);
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

```bash
cd frontend
pnpm exec vitest run ../tests/unit/frontend/lib/apply-preset.test.ts
```

Expected: FAIL because `apply-preset.ts` does not exist.

- [ ] **Step 3: Implement page-level immutable application**

Implement `applyPresetToPage` with this exact merge boundary:

```ts
export function applyPresetToPage(
  page: RadarVideoProps,
  preset: RadarPreset,
): RadarVideoProps {
  const attributes = page.attributes.map((attribute, index) => ({
    ...attribute,
    labelOffsetX: preset.page.attributeLabelOffsets[index].x,
    labelOffsetY: preset.page.attributeLabelOffsets[index].y,
  })) as RadarVideoProps["attributes"];

  return {
    ...page,
    characterNameAlign: preset.page.characterNameAlign,
    attributes,
    theme: { ...preset.page.theme },
    font: { ...preset.page.font },
    layout: { ...preset.page.layout },
    slug: { ...page.slug, ...preset.page.slugStyle },
    animation: { ...page.animation, ...preset.page.animationStyle },
  };
}
```

- [ ] **Step 4: Implement config-level immutable application**

Map every page and comparison. For old raw configs with missing overlay, merge in this order:

```ts
overlay: {
  ...defaultOverlayHighlightConfig,
  ...comparison.overlay,
  ...preset.comparison.overlayStyle,
}
```

Spread `comparison` first, then `preset.comparison.transitionStyle`, then the nested overlay. Replace top-level `comparisonArrowStyle` with a cloned preset arrow style. Only create/update `globalOverride` when the input contains it; run `applyPresetToPage` on `globalOverride.values` and retain the same enabled map values.

- [ ] **Step 5: Run the targeted test and verify GREEN**

Expected: every preservation and application test PASS.

- [ ] **Step 6: Mutation-check the whitelist**

Temporarily remove the `animation: { ...page.animation, ...preset.page.animationStyle }` merge and confirm the style assertion fails; restore it. Temporarily spread a full default page over `page` and confirm the preservation test fails; restore the whitelist implementation. Run the targeted file once more and confirm PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add frontend/src/lib/apply-preset.ts tests/unit/frontend/lib/apply-preset.test.ts
git commit -s -m "feat(presets): 按白名单应用全局视觉样式" -m "保留用户内容、比较模式与时序，仅同步页面和对比表现字段。\n\nCo-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Accessible Preset Selector

**Files:**
- Create: `frontend/src/components/editor/PresetSelector.tsx`
- Create: `tests/unit/frontend/components/editor/PresetSelector.test.tsx`
- Modify: `frontend/messages/zh.json`
- Modify: `frontend/messages/en.json`

**Interfaces:**
- Consumes: `BUILT_IN_PRESETS`, `RadarPreset`.
- Produces: `PresetSelector({ onApply }: { onApply: (preset: RadarPreset) => void })`.

- [ ] **Step 1: Add the exact i18n contract**

Under `editor.presets`, add `title`, `description`, `applyLabel`, and a `items` object. Exact zh values:

```json
{
  "title": "视觉预设",
  "description": "仅统一全部页面的颜色、字体、字号与布局偏移；页面内容、比较模式和动画时序保持不变。",
  "applyLabel": "应用「{name}」到全部页面",
  "items": {
    "classic-indigo": { "name": "经典靛蓝", "description": "兼容现有视觉的靛蓝与琥珀基线" },
    "brass-observatory": { "name": "黄铜观测站", "description": "低光泽黄铜测量仪与象牙刻度" },
    "mint-terminal": { "name": "薄荷终端", "description": "深青实验监测屏与薄荷数据线" },
    "crimson-ringside": { "name": "赤红擂台", "description": "赛事计分牌式红色冲击与暖橙高值" },
    "silver-cartography": { "name": "雾银制图", "description": "浅色极地测绘稿与深青制图线" }
  }
}
```

Exact en values:

```json
{
  "title": "Visual presets",
  "description": "Unifies colors, typography, sizing, and layout offsets across every page. Content, comparison modes, and animation timing stay unchanged.",
  "applyLabel": "Apply {name} to all pages",
  "items": {
    "classic-indigo": { "name": "Classic Indigo", "description": "The existing indigo and amber visual baseline" },
    "brass-observatory": { "name": "Brass Observatory", "description": "Low-gloss brass instruments with ivory scales" },
    "mint-terminal": { "name": "Mint Terminal", "description": "A deep-teal lab monitor with mint data lines" },
    "crimson-ringside": { "name": "Crimson Ringside", "description": "Broadcast scoreboard reds with warm-orange highs" },
    "silver-cartography": { "name": "Silver Cartography", "description": "A pale polar chart with deep-teal drafting lines" }
  }
}
```

- [ ] **Step 2: Write failing component behavior tests**

Test five real buttons, literal Chinese names, the preservation explanation, visible swatches derived from each theme, and callback identity:

```ts
it("展示五个明确作用于全部页面的可访问 preset 按钮", () => {
  render(<PresetSelector onApply={() => {}} />);
  expect(screen.getAllByRole("button")).toHaveLength(5);
  expect(screen.getByText("页面内容、比较模式和动画时序保持不变。", { exact: false })).toBeVisible();
  expect(screen.getByRole("button", {
    name: "应用「黄铜观测站」到全部页面",
  })).toBeVisible();
});

it("点击卡片把对应的已解析 preset 交给调用方", () => {
  const onApply = vi.fn();
  render(<PresetSelector onApply={onApply} />);
  fireEvent.click(screen.getByRole("button", {
    name: "应用「薄荷终端」到全部页面",
  }));
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply.mock.calls[0][0].id).toBe("mint-terminal");
});
```

- [ ] **Step 3: Run the targeted test and verify RED**

Expected: FAIL because `PresetSelector` does not exist.

- [ ] **Step 4: Implement the compact responsive cards**

Use a semantic section with heading/description and a responsive grid (`grid-cols-1 sm:grid-cols-2 2xl:grid-cols-5`). Each native button:

- uses `type="button"` and `aria-label={t("applyLabel", { name })}`;
- calls `onApply(preset)`;
- shows name, one-line description, four circular swatches from `backgroundColor`, `gridStrokeColor`, `highValueDotColor`, `labelColor`;
- shows `Aa / 雷` with `fontFamily: preset.page.font.characterNameFamily`;
- uses existing border/background/focus token classes and no persistent selected state.

- [ ] **Step 5: Run targeted test and verify GREEN**

Expected: selector tests PASS with real translation mock and real built-in presets.

- [ ] **Step 6: Commit Task 3**

```bash
git add frontend/src/components/editor/PresetSelector.tsx tests/unit/frontend/components/editor/PresetSelector.test.tsx frontend/messages/zh.json frontend/messages/en.json
git commit -s -m "feat(editor): 添加可访问视觉预设选择器" -m "展示五套风格缩略卡并明确应用范围与数据守恒。\n\nCo-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Wire Presets Through ThemeEditor to the Whole Config

**Files:**
- Modify: `frontend/src/components/editor/ThemeEditor.tsx`
- Modify: `frontend/src/components/editor/PageConfigPanel.tsx`
- Modify: `frontend/src/components/editor/RadarEditor.tsx`
- Modify: `tests/unit/frontend/components/editor/ThemeEditor.test.tsx`
- Modify: `tests/unit/frontend/components/editor/PageConfigPanel.test.tsx`
- Modify: `tests/unit/frontend/components/editor/RadarEditor.test.tsx`
- Create: `tests/dev-integration/frontend/components/editor/RadarEditor.test.tsx`

**Interfaces:**
- `ThemeEditor` gains optional `onApplyPreset?: (preset: RadarPreset) => void` and renders selector before color fields when provided.
- `PageConfigPanel` gains required `onApplyPreset: (preset: RadarPreset) => void` and passes it to `ThemeEditor`.
- `RadarEditor` owns `applyPreset(preset)` and updates `setConfig((current) => applyPresetToConfig(current, preset))`.

- [ ] **Step 1: Write failing ThemeEditor composition test**

Add a test that passes `onApplyPreset`, clicks the real “经典靛蓝” button, and asserts the callback receives id `classic-indigo`. Also retain an existing render without the optional prop to prove old isolated usage remains valid.

- [ ] **Step 2: Run ThemeEditor test and verify RED**

Expected: FAIL because the prop and selector composition are absent.

- [ ] **Step 3: Implement ThemeEditor composition and verify GREEN**

Import `RadarPreset` and `PresetSelector`. Render it above the current title/color grid only when `onApplyPreset` is defined; do not move or alter the existing `onChange` color behavior.

- [ ] **Step 4: Write failing PageConfigPanel passthrough test**

In the existing mirrored test, pass `onApplyPreset={vi.fn()}`, click “雾银制图”, and assert that callback receives `silver-cartography`. Keep `ThemeEditor` real; mock only unrelated heavyweight child editors already mocked by that test.

- [ ] **Step 5: Implement PageConfigPanel passthrough and verify GREEN**

Add the required prop and pass it directly to `ThemeEditor`.

- [ ] **Step 6: Write failing RadarEditor ownership test**

Extend the existing `PageConfigPanel` test double with a button that calls:

```ts
p.onApplyPreset(getBuiltInPreset("mint-terminal"))
```

Expose enough literal state from the double to assert the page theme, font, name, animation fillDuration and value. Load `makeRichConfig()`, click the preset through page 0, then assert all four page theme/font values changed while names stay `P0,P1,P2,P3`, both comparison pairs remain `0-1,2-3`, and the known fill duration/value remain unchanged.

- [ ] **Step 7: Implement RadarEditor ownership and verify GREEN**

Add:

```ts
const applyPreset = useCallback((preset: RadarPreset) => {
  setConfig((current) => applyPresetToConfig(current, preset));
}, []);
```

Pass `onApplyPreset={applyPreset}` to every `PageConfigPanel`.

- [ ] **Step 8: Write the dev-integration user-flow test**

Render real `RadarEditor`, real `PageConfigPanel`, real `ThemeEditor`, real `PresetSelector` and real `applyPresetToConfig`. Mock only Preview/asset/task/export components and make `ConfigPersistencePanel` expose a load button for a complete four-page fixture. Drive the actual tabs/buttons:

1. load the fixture;
2. open the pages tab and first page panel;
3. click “应用「赤红擂台」到全部页面”;
4. switch between first and comparison-secondary pages;
5. assert their visible theme color/font controls reflect the same preset;
6. assert page names and comparison layout labels remain unchanged.

The fixture must include one transition pair and one overlay pair so one interaction covers all three modes' configuration paths without process-external I/O.

- [ ] **Step 9: Run focused unit and integration tests**

```bash
cd frontend
pnpm exec vitest run ../tests/unit/frontend/components/editor/ThemeEditor.test.tsx ../tests/unit/frontend/components/editor/PageConfigPanel.test.tsx ../tests/unit/frontend/components/editor/RadarEditor.test.tsx
pnpm exec vitest run --config vitest.integration.config.ts ../tests/dev-integration/frontend/components/editor/RadarEditor.test.tsx
```

Expected: all focused files PASS with no missing i18n keys or React warnings.

- [ ] **Step 10: Commit Task 4**

```bash
git add frontend/src/components/editor/ThemeEditor.tsx frontend/src/components/editor/PageConfigPanel.tsx frontend/src/components/editor/RadarEditor.tsx tests/unit/frontend/components/editor/ThemeEditor.test.tsx tests/unit/frontend/components/editor/PageConfigPanel.test.tsx tests/unit/frontend/components/editor/RadarEditor.test.tsx tests/dev-integration/frontend/components/editor/RadarEditor.test.tsx
git commit -s -m "feat(editor): 将预设应用到整份多页配置" -m "串联主题编辑器与 RadarEditor，保持页面内容、模式和时序不变。\n\nCo-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Pure Three-mode Sampling Fixture

**Files:**
- Create: `frontend/src/remotion/sampling/sample-config.ts`
- Create: `tests/unit/frontend/remotion/sampling/sample-config.test.ts`

**Interfaces:**
- Produces: `PresetSampleMode = "standard" | "transition" | "overlay"`.
- Produces: `buildPresetSampleConfig(presetId: RadarPresetId, mode: PresetSampleMode): MultiPageConfig`.
- The sampling composition consumes only this pure builder.

- [ ] **Step 1: Write failing mode/data invariant tests**

Use literals to assert:

```ts
it.each([
  ["standard", 1, []],
  ["transition", 2, ["transition"]],
  ["overlay", 2, ["overlay"]],
] as const)("构造 %s 采样配置", (mode, pageCount, layouts) => {
  const config = buildPresetSampleConfig("brass-observatory", mode);
  expect(config.pages).toHaveLength(pageCount);
  expect(config.comparisons.map((item) => item.layout)).toEqual(layouts);
  expect(config.pages.map((page) => page.theme.backgroundColor)).toEqual(
    Array(pageCount).fill("#17130D"),
  );
});

it("五套 preset 的演示内容与时序完全一致", () => {
  const classic = buildPresetSampleConfig("classic-indigo", "overlay");
  const silver = buildPresetSampleConfig("silver-cartography", "overlay");
  expect(silver.pages.map((page) => page.characterName)).toEqual(
    classic.pages.map((page) => page.characterName),
  );
  expect(silver.pages.map((page) => page.attributes.map((a) => a.value))).toEqual(
    classic.pages.map((page) => page.attributes.map((a) => a.value)),
  );
  expect(silver.pages.map((page) => page.animation.fillDuration)).toEqual(
    classic.pages.map((page) => page.animation.fillDuration),
  );
});
```

- [ ] **Step 2: Run test and verify RED**

Expected: FAIL because sampling builder is absent.

- [ ] **Step 3: Implement fixed demo pages and mode builder**

Use two deep-cloned pages derived from `defaultRadarProps`:

- page A name `ORION`, silhouette `silhouettes/anthropic.png`, values `[91, 72, 84, 63, 78, 69, 88, 76]`;
- page B name `LYRA`, silhouette `silhouettes/openai.png`, values `[76, 89, 71, 82, 66, 92, 73, 87]`;
- labels remain `Strength/Agility/Intelligence/Endurance/Charisma/Luck/Defense/Speed` and existing short labels;
- both use exactly the default animation object and empty background/media/music changes;
- standard returns page A only with no comparison;
- comparison modes return A+B and one parsed default comparison whose layout is the requested mode;
- call `applyPresetToConfig` last so both roles and comparison visuals receive the same style.

- [ ] **Step 4: Run sampling builder and apply-preset tests; verify GREEN**

```bash
cd frontend
pnpm exec vitest run ../tests/unit/frontend/remotion/sampling/sample-config.test.ts ../tests/unit/frontend/lib/apply-preset.test.ts
```

- [ ] **Step 5: Commit Task 5**

```bash
git add frontend/src/remotion/sampling/sample-config.ts tests/unit/frontend/remotion/sampling/sample-config.test.ts
git commit -s -m "test(remotion): 定义三模式预设采样配置" -m "固定标准、切换与叠加模式的数据和时序，保证五套风格可公平比较。\n\nCo-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Remotion Frame Sampler and Five Contact Sheets

**Files:**
- Create: `frontend/src/remotion/sampling/PresetSampleComposition.tsx`
- Create: `frontend/src/remotion/sampling/PresetSampleRoot.tsx`
- Create: `frontend/src/remotion/sampling/index.ts`
- Create: `frontend/scripts/sample-presets.mjs`
- Modify: `frontend/package.json`
- Modify: `.gitignore`

**Interfaces:**
- Sampling composition props: `{ presetId: RadarPresetId; mode: PresetSampleMode }`.
- Composition id: `PresetSample`.
- Script output: `.preset-samples/raw/<preset>/<mode>-<frame>.png`, `.preset-samples/contact-sheets/<preset>.png`, `.preset-samples/manifest.json`.

- [ ] **Step 1: Implement the sampling composition registry**

`PresetSampleComposition` calls `buildPresetSampleConfig` and renders `<MultiPageVideo config={config} />`. `PresetSampleRoot` registers one 1920×1080, 30 fps composition with default props `{presetId: "classic-indigo", mode: "standard"}` and `calculateMetadata` that rebuilds config and computes the true duration using the same page/comparison duration traversal as production `RemotionRoot`. `index.ts` calls `registerRoot(PresetSampleRoot)`.

- [ ] **Step 2: Write the Node sampler using the verified Remotion 4 API**

The script must:

1. resolve `src/remotion/sampling/index.ts` and call `bundle({entryPoint, webpackOverride})` once;
2. call `openBrowser("chrome", {logLevel: "warn"})` once and close it in `finally` with `await browser.close({silent: true})`;
3. for every preset id and mode call `selectComposition({serveUrl, id: "PresetSample", inputProps})`;
4. derive four unique frames from clamped ratios `[0.18, 0.42, 0.68, 0.88]` of `durationInFrames - 1`;
5. call `renderStill` with the same `inputProps`, selected composition, absolute PNG output, exact `frame`, `imageFormat: "png"`, `puppeteerInstance: browser`, `overwrite: true`, and `logLevel: "warn"`;
6. choose representative ratios `standard=0.68`, `transition=0.68`, `overlay=0.68` initially and record all raw paths/frames in manifest;
7. launch existing Playwright `chromium` once, render one 1920 px-wide HTML contact sheet per preset with a title strip and three equal columns labelled `标准 / Standard`, `切换对比 / Transition`, `叠加对比 / Overlay`, and close that browser in `finally`;
8. exit non-zero on missing output or render error; never swallow errors.

Import `webpackOverride` from `../src/remotion/webpack-override.mjs`. Do not use `getCompositions` and do not bundle inside loops.

- [ ] **Step 3: Add command and ignore rule**

Add to `frontend/package.json` scripts:

```json
"sample:presets": "node scripts/sample-presets.mjs"
```

Add `frontend/.preset-samples/` to root `.gitignore`.

- [ ] **Step 4: Run the actual script as its behavioral test**

```bash
cd frontend
pnpm sample:presets
```

Expected behavior:

- exit code 0;
- 5 presets × 3 modes × 4 raw frames = 60 raw PNGs;
- exactly 5 contact-sheet PNGs;
- manifest has 15 mode records, each with four distinct in-range frames;
- no sampling composition is added to product `src/remotion/Root.tsx`.

- [ ] **Step 5: Check generated artifact counts and dimensions**

Use PowerShell read-only checks plus image metadata from Playwright or `identify` if installed. Assert literal counts 60 and 5 and every contact sheet width 1920. Treat any mismatch as failure and fix the script, not the expected count.

- [ ] **Step 6: Commit Task 6**

Generated `.preset-samples/` files remain ignored. Commit only source/config:

```bash
git add frontend/src/remotion/sampling/PresetSampleComposition.tsx frontend/src/remotion/sampling/PresetSampleRoot.tsx frontend/src/remotion/sampling/index.ts frontend/scripts/sample-presets.mjs frontend/package.json .gitignore
git commit -s -m "chore(remotion): 添加预设逐帧采样工具" -m "一次 bundle 并复用浏览器，输出关键帧、manifest 与五张三模式联系表。\n\nCo-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Visual Critique and Token Refinement

**Files:**
- Modify as evidence requires: `frontend/src/presets/built-in-presets.ts`
- Regenerate ignored artifacts: `frontend/.preset-samples/**`

**Interfaces:**
- No new API. This task refines only existing token values under schema/invariant tests.

- [ ] **Step 1: Inspect raw frames and five contact sheets with multimodal vision**

Open representative early/mid/late raw frames for every preset and all five contact sheets. Record findings per preset against these literal checks:

- no clipped name, label, rating or legend;
- no obvious label/radar/name collision at 1920×1080;
- readable Latin text and stable selected font;
- same theme/font/layout offsets in standard, transition and overlay;
- both comparison polygons and enhance/weaken markers distinguishable;
- highlight vs dim states distinguishable without making the dim side disappear;
- silver preset retains sufficient text/grid contrast;
- glow is subordinate to data and does not bloom across labels.

- [ ] **Step 2: Refine only token values that fail visual checks**

Do not add decorations or change rendering components. Tune theme/font/layout/comparison visual constants only. This is the REFACTOR phase under already-green schema and preservation tests; exact palette values are intentionally not asserted as change detectors, so sampled pixels are the authoritative aesthetic evidence.

- [ ] **Step 3: Re-run invariant tests after every refinement batch**

```bash
cd frontend
pnpm exec vitest run ../tests/unit/frontend/types/presets.test.ts ../tests/unit/frontend/lib/apply-preset.test.ts ../tests/unit/frontend/remotion/sampling/sample-config.test.ts
```

If `classic-indigo` changes, its compatibility test must fail; restore it rather than weakening the test.

- [ ] **Step 4: Regenerate all samples and repeat inspection**

Run `pnpm sample:presets` after each batch. Stop only when all checks pass for all five presets. Select the best representative frame per mode from the already-rendered four frames and update the contact-sheet selection logic if a non-0.68 sample better exposes the final style; regenerate once more.

- [ ] **Step 5: Commit visual refinements if source tokens changed**

```bash
git add frontend/src/presets/built-in-presets.ts
git commit -s -m "style(presets): 按逐帧检查优化视觉 token" -m "修正采样中发现的对比度、碰撞或高亮层级问题。\n\nCo-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>"
```

Skip this commit only if Task 6's initial token values pass all visual checks unchanged.

---

### Task 8: Full Verification and Screenshot Handoff

**Files:**
- Modify if applicable: `ROADMAP.md`
- Generated but ignored: `frontend/.preset-samples/contact-sheets/*.png`

**Interfaces:**
- Produces five local PNG paths for user review before Issue/PR completion.

- [ ] **Step 1: Update the roadmap behavior, if the preset panel item is still unchecked**

Change only `ROADMAP.md`'s “Rendering UX — preset panels” line so it accurately states that the built-in preset panel is delivered while export/performance work remains open. Do not mark unrelated roadmap work complete.

- [ ] **Step 2: Run fresh complete frontend verification**

Run sequentially from `frontend/`:

```bash
pnpm test:unit
pnpm test:integration
pnpm lint
pnpm build
pnpm sample:presets
```

Read complete output and require exit code 0 for every command. Confirm coverage stays above repository thresholds and no new warnings originate from preset code.

- [ ] **Step 3: Perform requirement-by-requirement audit**

Inspect current files and artifacts and record evidence for:

1. exactly five schema-valid built-ins;
2. all three modes use the same style per preset;
3. whitelist tests prove user names/values/assets/modes/timing stay intact;
4. branch/worktree isolation and DCO commits;
5. 60 raw frame samples and five final contact sheets;
6. multimodal review completed against every visual criterion;
7. Issue #42 still contains the corrected preset semantics.

- [ ] **Step 4: Commit roadmap/final source-only changes**

```bash
git add ROADMAP.md
git commit -s -m "docs(roadmap): 记录内置预设面板进展" -m "保留导出与性能调优为后续工作。\n\nCo-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>"
```

Skip when ROADMAP does not require a truthful scoped edit.

- [ ] **Step 5: Present the five screenshots and pause for visual approval**

Return clickable links/images for these exact files:

```text
frontend/.preset-samples/contact-sheets/classic-indigo.png
frontend/.preset-samples/contact-sheets/brass-observatory.png
frontend/.preset-samples/contact-sheets/mint-terminal.png
frontend/.preset-samples/contact-sheets/crimson-ringside.png
frontend/.preset-samples/contact-sheets/silver-cartography.png
```

Include branch, worktree, commits, verification counts and any visual refinements. Do not close Issue #42, create a PR, merge, or mark the thread goal complete before the user approves these screenshots.

---

## Plan Self-review

- Spec coverage: Tasks 1–4 cover typed presets, whitelist preservation and UI; Tasks 5–7 cover three-mode multi-frame sampling and visual iteration; Task 8 covers full gates and the required screenshot-first handoff.
- Placeholder scan: every implementation step names its concrete interface, behavior, command and artifact path.
- Type consistency: `RadarPresetId` → `getBuiltInPreset` → `applyPresetToConfig` → editor and sample builder use the same parsed object; mode union is shared by sample builder and composition.
- Constraint audit: no backend/dependency/lockfile changes, no product sampling composition, no user data overwrite, no issue closure before screenshot approval.
