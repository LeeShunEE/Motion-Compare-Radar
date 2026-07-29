"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Label } from "../ui/label";
import { ColorPicker } from "../ui/color-picker";
import { PresetSelector } from "./PresetSelector";
import type { RadarTheme } from "../../types/radar";
import type { RadarPreset } from "../../types/presets";

type ThemeEditorProps = {
  theme: RadarTheme;
  onChange: (theme: RadarTheme) => void;
  onApplyPreset?: (preset: RadarPreset) => void;
  importMenu?: React.ReactNode;
};

const colorFields: { key: keyof RadarTheme; labelKey: string }[] = [
  { key: "backgroundColor", labelKey: "backgroundColor" },
  { key: "gridColor", labelKey: "gridColor" },
  { key: "gridFillColor", labelKey: "gridFillColor" },
  { key: "gridStrokeColor", labelKey: "gridStrokeColor" },
  { key: "dotColor", labelKey: "dotColor" },
  { key: "highValueDotColor", labelKey: "highValueDotColor" },
  { key: "labelColor", labelKey: "labelColor" },
  { key: "valueColor", labelKey: "valueColor" },
  { key: "glowColor", labelKey: "glowColor" },
  { key: "enhanceArrowColor", labelKey: "enhanceArrowColor" },
  { key: "weakenArrowColor", labelKey: "weakenArrowColor" },
];

export const ThemeEditor: React.FC<ThemeEditorProps> = ({
  theme,
  onChange,
  onApplyPreset,
  importMenu,
}) => {
  const t = useTranslations("editor.theme");
  const updateColor = (key: keyof RadarTheme, value: string) => {
    onChange({ ...theme, [key]: value });
  };

  return (
    <div className="space-y-3">
      {onApplyPreset && <PresetSelector onApply={onApplyPreset} />}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{t("title")}</h3>
        {importMenu}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {colorFields.map(({ key, labelKey }) => {
          const color = theme[key] as string;
          return (
            <div key={key} className="space-y-1">
              <Label className="text-xs">{t(`colors.${labelKey}`)}</Label>
              <div className="flex items-center gap-2">
                <ColorPicker
                  value={color}
                  onChange={(v) => updateColor(key, v)}
                />
                <span className="text-xs text-subtitle font-mono truncate flex-1">
                  {color}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
