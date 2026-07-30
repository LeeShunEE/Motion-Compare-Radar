"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Separator } from "../ui/separator";
import { CharacterConfig } from "./CharacterConfig";
import { LayoutEditor } from "./LayoutEditor";
import { AttributeEditor } from "./AttributeEditor";
import { ThemeEditor } from "./ThemeEditor";
import { BackgroundConfigPanel } from "./BackgroundConfigPanel";
import { AnimationConfigEditor } from "./AnimationConfig";
import { FontSizeEditor } from "./FontSizeEditor";
import { FontFamilyEditor } from "./FontFamilyEditor";
import { EffectsConfigEditor } from "./EffectsConfigEditor";
import { ImportFromMenu, type ImportSource } from "./ImportFromMenu";
import type {
  AnimationConfig,
  FontConfig,
  RadarVideoProps,
} from "../../types/radar";
import type { RadarPreset } from "../../types/presets";

type PageConfigPanelProps = {
  index: number;
  page: RadarVideoProps;
  allPages: RadarVideoProps[];
  isActive: boolean;
  /** 播放器当前确实在单页预览本页（多页/全局预览时应为 false，避免误导） */
  previewing?: boolean;
  isSecondary: boolean;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (updates: Partial<RadarVideoProps>) => void;
  onPreview: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onApplyPreset: (preset: RadarPreset) => void;
  canRemove: boolean;
  globalOverrideEnabled?: Record<string, boolean>;
  onToggleIgnoreOverride?: (path: string, ignored: boolean) => void;
};

const FONT_SIZE_KEYS: (keyof FontConfig)[] = [
  "characterName",
  "attributeLabel",
  "ratingLabel",
  "valuePopup",
];
const FONT_FAMILY_KEYS: (keyof FontConfig)[] = [
  "characterNameFamily",
  "attributeLabelFamily",
  "ratingLabelFamily",
  "valuePopupFamily",
];
const ANIMATION_OWN_KEYS: (keyof AnimationConfig)[] = [
  "fillDuration",
  "silhouetteDelay",
  "silhouetteFadeInDuration",
  "labelStagger",
  "highValueSpringDamping",
  "holdDuration",
  "nameFadeInDuration",
  "nameAppearRatio",
  "labelStartOffset",
  "fillStartOffset",
  "effectsStartOffset",
  "holdStartOffset",
];
const EFFECTS_OWN_KEYS: (keyof AnimationConfig)[] = [
  "highValueThreshold",
  "valuePopupEnabled",
  "valuePopupStyle",
  "highValueGlowEnabled",
  "highValueGlowStyle",
];

function pickKeys<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

export const PageConfigPanel: React.FC<PageConfigPanelProps> = ({
  index,
  page,
  allPages,
  isActive,
  previewing = false,
  isSecondary,
  expanded,
  onToggle,
  onUpdate,
  onPreview,
  onDuplicate,
  onRemove,
  onApplyPreset,
  canRemove,
  globalOverrideEnabled,
  onToggleIgnoreOverride,
}) => {
  const t = useTranslations("editor");
  const sources: ImportSource[] = allPages
    .map((p, i) => ({ index: i, label: p.characterName }))
    .filter((s) => s.index !== index);

  const fromSource =
    (cb: (src: RadarVideoProps) => void) => (sourceIndex: number) => {
      const src = allPages[sourceIndex];
      if (src) cb(src);
    };

  const importFontSize = fromSource((src) =>
    onUpdate({
      font: { ...page.font, ...pickKeys(src.font, FONT_SIZE_KEYS) },
    }),
  );
  const importFontFamily = fromSource((src) =>
    onUpdate({
      font: { ...page.font, ...pickKeys(src.font, FONT_FAMILY_KEYS) },
    }),
  );
  const importAnimation = fromSource((src) =>
    onUpdate({
      animation: {
        ...page.animation,
        ...pickKeys(src.animation, ANIMATION_OWN_KEYS),
      },
    }),
  );
  const importEffects = fromSource((src) =>
    onUpdate({
      animation: {
        ...page.animation,
        ...pickKeys(src.animation, EFFECTS_OWN_KEYS),
      },
    }),
  );
  const importCharacter = fromSource((src) =>
    onUpdate({
      characterName: src.characterName,
      characterNameAlign: src.characterNameAlign,
      silhouetteSrc: src.silhouetteSrc,
      slug: { ...src.slug },
      theme: {
        ...page.theme,
        silhouetteOpacity: src.theme.silhouetteOpacity,
      },
      layout: {
        ...page.layout,
        silhouetteOffsetX: src.layout.silhouetteOffsetX,
        silhouetteOffsetY: src.layout.silhouetteOffsetY,
        silhouetteScale: src.layout.silhouetteScale,
        characterNameOffsetX: src.layout.characterNameOffsetX,
        characterNameOffsetY: src.layout.characterNameOffsetY,
        syncSilhouetteOffset: src.layout.syncSilhouetteOffset,
      },
      font: { ...page.font, characterName: src.font.characterName },
    }),
  );
  const importLayout = fromSource((src) =>
    onUpdate({ layout: { ...src.layout } }),
  );
  const importAttributes = fromSource((src) =>
    onUpdate({
      attributes: JSON.parse(
        JSON.stringify(src.attributes),
      ) as RadarVideoProps["attributes"],
    }),
  );
  const importTheme = fromSource((src) =>
    onUpdate({ theme: { ...src.theme } }),
  );

  const menu = (onPick: (sourceIndex: number) => void) => (
    <ImportFromMenu sources={sources} onPick={onPick} />
  );
  return (
    <div
      data-page-index={index}
      className={`border rounded-lg overflow-hidden transition-colors ${
        isActive
          ? "border-primary/50 bg-card"
          : "border-unfocused-border-color bg-card"
      }`}
    >
      {/* 卡片头部 */}
      <div
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">▸</span>
          <span className="text-sm font-medium text-foreground">
            {t("page.title", {
              n: index + 1,
              name: page.characterName || t("pageLabel", { n: index + 1 }),
            })}
          </span>
          {previewing && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {t("page.previewing")}
            </span>
          )}
        </div>
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onPreview}
            className="px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            ▶ {t("page.preview")}
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="px-2 py-1 text-xs rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            {t("page.duplicate")}
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="px-2 py-1 text-xs rounded hover:bg-muted text-geist-error"
            >
              {t("page.remove")}
            </button>
          )}
        </div>
      </div>

      {/* 展开区域 */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <Separator />
          <CharacterConfig
            characterName={page.characterName}
            characterNameAlign={page.characterNameAlign}
            characterNameFontSize={page.font.characterName}
            silhouetteSrc={page.silhouetteSrc}
            silhouetteOpacity={page.theme.silhouetteOpacity}
            silhouetteOffsetX={page.layout.silhouetteOffsetX}
            silhouetteOffsetY={page.layout.silhouetteOffsetY}
            silhouetteScale={page.layout.silhouetteScale}
            characterNameOffsetX={page.layout.characterNameOffsetX}
            characterNameOffsetY={page.layout.characterNameOffsetY}
            syncSilhouetteOffset={page.layout.syncSilhouetteOffset}
            slug={page.slug}
            layoutDisabled={isSecondary}
            onChange={onUpdate}
            importMenu={menu(importCharacter)}
          />
          <Separator />
          <LayoutEditor
            layout={page.layout}
            onChange={(layout) => onUpdate({ layout })}
            disabled={isSecondary}
            importMenu={menu(importLayout)}
          />
          <Separator />
          <AttributeEditor
            attributes={page.attributes}
            animation={page.animation}
            onChange={(attributes) =>
              onUpdate({
                attributes: attributes as RadarVideoProps["attributes"],
              })
            }
            importMenu={menu(importAttributes)}
          />
          <Separator />
          <ThemeEditor
            theme={page.theme}
            onChange={(theme) => onUpdate({ theme })}
            onApplyPreset={onApplyPreset}
            importMenu={menu(importTheme)}
          />
          <Separator />
          <BackgroundConfigPanel
            background={page.background}
            theme={page.theme}
            onChange={onUpdate}
          />
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <FontSizeEditor
              font={page.font}
              onChange={(font) => onUpdate({ font })}
              importMenu={menu(importFontSize)}
            />
            <FontFamilyEditor
              font={page.font}
              onChange={(font) => onUpdate({ font })}
              importMenu={menu(importFontFamily)}
            />
            <AnimationConfigEditor
              pageIndex={index}
              animation={page.animation}
              onChange={(animation) => onUpdate({ animation })}
              importMenu={menu(importAnimation)}
              overrideIgnored={page.overrideIgnored}
              globalOverrideEnabled={globalOverrideEnabled}
              onToggleIgnoreOverride={onToggleIgnoreOverride}
            />
            <EffectsConfigEditor
              pageIndex={index}
              animation={page.animation}
              onChange={(animation) => onUpdate({ animation })}
              importMenu={menu(importEffects)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
