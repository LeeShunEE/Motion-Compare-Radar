import { describe, expect, it } from "vitest";
import { buildPresetSampleConfig } from "@/remotion/sampling/sample-config";

describe("buildPresetSampleConfig", () => {
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

  it("固定两页的名称、剪影与属性值", () => {
    const config = buildPresetSampleConfig("classic-indigo", "overlay");

    expect(config.pages.map((page) => page.characterName)).toEqual([
      "ORION",
      "LYRA",
    ]);
    expect(config.pages.map((page) => page.silhouetteSrc)).toEqual([
      "silhouettes/anthropic.png",
      "silhouettes/openai.png",
    ]);
    expect(
      config.pages[0].attributes.map((attribute) => attribute.value),
    ).toEqual([91, 72, 84, 63, 78, 69, 88, 76]);
    expect(
      config.pages[1].attributes.map((attribute) => attribute.value),
    ).toEqual([76, 89, 71, 82, 66, 92, 73, 87]);
  });

  it("五套 preset 的演示内容与时序完全一致", () => {
    const classic = buildPresetSampleConfig("classic-indigo", "overlay");
    const silver = buildPresetSampleConfig("silver-cartography", "overlay");

    expect(silver.pages.map((page) => page.characterName)).toEqual(
      classic.pages.map((page) => page.characterName),
    );
    expect(
      silver.pages.map((page) => page.attributes.map((a) => a.value)),
    ).toEqual(classic.pages.map((page) => page.attributes.map((a) => a.value)));
    expect(silver.pages.map((page) => page.animation.fillDuration)).toEqual(
      classic.pages.map((page) => page.animation.fillDuration),
    );
    expect(silver.comparisons[0].overlay.highlightOrder).toBe(
      classic.comparisons[0].overlay.highlightOrder,
    );
    expect(silver.comparisons[0].overlay.transitionFrames).toBe(
      classic.comparisons[0].overlay.transitionFrames,
    );
  });
});
