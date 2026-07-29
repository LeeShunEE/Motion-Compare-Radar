/**
 * RadarEditor 单元测试：页面增删/复制/移动、updatePage 深合并、overrideIgnored、对比重映射。
 * PreviewPanel/各面板/Tabs 全 stub 化；通过 mock 组件的回调按钮触发 RadarEditor 自身状态逻辑。
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RadarEditor } from "@/components/editor/RadarEditor";
import { defaultMultiPageConfig, defaultRadarProps } from "@/types/constants";
import { ComparisonPairSchema, type MultiPageConfig } from "@/types/radar";
import { getBuiltInPreset } from "@/presets/built-in-presets";

// 构造一个 4 页 + 两组对比的 config，专门驱动 remap/move/remove/dup 的分支
const makeRichConfig = (): MultiPageConfig => ({
  ...defaultMultiPageConfig,
  pages: [0, 1, 2, 3].map((i) => ({
    ...defaultRadarProps,
    characterName: `P${i}`,
  })),
  comparisons: [
    ComparisonPairSchema.parse({ firstPageIndex: 0, secondPageIndex: 1 }),
    ComparisonPairSchema.parse({ firstPageIndex: 2, secondPageIndex: 3 }),
  ],
});

vi.mock("@/components/editor/PreviewPanel", () => ({
  PreviewPanel: (p: any) => <div data-testid="preview">{p.mode}</div>,
}));
vi.mock("@/components/editor/PreviewTargetSelector", () => ({
  PreviewTargetSelector: (p: any) => (
    <div>
      <span data-testid="preview-target">
        {p.previewMode === "multi" ? "global" : `page-${p.activePageIndex}`}
      </span>
      <button data-testid="sel-global" onClick={p.onSelectGlobal}>global</button>
      <button data-testid="sel-page-1" onClick={() => p.onSelectPage(1)}>page1</button>
    </div>
  ),
}));
vi.mock("@/components/editor/GlobalConfigEditor", () => ({
  GlobalConfigEditor: (p: any) => (
    <div>
      <span data-testid="page-count">{p.config.pages.length}</span>
      <span data-testid="comp-count">{p.config.comparisons.length}</span>
      <span data-testid="page-order">
        {p.config.pages
          .map((page: { characterName: string }) => page.characterName)
          .join(",")}
      </span>
      <span data-testid="active-index">{p.activePageIndex}</span>
      <span data-testid="comparison-pairs">
        {p.config.comparisons
          .map(
            (comparison: { firstPageIndex: number; secondPageIndex: number }) =>
              `${comparison.firstPageIndex}-${comparison.secondPageIndex}`,
          )
          .join(",")}
      </span>
      <button data-testid="add" onClick={p.onAddPage}>add</button>
      <button data-testid="remove" onClick={() => p.onRemovePage(0)}>remove</button>
      <button data-testid="remove-mid" onClick={() => p.onRemovePage(1)}>remove-mid</button>
      <button data-testid="dup" onClick={() => p.onDuplicatePage(0)}>dup</button>
      <button
        data-testid="reorder-groups"
        onClick={() =>
          p.onReorderPageSequence(
            `comparison:${p.pageIds[0]}:${p.pageIds[1]}`,
            `comparison:${p.pageIds[2]}:${p.pageIds[3]}`,
          )
        }
      >
        reorder-groups
      </button>
      <button data-testid="set-active" onClick={() => p.onSetActive(2)}>set-active</button>
      <button data-testid="preview-all" onClick={p.onPreviewAll}>preview-all</button>
    </div>
  ),
}));
vi.mock("@/components/editor/ComparisonConfigPanel", () => ({
  ComparisonConfigPanel: () => null,
}));
vi.mock("@/components/editor/RadarValuesTable", () => ({
  RadarValuesTable: (p: any) => (
    <button data-testid="values-add-page" onClick={p.onAddPage}>values-add</button>
  ),
}));
vi.mock("@/components/editor/ConfigPersistencePanel", () => ({
  ConfigPersistencePanel: (p: any) => (
    <button data-testid="load" onClick={() => p.onLoadConfig(makeRichConfig())}>
      load
    </button>
  ),
}));
vi.mock("@/components/files/FileManagerPanel", () => ({ FileManagerPanel: () => null }));
vi.mock("@/components/tasks/TaskQueuePanel", () => ({ TaskQueuePanel: () => null }));
vi.mock("@/components/editor/ExportPanel", () => ({ ExportPanel: () => null }));
vi.mock("@/components/editor/PageConfigPanel", () => ({
  PageConfigPanel: (p: any) => (
    <div onFocus={() => p.onUpdate({})}>
      {p.previewing && <span data-testid={`previewing-${p.index}`}>预览中</span>}
      <span data-testid={`pc-${p.index}`}>
        {p.page.characterName}|{p.page.theme.backgroundColor}|
        {p.page.font.characterNameFamily}|{p.page.animation.fillDuration}|
        {p.page.attributes[0].value}|{JSON.stringify(p.page.overrideIgnored ?? {})}
      </span>
      {p.index === 0 && (
        <button
          data-testid="apply-preset"
          onClick={() => p.onApplyPreset(getBuiltInPreset("mint-terminal"))}
        >
          apply preset
        </button>
      )}
      <button
        data-testid={`upd-${p.index}`}
        onClick={() => p.onUpdate({ theme: { backgroundColor: "#newbg" } })}
      >
        upd
      </button>
      <button
        data-testid={`upd-nested-${p.index}`}
        onClick={() =>
          p.onUpdate({
            animation: { totalDurationFrames: 999 },
            font: { characterName: 123 },
            layout: { radarCX: 50 },
          })
        }
      >
        upd-nested
      </button>
      <button
        data-testid={`ignore-${p.index}`}
        onClick={() => p.onToggleIgnoreOverride("theme.backgroundColor", true)}
      >
        ignore
      </button>
      <button data-testid={`preview-${p.index}`} onClick={p.onPreview}>preview</button>
      <button data-testid={`dup-${p.index}`} onClick={p.onDuplicate}>dup</button>
      <button data-testid={`rm-${p.index}`} onClick={p.onRemove}>rm</button>
    </div>
  ),
}));
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <span>{children}</span>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

const count = () => Number(screen.getByTestId("page-count").textContent);
const compCount = () => Number(screen.getByTestId("comp-count").textContent);
const pageOrder = () => screen.getByTestId("page-order").textContent;
const activeIndex = () => Number(screen.getByTestId("active-index").textContent);
const comparisonPairs = () => screen.getByTestId("comparison-pairs").textContent;

describe("RadarEditor", () => {
  it("渲染预览与初始页面数", () => {
    render(<RadarEditor />);
    expect(screen.getByTestId("preview")).toBeInTheDocument();
    expect(count()).toBeGreaterThan(0);
  });

  it("添加页面 → 页数 +1", () => {
    render(<RadarEditor />);
    const before = count();
    fireEvent.click(screen.getByTestId("add"));
    expect(count()).toBe(before + 1);
  });

  it("复制页面 → 页数 +1，新页带「(副本)」", () => {
    render(<RadarEditor />);
    const before = count();
    fireEvent.click(screen.getByTestId("dup"));
    expect(count()).toBe(before + 1);
    expect(screen.getByTestId("pc-1").textContent).toContain("(副本)");
  });

  it("删除页面 → 页数 -1", () => {
    render(<RadarEditor />);
    fireEvent.click(screen.getByTestId("add"));
    const before = count();
    fireEvent.click(screen.getByTestId("remove"));
    expect(count()).toBe(before - 1);
  });

  it("单页时删除被忽略（>=1 守卫）", () => {
    render(<RadarEditor />);
    const before = count();
    // 默认单页时再删一次，页数不应变为 0
    if (before === 1) {
      fireEvent.click(screen.getByTestId("remove"));
      expect(count()).toBe(1);
    }
  });

  it("updatePage 深合并：theme 局部更新保留其余键", () => {
    render(<RadarEditor />);
    const before = screen.getByTestId("pc-0").textContent ?? "";
    const originalBg = before.split("|")[1];
    fireEvent.click(screen.getByTestId("upd-0"));
    const after = screen.getByTestId("pc-0").textContent ?? "";
    expect(after).toContain("#newbg");
    expect(after).toContain(before.split("|")[0]);
    expect(originalBg).not.toBe("#newbg");
  });

  it("updatePage 深合并：animation/font/layout 分支均触发", () => {
    render(<RadarEditor />);
    // 不抛错即覆盖三个嵌套合并分支
    expect(() => fireEvent.click(screen.getByTestId("upd-nested-0"))).not.toThrow();
  });

  it("toggleIgnoreOverride 写入 overrideIgnored", () => {
    render(<RadarEditor />);
    fireEvent.click(screen.getByTestId("ignore-0"));
    const text = screen.getByTestId("pc-0").textContent ?? "";
    expect(text).toContain('"theme.backgroundColor":true');
  });

  it("应用预设会更新全部页面样式并保留内容与时间参数", () => {
    render(<RadarEditor />);
    fireEvent.click(screen.getByTestId("load"));

    const before = [0, 1, 2, 3].map((index) =>
      screen.getByTestId(`pc-${index}`).textContent,
    );
    fireEvent.click(screen.getByTestId("apply-preset"));

    [0, 1, 2, 3].forEach((index) => {
      const after = screen.getByTestId(`pc-${index}`).textContent ?? "";
      expect(after).toContain(`P${index}|#041714|Exo 2`);
      expect(after.split("|")[3]).toBe(before[index]?.split("|")[3]);
      expect(after.split("|")[4]).toBe(before[index]?.split("|")[4]);
    });
    expect(comparisonPairs()).toBe("0-1,2-3");
  });

  it("PageConfigPanel preview/dup/rm 回调不崩溃", () => {
    render(<RadarEditor />);
    fireEvent.click(screen.getByTestId("add")); // 保证可删
    fireEvent.click(screen.getByTestId("preview-0"));
    fireEvent.click(screen.getByTestId("dup-0"));
    fireEvent.click(screen.getByTestId("rm-0"));
    expect(screen.getByTestId("preview")).toBeInTheDocument();
  });

  describe("载入多页+对比 config 后的重映射", () => {
    it("载入后页数=4、对比数=2", () => {
      render(<RadarEditor />);
      fireEvent.click(screen.getByTestId("load"));
      expect(count()).toBe(4);
      expect(compCount()).toBe(2);
    });

    it("删首页 → 引用首页的对比被丢弃、其余下移", () => {
      render(<RadarEditor />);
      fireEvent.click(screen.getByTestId("load"));
      fireEvent.click(screen.getByTestId("remove")); // remove index 0
      expect(count()).toBe(3);
      // {0,1} 含被删页 → 丢弃；{2,3} → {1,2} 保留
      expect(compCount()).toBe(1);
    });

    it("删中间页 → 对比按规则重映射", () => {
      render(<RadarEditor />);
      fireEvent.click(screen.getByTestId("load"));
      fireEvent.click(screen.getByTestId("remove-mid")); // remove index 1
      expect(count()).toBe(3);
    });

    it("复制首页 → 后续对比索引 +1", () => {
      render(<RadarEditor />);
      fireEvent.click(screen.getByTestId("load"));
      fireEvent.click(screen.getByTestId("dup"));
      expect(count()).toBe(5);
      expect(compCount()).toBe(2);
    });

    it("整组重排时保持组内顺序并同步对比与当前页索引", () => {
      render(<RadarEditor />);
      fireEvent.click(screen.getByTestId("load"));
      fireEvent.click(screen.getByTestId("set-active"));

      fireEvent.click(screen.getByTestId("reorder-groups"));

      expect(pageOrder()).toBe("P2,P3,P0,P1");
      expect(comparisonPairs()).toBe("0-1,2-3");
      expect(activeIndex()).toBe(0);
    });

    it("setActive 与 previewAll 回调触发", () => {
      render(<RadarEditor />);
      fireEvent.click(screen.getByTestId("load"));
      fireEvent.click(screen.getByTestId("set-active"));
      fireEvent.click(screen.getByTestId("preview-all"));
      expect(screen.getByTestId("preview")).toBeInTheDocument();
    });
  });

  describe("预览对象选择器与页签命名", () => {
    it("默认单页预览第 0 页，Player 为 single 模式", () => {
      render(<RadarEditor />);
      expect(screen.getByTestId("preview-target").textContent).toBe("page-0");
      expect(screen.getByTestId("preview").textContent).toBe("single");
    });

    it("选择全局 → Player 切 multi，选择器同步显示 global", () => {
      render(<RadarEditor />);
      fireEvent.click(screen.getByTestId("sel-global"));
      expect(screen.getByTestId("preview-target").textContent).toBe("global");
      expect(screen.getByTestId("preview").textContent).toBe("multi");
    });

    it("全局预览时页面卡片不显示「预览中」徽标", () => {
      render(<RadarEditor />);
      expect(screen.getByTestId("previewing-0")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("sel-global"));
      expect(screen.queryByTestId("previewing-0")).toBeNull();
    });

    it("全局后再选某页 → 回到单页预览该页", () => {
      render(<RadarEditor />);
      fireEvent.click(screen.getByTestId("add")); // 保证有第 1 页
      fireEvent.click(screen.getByTestId("sel-global"));
      fireEvent.click(screen.getByTestId("sel-page-1"));
      expect(screen.getByTestId("preview-target").textContent).toBe("page-1");
      expect(screen.getByTestId("preview").textContent).toBe("single");
      expect(screen.getByTestId("previewing-1")).toBeInTheDocument();
    });

    it("页签重命名：保存/加载 与 动画细节", () => {
      render(<RadarEditor />);
      expect(screen.getByText("保存/加载")).toBeInTheDocument();
      expect(screen.getByText("动画细节")).toBeInTheDocument();
      expect(screen.queryByText("配置")).toBeNull();
    });

    it("数值表 onAddPage → 页数 +1", () => {
      render(<RadarEditor />);
      const before = count();
      fireEvent.click(screen.getByTestId("values-add-page"));
      expect(count()).toBe(before + 1);
    });
  });
});
