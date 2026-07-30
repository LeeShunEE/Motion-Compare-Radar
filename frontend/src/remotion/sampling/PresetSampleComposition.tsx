import React from "react";
import { MultiPageVideo } from "../MultiPageVideo";
import type { RadarPresetId } from "../../types/presets";
import {
  buildPresetSampleConfig,
  type PresetSampleMode,
} from "./sample-config";

export type PresetSampleProps = {
  presetId: RadarPresetId;
  mode: PresetSampleMode;
};

export const PresetSampleComposition: React.FC<PresetSampleProps> = ({
  presetId,
  mode,
}) => {
  const config = buildPresetSampleConfig(presetId, mode);
  return <MultiPageVideo config={config} />;
};
