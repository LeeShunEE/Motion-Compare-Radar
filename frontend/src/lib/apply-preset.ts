import { defaultOverlayHighlightConfig } from "../types/constants";
import type { RadarPreset } from "../types/presets";
import type { MultiPageConfig, RadarVideoProps } from "../types/radar";

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

export function applyPresetToConfig(
  config: MultiPageConfig,
  preset: RadarPreset,
): MultiPageConfig {
  const pages = config.pages.map((page) => applyPresetToPage(page, preset));
  const comparisons = config.comparisons.map((comparison) => ({
    ...comparison,
    ...preset.comparison.transitionStyle,
    overlay: {
      ...defaultOverlayHighlightConfig,
      ...comparison.overlay,
      ...preset.comparison.overlayStyle,
    },
  }));

  const result: MultiPageConfig = {
    ...config,
    pages,
    comparisons,
    comparisonArrowStyle: { ...preset.comparison.arrowStyle },
  };

  if (config.globalOverride) {
    result.globalOverride = {
      enabled: { ...config.globalOverride.enabled },
      values: applyPresetToPage(config.globalOverride.values, preset),
    };
  }

  return result;
}
