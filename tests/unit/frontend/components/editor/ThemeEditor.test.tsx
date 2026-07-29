/**
 * ThemeEditor 单元测试：配色变更（暗角效果已迁至 BackgroundConfigPanel）。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeEditor } from "@/components/editor/ThemeEditor";
import { baseTheme } from "./_fixtures";

vi.mock("@/components/ui/color-picker", () => ({
  ColorPicker: ({ value, onChange }: any) => (
    <input
      type="text"
      data-testid="color-picker"
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

describe("ThemeEditor", () => {
  it("渲染标题与配色字段", () => {
    render(<ThemeEditor theme={baseTheme} onChange={() => {}} />);
    expect(screen.getByText("主题配色")).toBeInTheDocument();
    expect(screen.getByText("背景色")).toBeInTheDocument();
    expect(screen.getAllByTestId("color-picker").length).toBeGreaterThan(0);
  });

  it("修改配色触发 onChange", () => {
    const onChange = vi.fn();
    render(<ThemeEditor theme={baseTheme} onChange={onChange} />);
    fireEvent.change(screen.getAllByTestId("color-picker")[0], {
      target: { value: "#000000" },
    });
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)![0].backgroundColor).toBe("#000000");
  });

  it("修改其他配色字段（如网格色）触发对应 onChange", () => {
    const onChange = vi.fn();
    render(<ThemeEditor theme={baseTheme} onChange={onChange} />);
    fireEvent.change(screen.getAllByTestId("color-picker")[1], {
      target: { value: "#111111" },
    });
    expect(onChange.mock.calls.at(-1)![0].gridColor).toBe("#111111");
  });

  it("选择视觉预设时透传完整预设对象", () => {
    const onApplyPreset = vi.fn();
    render(
      <ThemeEditor
        theme={baseTheme}
        onChange={() => {}}
        onApplyPreset={onApplyPreset}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "应用「经典靛蓝」到全部页面" }),
    );

    expect(onApplyPreset).toHaveBeenCalledOnce();
    expect(onApplyPreset.mock.calls[0][0].id).toBe("classic-indigo");
  });

  it("不渲染暗角相关 UI（已迁至 BackgroundConfigPanel）", () => {
    render(
      <ThemeEditor
        theme={{ ...baseTheme, vignetteEnabled: true }}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByText(/暗角/)).toBeNull();
    expect(screen.queryByText(/亮度偏移/)).toBeNull();
  });
});
