/**
 * PageConfigPanel 单元测试：头部操作 + 各 importX 导入合并逻辑。
 * 8 个子编辑器 stub 化（仅渲染 importMenu 插槽），ImportFromMenu mock 触发 onPick。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PageConfigPanel } from "@/components/editor/PageConfigPanel";
import { makeMultiPageConfig } from "./_fixtures";

// 子编辑器 stub：仅透传 importMenu 插槽，使 ImportFromMenu mock 可被触发。
// 工厂内联（不可引用顶层变量，vi.mock 会被提升到文件顶部）。
vi.mock("@/components/editor/CharacterConfig", () => ({
  CharacterConfig: ({ importMenu }: any) => <div>{importMenu}</div>,
}));
vi.mock("@/components/editor/LayoutEditor", () => ({
  LayoutEditor: ({ importMenu }: any) => <div>{importMenu}</div>,
}));
vi.mock("@/components/editor/AttributeEditor", () => ({
  AttributeEditor: ({ importMenu }: any) => <div>{importMenu}</div>,
}));
vi.mock("@/components/editor/FontSizeEditor", () => ({
  FontSizeEditor: ({ importMenu }: any) => <div>{importMenu}</div>,
}));
vi.mock("@/components/editor/FontFamilyEditor", () => ({
  FontFamilyEditor: ({ importMenu }: any) => <div>{importMenu}</div>,
}));
vi.mock("@/components/editor/AnimationConfig", () => ({
  AnimationConfigEditor: ({ importMenu }: any) => <div>{importMenu}</div>,
}));
vi.mock("@/components/editor/EffectsConfigEditor", () => ({
  EffectsConfigEditor: ({ importMenu }: any) => <div>{importMenu}</div>,
}));
vi.mock("@/components/ui/separator", () => ({ Separator: () => null }));
vi.mock("@/components/editor/ImportFromMenu", () => ({
  ImportFromMenu: ({ onPick, sources }: any) => (
    <button
      type="button"
      data-testid="import-menu"
      onClick={() => sources[0] && onPick(sources[0].index)}
    >
      import
    </button>
  ),
}));

const allPages = makeMultiPageConfig(2).pages;

const baseProps = (over: Record<string, unknown> = {}) => ({
  index: 0,
  page: allPages[0],
  allPages,
  isActive: false,
  isSecondary: false,
  expanded: true,
  onToggle: vi.fn(),
  onUpdate: vi.fn(),
  onPreview: vi.fn(),
  onDuplicate: vi.fn(),
  onRemove: vi.fn(),
  onApplyPreset: vi.fn(),
  canRemove: true,
  ...over,
});

describe("PageConfigPanel", () => {
  it("渲染页标题；previewing 显示「预览中」", () => {
    const { rerender } = render(<PageConfigPanel {...baseProps()} />);
    expect(screen.getByText(/第1页：角色1/)).toBeInTheDocument();
    expect(screen.queryByText("预览中")).toBeNull();
    rerender(<PageConfigPanel {...baseProps({ previewing: true })} />);
    expect(screen.getByText("预览中")).toBeInTheDocument();
  });

  it("isActive 但非 previewing（全局预览中）→ 不显示「预览中」", () => {
    render(
      <PageConfigPanel {...baseProps({ isActive: true, previewing: false })} />,
    );
    expect(screen.queryByText("预览中")).toBeNull();
  });

  it("点头部 → onToggle", () => {
    const onToggle = vi.fn();
    render(<PageConfigPanel {...baseProps({ onToggle })} />);
    fireEvent.click(screen.getByText(/第1页：角色1/));
    expect(onToggle).toHaveBeenCalled();
  });

  it("点预览/复制/删除 → 各自回调", () => {
    const onPreview = vi.fn();
    const onDuplicate = vi.fn();
    const onRemove = vi.fn();
    render(
      <PageConfigPanel {...baseProps({ onPreview, onDuplicate, onRemove })} />,
    );
    fireEvent.click(screen.getByText("▶ 预览"));
    expect(onPreview).toHaveBeenCalled();
    fireEvent.click(screen.getByText("复制"));
    expect(onDuplicate).toHaveBeenCalled();
    fireEvent.click(screen.getByText("删除"));
    expect(onRemove).toHaveBeenCalled();
  });

  it("主题编辑器选择预设时透传到全局应用回调", () => {
    const onApplyPreset = vi.fn();
    render(<PageConfigPanel {...baseProps({ onApplyPreset })} />);

    fireEvent.click(
      screen.getByRole("button", { name: "应用「雾银制图」到全部页面" }),
    );

    expect(onApplyPreset).toHaveBeenCalledOnce();
    expect(onApplyPreset.mock.calls[0][0].id).toBe("silver-cartography");
  });

  it("canRemove=false 时不渲染删除按钮", () => {
    render(<PageConfigPanel {...baseProps({ canRemove: false })} />);
    expect(screen.queryByText("删除")).toBeNull();
  });

  it("导入角色（import-menu[0]）→ onUpdate 合并 characterName 等", () => {
    const onUpdate = vi.fn();
    render(<PageConfigPanel {...baseProps({ onUpdate })} />);
    fireEvent.click(screen.getAllByTestId("import-menu")[0]);
    const next = onUpdate.mock.calls.at(-1)![0];
    expect(next.characterName).toBe("角色2"); // 来自第 2 页
    expect(next.slug).toEqual(allPages[1].slug);
  });

  it("导入布局（import-menu[1]）→ onUpdate.layout = 源页 layout", () => {
    const onUpdate = vi.fn();
    render(<PageConfigPanel {...baseProps({ onUpdate })} />);
    fireEvent.click(screen.getAllByTestId("import-menu")[1]);
    expect(onUpdate.mock.calls.at(-1)![0].layout).toEqual(allPages[1].layout);
  });

  it("导入属性（import-menu[2]）→ onUpdate.attributes 深拷贝源页", () => {
    const onUpdate = vi.fn();
    render(<PageConfigPanel {...baseProps({ onUpdate })} />);
    fireEvent.click(screen.getAllByTestId("import-menu")[2]);
    const next = onUpdate.mock.calls.at(-1)![0];
    expect(next.attributes).toEqual(allPages[1].attributes);
    // 深拷贝：非同一引用
    expect(next.attributes).not.toBe(allPages[1].attributes);
  });

  it("导入主题（import-menu[3]）→ onUpdate.theme = 源页 theme", () => {
    const onUpdate = vi.fn();
    render(<PageConfigPanel {...baseProps({ onUpdate })} />);
    fireEvent.click(screen.getAllByTestId("import-menu")[3]);
    expect(onUpdate.mock.calls.at(-1)![0].theme).toEqual(allPages[1].theme);
  });

  it("导入字号（import-menu[4]）→ onUpdate.font 含源页字号键", () => {
    const onUpdate = vi.fn();
    render(<PageConfigPanel {...baseProps({ onUpdate })} />);
    fireEvent.click(screen.getAllByTestId("import-menu")[4]);
    const font = onUpdate.mock.calls.at(-1)![0].font;
    expect(font.characterName).toBe(allPages[1].font.characterName);
  });

  it("导入动画（import-menu[6]）→ onUpdate.animation 含源页动画键", () => {
    const onUpdate = vi.fn();
    render(<PageConfigPanel {...baseProps({ onUpdate })} />);
    fireEvent.click(screen.getAllByTestId("import-menu")[6]);
    const anim = onUpdate.mock.calls.at(-1)![0].animation;
    expect(anim.fillDuration).toBe(allPages[1].animation.fillDuration);
  });
});
