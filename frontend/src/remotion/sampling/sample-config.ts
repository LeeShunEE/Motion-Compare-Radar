import { applyPresetToConfig } from "../../lib/apply-preset";
import { getBuiltInPreset } from "../../presets/built-in-presets";
import {
  defaultMultiPageConfig,
  defaultRadarProps,
} from "../../types/constants";
import type { RadarPresetId } from "../../types/presets";
import {
  ComparisonPairSchema,
  RadarVideoSchema,
  type MultiPageConfig,
  type RadarVideoProps,
} from "../../types/radar";

export type PresetSampleMode = "standard" | "transition" | "overlay";

const ORION_VALUES = [91, 72, 84, 63, 78, 69, 88, 76] as const;
const LYRA_VALUES = [76, 89, 71, 82, 66, 92, 73, 87] as const;

function buildSamplePage(
  characterName: string,
  silhouetteSrc: string,
  values: readonly number[],
): RadarVideoProps {
  return RadarVideoSchema.parse({
    ...defaultRadarProps,
    characterName,
    silhouetteSrc,
    attributes: defaultRadarProps.attributes.map((attribute, index) => ({
      ...attribute,
      value: values[index],
    })),
  });
}

export function buildPresetSampleConfig(
  presetId: RadarPresetId,
  mode: PresetSampleMode,
): MultiPageConfig {
  const orion = buildSamplePage(
    "ORION",
    "silhouettes/anthropic.png",
    ORION_VALUES,
  );
  const lyra = buildSamplePage("LYRA", "silhouettes/openai.png", LYRA_VALUES);
  const isComparison = mode !== "standard";
  const comparisons = isComparison
    ? [
        ComparisonPairSchema.parse({
          firstPageIndex: 0,
          secondPageIndex: 1,
          layout: mode,
        }),
      ]
    : [];

  const config: MultiPageConfig = {
    pages: isComparison ? [orion, lyra] : [orion],
    musicUrl: "",
    comparisons,
    comparisonArrowStyle: {
      ...defaultMultiPageConfig.comparisonArrowStyle,
    },
  };

  return applyPresetToConfig(config, getBuiltInPreset(presetId));
}
