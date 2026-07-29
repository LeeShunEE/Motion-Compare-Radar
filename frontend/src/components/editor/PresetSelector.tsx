"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { BUILT_IN_PRESETS } from "../../presets/built-in-presets";
import type { RadarPreset } from "../../types/presets";

type PresetSelectorProps = {
  onApply: (preset: RadarPreset) => void;
};

export const PresetSelector: React.FC<PresetSelectorProps> = ({ onApply }) => {
  const t = useTranslations("editor.presets");

  return (
    <section
      aria-labelledby="preset-selector-title"
      className="space-y-3 rounded-lg border border-unfocused-border-color bg-muted/20 p-3"
    >
      <div className="space-y-1">
        <h3
          id="preset-selector-title"
          className="text-sm font-semibold text-foreground"
        >
          {t("title")}
        </h3>
        <p className="max-w-3xl text-xs leading-relaxed text-subtitle">
          {t("description")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-5">
        {BUILT_IN_PRESETS.map((preset) => {
          const name = t(`items.${preset.id}.name`);
          const description = t(`items.${preset.id}.description`);
          const swatches = [
            preset.page.theme.backgroundColor,
            preset.page.theme.gridStrokeColor,
            preset.page.theme.highValueDotColor,
            preset.page.theme.labelColor,
          ];

          return (
            <button
              key={preset.id}
              type="button"
              aria-label={t("applyLabel", { name })}
              data-preset-id={preset.id}
              onClick={() => onApply(preset)}
              className="group flex min-h-32 flex-col justify-between gap-3 rounded-md border border-unfocused-border-color bg-background p-3 text-left shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1" aria-hidden="true">
                  {swatches.map((color, index) => (
                    <span
                      key={`${preset.id}-${index}`}
                      data-preset-swatch="true"
                      className="size-4 rounded-full border border-black/15 shadow-inner"
                      style={{ background: color }}
                    />
                  ))}
                </span>
                <span
                  aria-hidden="true"
                  className="text-lg leading-none text-foreground/80"
                  style={{
                    fontFamily: preset.page.font.characterNameFamily,
                  }}
                >
                  Aa / 雷
                </span>
              </span>

              <span className="space-y-1">
                <span className="block text-sm font-semibold text-foreground">
                  {name}
                </span>
                <span className="block text-[11px] leading-snug text-subtitle">
                  {description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
