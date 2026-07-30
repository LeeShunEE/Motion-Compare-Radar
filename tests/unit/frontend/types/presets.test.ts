import { describe, expect, it } from "vitest";
import { BUILT_IN_PRESETS, getBuiltInPreset } from "@/presets/built-in-presets";
import { BuiltInPresetListSchema, RadarPresetSchema } from "@/types/presets";
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
    const duplicate = [...BUILT_IN_PRESETS.slice(0, 4), BUILT_IN_PRESETS[0]];
    expect(() => BuiltInPresetListSchema.parse(duplicate)).toThrow();
  });

  it("经典靛蓝与当前默认视觉保持等价", () => {
    const preset = getBuiltInPreset("classic-indigo");
    expect(preset.page.theme).toEqual(defaultRadarProps.theme);
    expect(preset.page.font).toEqual(defaultRadarProps.font);
    expect(preset.page.layout).toEqual(defaultRadarProps.layout);
  });
});
