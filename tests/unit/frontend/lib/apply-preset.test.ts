import { describe, expect, it } from "vitest";
import { applyPresetToConfig, applyPresetToPage } from "@/lib/apply-preset";
import { getBuiltInPreset } from "@/presets/built-in-presets";
import {
  defaultMultiPageConfig,
  defaultOverlayHighlightConfig,
  defaultRadarProps,
} from "@/types/constants";
import {
  ComparisonPairSchema,
  type MultiPageConfig,
  type RadarVideoProps,
} from "@/types/radar";

const VALUES = [91, 42, 73, 64, 58, 86, 37, 79] as const;

function makePage(name: string, silhouetteSrc: string): RadarVideoProps {
  const page = structuredClone(defaultRadarProps);
  return {
    ...page,
    characterName: name,
    silhouetteSrc,
    slug: {
      ...page.slug,
      text: "用户副标题",
      fadeOffsetFrames: 27,
    },
    attributes: page.attributes.map((attribute, index) => ({
      ...attribute,
      label: index === 0 ? "力量" : attribute.label,
      value: VALUES[index],
      labelOffsetX: 31 + index,
      labelOffsetY: -21 - index,
    })) as RadarVideoProps["attributes"],
    animation: {
      ...page.animation,
      fillDuration: 77,
      holdDuration: 123,
      highValueThreshold: 88,
    },
    background: {
      type: "image",
      media: {
        src: "user-background.png",
        opacity: 0.73,
        blur: 2,
        scale: "cover",
        position: "center",
        videoOptions: {
          loop: true,
          muted: true,
          playbackRate: 1,
          startFrom: 0,
        },
      },
    },
    overrideIgnored: { "theme.backgroundColor": true },
  };
}

function makeSentinelConfig(): MultiPageConfig {
  const pages = [
    makePage("甲", "silhouettes/user-a.png"),
    makePage("乙", "silhouettes/user-b.png"),
    makePage("丙", "silhouettes/user-c.png"),
    makePage("丁", "silhouettes/user-d.png"),
  ];
  const transition = ComparisonPairSchema.parse({
    firstPageIndex: 0,
    secondPageIndex: 1,
    layout: "transition",
    delayFrames: 31,
    swapDurationFrames: 29,
  });
  const overlay = ComparisonPairSchema.parse({
    firstPageIndex: 2,
    secondPageIndex: 3,
    layout: "overlay",
    overlay: {
      ...defaultOverlayHighlightConfig,
      highlightOrder: "right-first",
      holdFrames: 93,
      holdTailFrames: 117,
    },
  });

  return {
    ...structuredClone(defaultMultiPageConfig),
    pages,
    comparisons: [transition, overlay],
    musicUrl: "music/user-track.flac",
    globalOverride: {
      enabled: {
        "theme.backgroundColor": true,
        "animation.fillDuration": true,
      },
      values: structuredClone(pages[0]),
    },
  };
}

describe("applyPresetToPage", () => {
  it("只替换页面表现字段并保持原对象不变", () => {
    const before = makePage("甲", "silhouettes/user-a.png");
    const snapshot = structuredClone(before);

    const result = applyPresetToPage(
      before,
      getBuiltInPreset("brass-observatory"),
    );

    expect(result.theme.backgroundColor).toBe("#17130D");
    expect(result.font.characterNameFamily).toBe("Noto Serif SC");
    expect(result.attributes[0].labelOffsetX).toBe(0);
    expect(result.characterName).toBe("甲");
    expect(result.animation.fillDuration).toBe(77);
    expect(before).toEqual(snapshot);
  });
});

describe("applyPresetToConfig", () => {
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
    expect(result.pages[0].animation.valuePopupStyle).toBe("slideIn");
    expect(result.pages[0].animation.highValueGlowStyle).toBe("ripple");
    expect(before).toEqual(snapshot);
  });

  it("保留页面内容、素材、模式和所有时序字段", () => {
    const before = makeSentinelConfig();
    const result = applyPresetToConfig(
      before,
      getBuiltInPreset("crimson-ringside"),
    );

    expect(result.pages.map((page) => page.characterName)).toEqual([
      "甲",
      "乙",
      "丙",
      "丁",
    ]);
    expect(
      result.pages[0].attributes.map((attribute) => attribute.value),
    ).toEqual([91, 42, 73, 64, 58, 86, 37, 79]);
    expect(result.pages[0].animation.fillDuration).toBe(77);
    expect(result.pages[0].animation.holdDuration).toBe(123);
    expect(result.pages[0].animation.highValueThreshold).toBe(88);
    expect(result.pages[0].slug.text).toBe("用户副标题");
    expect(result.pages[0].slug.fadeOffsetFrames).toBe(27);
    expect(result.pages[0].silhouetteSrc).toBe("silhouettes/user-a.png");
    expect(result.pages[0].background).toEqual({
      type: "image",
      media: expect.objectContaining({ src: "user-background.png" }),
    });
    expect(result.pages[0].overrideIgnored).toEqual({
      "theme.backgroundColor": true,
    });
    expect(result.comparisons.map((comparison) => comparison.layout)).toEqual([
      "transition",
      "overlay",
    ]);
    expect(
      result.comparisons.map((comparison) => [
        comparison.firstPageIndex,
        comparison.secondPageIndex,
      ]),
    ).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(result.comparisons[0].delayFrames).toBe(31);
    expect(result.comparisons[0].swapDurationFrames).toBe(29);
    expect(result.comparisons[1].overlay.highlightOrder).toBe("right-first");
    expect(result.comparisons[1].overlay.holdFrames).toBe(93);
    expect(result.comparisons[1].overlay.holdTailFrames).toBe(117);
    expect(result.musicUrl).toBe("music/user-track.flac");
  });

  it("同步 comparison 视觉字段但不改变布局和时序", () => {
    const before = makeSentinelConfig();
    const result = applyPresetToConfig(
      before,
      getBuiltInPreset("silver-cartography"),
    );

    expect(result.comparisonArrowStyle.arrowColor).toBe("#0E7490");
    expect(result.comparisons[0].legendFontFamily).toBe("Rajdhani");
    expect(result.comparisons[1].overlay.glowRadius).toBe(8);
    expect(result.comparisons[1].overlay.holdFrames).toBe(93);
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

  it("不为原本没有 global override 的配置创建 override", () => {
    const before = makeSentinelConfig();
    delete before.globalOverride;
    const result = applyPresetToConfig(
      before,
      getBuiltInPreset("classic-indigo"),
    );

    expect(result.globalOverride).toBeUndefined();
  });
});
