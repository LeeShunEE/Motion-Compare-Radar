import { z } from "zod";
import {
  ComparisonArrowStyleSchema,
  ComparisonPairSchema,
  OverlayHighlightSchema,
  RadarVideoSchema,
  SlugSchema,
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
    slugStyle: SlugSchema.pick({
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
