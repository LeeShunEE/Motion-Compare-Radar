# 五套内置视觉预设设计

**日期：** 2026-07-29

**关联 Issue：** [#42 More Built-in Presets](https://github.com/LeeShunEE/Radar-Renderer/issues/42)

**状态：** 已完成对话设计确认，待书面复核

## 1. 目标

为 Radar Renderer 增加五套内置视觉预设。用户明确点击某个 preset 后，系统把同一套表现语言应用到整份多页面配置，使以下三种渲染路径具有统一的颜色、字体、字号、缩放、透明度和 offset：

1. 标准单页；
2. A→B 切换过渡对比；
3. 同图双方叠加高亮对比。

Preset 是内置于前端代码的**表现层白名单补丁**，不是完整配置模板，不创建页面、不改变页面模式，也不锁定后续手动微调。

## 2. 非目标与不变量

应用 preset 后，下列用户数据必须逐字段保持原值：

- 页面数量、页面顺序、页面名称与角色名称；
- 八项属性的 label、shortLabel 与 value；属性 labelOffset 属于 preset 明确允许统一的表现字段；
- 剪影、背景图片/视频、背景类型、音乐及其他素材引用；
- 对比关系索引与 `layout`（transition/overlay）选择；
- 动画时长、延迟、停留、切换节奏、弹簧参数和高值阈值；
- overlay 的 `highlightOrder` 及所有带时间含义的字段；
- `overrideIgnored`、global override 的启用路径集合及其他业务配置。

不新增后端 API、数据库模型、第三方依赖、用户自定义 preset 存储或社区分享能力。

## 3. 方案选择

### 3.1 采用：类型化表现层白名单补丁

每个 `RadarPreset` 只声明允许改变的视觉字段。`applyPresetToConfig` 显式合并这些字段到所有页面、global override 的样式值以及现有对比项；任何没有出现在 preset 类型中的字段都无法被应用函数覆盖。

优点：类型安全、可审计、可通过守恒测试证明不改用户数据，并且未来 schema 扩展时不会静默把新业务字段纳入 preset。

### 3.2 不采用：完整 `MultiPageConfig` 模板

从样例配置复制完整对象虽然代码少，但页面名、数值、时序和素材极易随模板一起覆盖，直接违背 Issue #42 的 preset 语义。

### 3.3 不采用：字符串字段路径注册表

通用路径 patch 引擎扩展灵活，但失去属性名与值类型的静态约束，需要维护脆弱的深层路径解析，当前五套内置 preset 没有这项复杂度需求。

## 4. 类型与应用边界

新增 `frontend/src/types/presets.ts`，通过 Zod 定义并导出 `RadarPresetSchema`、`RadarPreset` 与 `RadarPresetId`。Preset 包含以下白名单分组：

```ts
type RadarPreset = {
  id: RadarPresetId;
  page: {
    characterNameAlign: RadarVideoProps["characterNameAlign"];
    theme: RadarVideoProps["theme"];
    font: RadarVideoProps["font"];
    layout: RadarVideoProps["layout"];
    attributeLabelOffsets: [
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
      { x: number; y: number },
    ];
    slugStyle: Pick<
      RadarVideoProps["slug"],
      "fontFamily" | "fontSize" | "offsetX" | "offsetY" | "color"
    >;
    animationStyle: Pick<
      RadarVideoProps["animation"],
      | "valuePopupEnabled"
      | "valuePopupStyle"
      | "highValueGlowEnabled"
      | "highValueGlowStyle"
    >;
  };
  comparison: {
    arrowStyle: ComparisonArrowStyle;
    transitionStyle: Pick<
      ComparisonPairConfig,
      | "polygonMode"
      | "showLegend"
      | "silhouetteSwapOffsetX"
      | "silhouetteSwapOffsetY"
      | "silhouetteFadeOutOpacity"
      | "legendFontSize"
      | "legendOffsetX"
      | "legendOffsetY"
      | "legendFontFamily"
      | "diffTriangleScale"
      | "legendDotRadius"
    >;
    overlayStyle: Pick<
      OverlayHighlightConfig,
      | "dimOpacity"
      | "glowRadius"
      | "arrowSize"
      | "arrowSideOffset"
      | "arrowOffsetY"
      | "nameSideOffset"
      | "silhouetteBaseOpacity"
      | "silhouetteEmphasisOpacity"
      | "silhouetteDimOpacity"
    >;
  };
};
```

`frontend/src/presets/built-in-presets.ts` 保存并在模块加载时用 schema 解析五套静态常量。展示名与说明不写入 preset 数据，而由 `frontend/messages/{zh,en}.json` 按 preset id 提供，避免把可翻译文案混入表现 token。

`frontend/src/lib/apply-preset.ts` 导出：

```ts
function applyPresetToConfig(
  config: MultiPageConfig,
  preset: RadarPreset,
): MultiPageConfig;
```

应用顺序：

1. 映射 `config.pages`，只合并 `page` 白名单；八项属性逐项仅替换 labelOffsetX/Y，保留 label、shortLabel 与 value；
2. 若存在 `globalOverride`，对 `globalOverride.values` 合并同一页样式，保留 `enabled`；这样已启用的全局样式 override 不会把刚应用的 preset 覆盖回旧值；
3. 合并顶层 `comparisonArrowStyle`；
4. 映射所有 `comparisons`，合并 transition/overlay 视觉字段，保留索引、布局与时序字段；
5. 返回新对象，不原地修改输入。

## 5. 五套视觉系统

五套 preset 总数为五；`classic-indigo` 是现有默认视觉的兼容入口，其余四套为新增方向。每套的 bold choice 只花在一个标志元素上，其余网格、文字与差值标记保持克制。

### 5.1 经典靛蓝 `classic-indigo`

面向希望保持现有作品观感的用户，保留靛蓝多边形与琥珀高值点作为兼容基线。

- 色板：夜幕 `#0A0A1A`、靛蓝 `#6366F1`、浅靛 `#818CF8`、琥珀 `#F59E0B`、雾白 `#E2E8F0`、净白 `#F8FAFC`；
- 字体：角色名与各标签均为 `Noto Sans SC`；
- 布局：保留当前 1380/540 雷达中心、四环网格、1.5 px 网格线和默认 offset；
- 标志：靛蓝填充中只让高值节点出现琥珀环形光晕。

### 5.2 黄铜观测站 `brass-observatory`

来源是天文台黄铜经纬仪而非通用“黑金 UI”：低饱和黄铜线、象牙文字和铜橙高值点，光晕强度低于其他暗色 preset。

- 色板：煤黑 `#17130D`、深铜 `#5B4932`、黄铜 `#D9A441`、淡金 `#F6D365`、象牙 `#F4E7C5`、铜橙 `#E8793E`；
- 差值色：增强 `#E8793E`、减弱 `#62C6A8`；
- 字体：角色名 `Noto Serif SC`，属性标签 `Noto Serif SC`，评级与数值 `Rajdhani`；
- 布局：雷达中心 1370/540、scale 0.96、1.4 px 网格线、标签整体下移 4 px；
- 标志：像测量刻度一样的低亮度细网格，只有多边形边缘具有黄铜光泽。

### 5.3 薄荷终端 `mint-terminal`

来源是生物实验室监测终端：深青底、薄荷数据线与珊瑚异常标记，不使用常见酸绿黑底组合。

- 色板：深青 `#041714`、深网格 `#1F4D46`、薄荷 `#5EEAD4`、海沫 `#A7F3D0`、青柠 `#D9F99D`、近白 `#ECFDF5`；
- 差值色：增强 `#FB7185`、减弱 `#A3E635`；
- 字体：角色名 `Exo 2`，属性标签 `Noto Sans SC`，评级与数值 `Rajdhani`；
- 布局：雷达中心 1390/540、scale 0.98、1.25 px 网格线、属性标签整体右移 6 px；
- 标志：薄而清晰的临床监测线，珊瑚只用于增强差值，避免全屏霓虹。

### 5.4 赤红擂台 `crimson-ringside`

来源是赛事转播计分牌：酒红底、红色主体、暖橙高值点，采用紧凑而有冲击力的字形。

- 色板：酒红黑 `#17080C`、暗红网格 `#52212A`、鲜红 `#EF4444`、浅玫瑰 `#FCA5A5`、暖橙 `#FB923C`、玫瑰白 `#FFF1F2`；
- 差值色：增强 `#FB923C`、减弱 `#34D399`；
- 字体：角色名 `ZCOOL KuaiLe`，属性标签 `Noto Sans SC`，评级与数值 `Russo One`；
- 布局：雷达中心 1375/540、scale 1.02、2.2 px 网格线、角色名上移 8 px；
- 标志：短促的红色环形高值强调；其他元素不叠加额外装饰。

### 5.5 雾银制图 `silver-cartography`

来源是极地测绘印刷稿，也是五套中唯一浅色系统，用于证明渲染链路不依赖暗色背景。

- 色板：雾银 `#DCE7EA`、石墨 `#1E293B`、深青 `#0E7490`、青点 `#155E75`、陶土橙 `#C2410C`、墨黑 `#020617`；
- 差值色：增强 `#B91C1C`、减弱 `#047857`；
- 字体：角色名 `Noto Serif SC`，属性标签 `Noto Sans SC`，评级与数值 `Rajdhani`；
- 布局：雷达中心 1370/540、scale 0.94、1.2 px 网格线、评级标签下移 4 px；
- 标志：雾银纸面上的深青制图线，陶土橙只标识高值和增强差异。

### 5.6 风格独特性复核

- 黄铜方向从常见“暗黑琥珀霓虹”改成低光泽测量仪，并用衬线字与细刻度建立来源；
- 薄荷方向避免酸绿主按钮式视觉，限定为临床数据线和异常珊瑚标记；
- 赤红方向不是通用红色渐变，而由赛事计分牌的紧凑字形和环形高值提示承载；
- 雾银方向主动加入浅色印刷系统，打破五套全部深色的模板化结果；
- 经典靛蓝只承担兼容性，不再额外堆叠装饰。

## 6. 编辑器体验

新增 `PresetSelector`，由 `ThemeEditor` 在色板编辑器上方渲染：

- 五个可聚焦 button/card，展示名称、说明、3–4 个主色 swatch 和字体示例；
- 每个按钮的可访问名称明确写出“应用 {preset} 到全部页面”；
- 区块文案说明 preset 会改变全部页面的表现层，但保留内容、模式和时序；
- 点击后由 `RadarEditor` 调用 `applyPresetToConfig` 更新整份 config；
- 不保存“当前 preset id”。用户应用后手动修改即产生派生风格，不应继续显示虚假的锁定/选中状态；
- 不新增确认弹窗。操作入口本身明确作用范围，且自动保存已有历史不会被新的 preset 状态模型干扰。

中英文文案分别补到 `frontend/messages/zh.json` 与 `frontend/messages/en.json`。

## 7. 采样与多模态审美检查

新增独立采样入口和脚本：

- `frontend/src/remotion/sampling/PresetSampleRoot.tsx`：只供采样 bundle 使用，不注册进产品 `RemotionRoot`；
- `frontend/src/remotion/sampling/PresetSampleComposition.tsx`：按 preset id 和 mode 构造固定演示内容；
- `frontend/scripts/sample-presets.mjs`：使用仓库已有 `@remotion/bundler`、`@remotion/renderer` 与 Playwright，一次 bundle 后批量渲染；
- `.preset-samples/`：git-ignore 的本地输出目录。

固定演示内容包含三个彼此独立的模式：

1. 标准页：单个角色、完整八轴数据；
2. transition 对比：两页角色，`layout: "transition"`；
3. overlay 对比：两页角色，`layout: "overlay"`。

演示名称、属性值、时序、素材在五个 preset 间完全一致，避免把数据差异误判成风格优劣。采样脚本为每个模式输出开始、标签出现、填充完成、对比中段和尾部等关键帧，并写入 manifest。随后用现有 Playwright 将三种模式的代表帧组成一张 3 栏 PNG，因此最终提供五张预览图，每张代表一个 preset。

多模态检查逐张覆盖：

- 1920×1080 下角色名、八个标签、评级与图例无裁切或明显碰撞；
- 中文和拉丁字符均有稳定字体回退，关键数字清晰；
- 标准、transition、overlay 三种模式的字体、网格、offset 与差值色一致；
- 两个对比多边形、增强/减弱标记和高亮/压暗状态可区分；
- 浅色 preset 的文字、网格、剪影和光晕有足够对比度；
- 动画关键帧之间无突兀跳变或视觉噪声。

如任一项不满足，先调整 preset token，再重新采样；最终截图必须来自最后一次通过审美检查的渲染结果。

## 8. 测试与验收

### 8.1 单元测试

- `tests/unit/frontend/types/presets.test.ts`：五套常量全部通过 schema、id 唯一且总数严格为五；
- `tests/unit/frontend/lib/apply-preset.test.ts`：证明样式与八轴 labelOffset 更新、输入不变，并逐字段证明名称、数值、素材、模式、比较索引和所有时序字段守恒；覆盖 global override；
- `tests/unit/frontend/components/editor/PresetSelector.test.tsx`：五个按钮、swatch、范围说明、键盘可访问名称与点击回调；
- `tests/unit/frontend/components/editor/ThemeEditor.test.tsx`：selector 位于主题色板上方且透传应用事件；
- `tests/unit/frontend/components/editor/RadarEditor.test.tsx`：应用后全部页面和两类对比视觉同步，用户数据不变。

所有实现遵循 RED → GREEN → REFACTOR；每个行为测试必须先以预期原因失败。

### 8.2 开发环境集成测试

- `tests/dev-integration/frontend/components/editor/RadarEditor.test.tsx`：从真实编辑器交互点击 preset，验证标准页与对比组获得统一风格，同时原页面数据和模式保持不变。

### 8.3 自动验证命令

在 `frontend/` 运行：

```bash
pnpm test:unit
pnpm test:integration
pnpm lint
pnpm build
node scripts/sample-presets.mjs
```

采样脚本的实际运行与五张 PNG 的多模态检查是视觉验收证据，不能用快照测试替代。

## 9. 错误处理与兼容性

- 内置 preset 在模块加载时由 Zod 解析；无效常量应使开发/测试立即失败，禁止静默回退；
- `applyPresetToConfig` 只接收已解析的 `RadarPreset`，不处理任意外部 JSON；
- 对旧 localStorage 中缺省的 comparison overlay，应用时以现有 `defaultOverlayHighlightConfig` 补齐后再合并视觉字段；
- 现有默认配置行为不改变：未点击 preset 的用户继续看到当前默认主题；
- `classic-indigo` 的 token 与现有默认表现保持等价，提供无迁移成本的兼容入口。

## 10. 交付顺序

1. 类型、五套 token 与白名单应用函数；
2. selector 与整份配置交互；
3. 采样入口、脚本和忽略规则；
4. 自动测试、lint、build；
5. 逐帧多模态检查并迭代；
6. 先向用户展示五张三模式预览图；
7. 用户确认视觉结果后，再完成 Issue #42/分支集成收尾。
