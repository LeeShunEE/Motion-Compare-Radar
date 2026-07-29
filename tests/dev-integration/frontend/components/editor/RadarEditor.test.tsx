import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RadarEditor } from "@/components/editor/RadarEditor";
import { defaultMultiPageConfig, defaultRadarProps } from "@/types/constants";
import { ComparisonPairSchema, type MultiPageConfig } from "@/types/radar";

function makePresetFlowConfig(): MultiPageConfig {
  const names = ["ALPHA", "BETA-TRANSITION", "GAMMA", "DELTA-OVERLAY"];
  const pages = names.map((characterName, index) => ({
    ...structuredClone(defaultRadarProps),
    characterName,
    attributes: defaultRadarProps.attributes.map(
      (attribute, attributeIndex) => ({
        ...attribute,
        value: 40 + index * 10 + attributeIndex,
      }),
    ) as typeof defaultRadarProps.attributes,
  }));

  return {
    ...structuredClone(defaultMultiPageConfig),
    pages,
    comparisons: [
      ComparisonPairSchema.parse({
        firstPageIndex: 0,
        secondPageIndex: 1,
        layout: "transition",
      }),
      ComparisonPairSchema.parse({
        firstPageIndex: 2,
        secondPageIndex: 3,
        layout: "overlay",
      }),
    ],
  };
}

vi.mock("@/components/editor/PreviewPanel", () => ({
  PreviewPanel: () => null,
}));
vi.mock("@/components/editor/PreviewTargetSelector", () => ({
  PreviewTargetSelector: () => null,
}));
vi.mock("@/components/editor/GlobalConfigEditor", () => ({
  GlobalConfigEditor: () => null,
}));
vi.mock("@/components/editor/ComparisonConfigPanel", () => ({
  ComparisonConfigPanel: ({ config }: { config: MultiPageConfig }) => (
    <output data-testid="comparison-layouts">
      {config.comparisons.map((comparison) => comparison.layout).join(",")}
    </output>
  ),
}));
vi.mock("@/components/editor/RadarValuesTable", () => ({
  RadarValuesTable: () => null,
}));
vi.mock("@/components/editor/ConfigPersistencePanel", () => ({
  ConfigPersistencePanel: ({ onLoadConfig }: any) => (
    <button type="button" onClick={() => onLoadConfig(makePresetFlowConfig())}>
      load preset fixture
    </button>
  ),
}));
vi.mock("@/components/files/FileManagerPanel", () => ({
  FileManagerPanel: () => null,
}));
vi.mock("@/components/tasks/TaskQueuePanel", () => ({
  TaskQueuePanel: () => null,
}));
vi.mock("@/components/editor/ExportPanel", () => ({
  ExportPanel: () => null,
}));

vi.mock("@/components/editor/CharacterConfig", () => ({
  CharacterConfig: () => null,
}));
vi.mock("@/components/editor/LayoutEditor", () => ({
  LayoutEditor: () => null,
}));
vi.mock("@/components/editor/AttributeEditor", () => ({
  AttributeEditor: () => null,
}));
vi.mock("@/components/editor/BackgroundConfigPanel", () => ({
  BackgroundConfigPanel: () => null,
}));
vi.mock("@/components/editor/AnimationConfig", () => ({
  AnimationConfigEditor: () => null,
}));
vi.mock("@/components/editor/FontSizeEditor", () => ({
  FontSizeEditor: () => null,
}));
vi.mock("@/components/editor/FontFamilyEditor", () => ({
  FontFamilyEditor: ({ font }: any) => (
    <output data-testid="character-font-family">
      {font.characterNameFamily}
    </output>
  ),
}));
vi.mock("@/components/editor/EffectsConfigEditor", () => ({
  EffectsConfigEditor: () => null,
}));
vi.mock("@/components/editor/ImportFromMenu", () => ({
  ImportFromMenu: () => null,
}));

function pagePanel(index: number): HTMLElement {
  const panel = document.querySelector<HTMLElement>(
    `[data-page-index="${index}"]`,
  );
  if (!panel) throw new Error(`page panel ${index} not found`);
  return panel;
}

describe("RadarEditor preset user flow", () => {
  it("一次操作统一标准页、切换对比与叠加对比的视觉样式", () => {
    render(<RadarEditor />);

    fireEvent.click(screen.getByRole("tab", { name: "保存/加载" }));
    fireEvent.click(
      screen.getByRole("button", { name: "load preset fixture" }),
    );
    fireEvent.click(screen.getByRole("tab", { name: "动画细节" }));

    const firstPage = pagePanel(0);
    expect(
      within(firstPage).getByText("ALPHA", { exact: false }),
    ).toBeInTheDocument();
    fireEvent.click(
      within(firstPage).getByRole("button", {
        name: "应用「赤红擂台」到全部页面",
      }),
    );

    expect(within(firstPage).getByText("#17080C")).toBeInTheDocument();
    expect(within(firstPage).getByText("ZCOOL KuaiLe")).toBeInTheDocument();

    const transitionSecondary = pagePanel(1);
    fireEvent.click(
      within(transitionSecondary).getByText("BETA-TRANSITION", {
        exact: false,
      }),
    );
    expect(
      within(transitionSecondary).getByText("#17080C"),
    ).toBeInTheDocument();
    expect(
      within(transitionSecondary).getByText("ZCOOL KuaiLe"),
    ).toBeInTheDocument();

    const overlaySecondary = pagePanel(3);
    fireEvent.click(
      within(overlaySecondary).getByText("DELTA-OVERLAY", { exact: false }),
    );
    expect(within(overlaySecondary).getByText("#17080C")).toBeInTheDocument();
    expect(
      within(overlaySecondary).getByText("ZCOOL KuaiLe"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "对比" }));
    expect(screen.getByTestId("comparison-layouts")).toHaveTextContent(
      "transition,overlay",
    );
  });
});
