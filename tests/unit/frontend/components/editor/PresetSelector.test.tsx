import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PresetSelector } from "@/components/editor/PresetSelector";

describe("PresetSelector", () => {
  it("展示五个明确作用于全部页面的可访问 preset 按钮", () => {
    render(<PresetSelector onApply={() => {}} />);

    expect(screen.getAllByRole("button")).toHaveLength(5);
    expect(
      screen.getByText("页面内容、比较模式和动画时序保持不变。", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "应用「黄铜观测站」到全部页面",
      }),
    ).toBeVisible();
  });

  it("为每套 preset 展示由真实 theme 派生的四个色样", () => {
    const { container } = render(<PresetSelector onApply={() => {}} />);
    expect(
      container.querySelectorAll('[data-preset-swatch="true"]'),
    ).toHaveLength(20);
  });

  it("点击卡片把对应的已解析 preset 交给调用方", () => {
    const onApply = vi.fn();
    render(<PresetSelector onApply={onApply} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "应用「薄荷终端」到全部页面",
      }),
    );

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].id).toBe("mint-terminal");
  });
});
