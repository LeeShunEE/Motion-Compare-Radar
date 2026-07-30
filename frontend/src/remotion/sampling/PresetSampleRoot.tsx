import React from "react";
import { Composition } from "remotion";
import {
  calculateComparisonDuration,
  calculateDuration,
  defaultRadarProps,
  VIDEO_FPS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
} from "../../types/constants";
import type { ComparisonPairConfig, MultiPageConfig } from "../../types/radar";
import {
  PresetSampleComposition,
  type PresetSampleProps,
} from "./PresetSampleComposition";
import { buildPresetSampleConfig } from "./sample-config";

function calculateSampleDuration(config: MultiPageConfig): number {
  const comparisonByFirstPage = new Map<number, ComparisonPairConfig>();
  for (const comparison of config.comparisons) {
    comparisonByFirstPage.set(comparison.firstPageIndex, comparison);
  }

  const comparedPages = new Set<number>();
  let totalFrames = 0;
  for (let index = 0; index < config.pages.length; index += 1) {
    if (comparedPages.has(index)) continue;
    const comparison = comparisonByFirstPage.get(index);
    if (comparison && index + 1 < config.pages.length) {
      totalFrames += calculateComparisonDuration(
        config.pages[index],
        config.pages[index + 1],
        comparison,
      );
      comparedPages.add(index);
      comparedPages.add(index + 1);
    } else {
      totalFrames += calculateDuration(config.pages[index].animation);
    }
  }
  return totalFrames;
}

const defaultSampleProps: PresetSampleProps = {
  presetId: "classic-indigo",
  mode: "standard",
};

export const PresetSampleRoot: React.FC = () => (
  <Composition
    id="PresetSample"
    component={PresetSampleComposition}
    durationInFrames={calculateDuration(defaultRadarProps.animation)}
    fps={VIDEO_FPS}
    width={VIDEO_WIDTH}
    height={VIDEO_HEIGHT}
    defaultProps={defaultSampleProps}
    calculateMetadata={async ({ props }) => {
      const config = buildPresetSampleConfig(props.presetId, props.mode);
      return {
        durationInFrames: calculateSampleDuration(config),
        props,
      };
    }}
  />
);
