# 内置视觉预设 Playwright E2E 设计

## 背景

PR #88 已为五套内置视觉预设补充单元测试与开发环境集成测试，但缺少在真实浏览器、真实后端与真实测试库环境中执行的专用 Playwright 用户旅程。本设计补齐该层验证，范围仅限预设应用行为，不重复现有保存/加载 E2E。

## 目标

新增一条聚焦的 GUI E2E 用户旅程，证明用户能够在编辑器中应用内置预设，并且：

- 标准页面获得该预设的页面样式；
- transition 对比获得该预设的 transition 样式；
- 将同一对比切换为 overlay 后，获得该预设的 overlay 样式；
- 页面名称、角色数值与动画时长等用户数据保持不变；
- preset 不创建页面、不创建对比，也不替用户切换对比布局。

## 方案选择

采用单条完整旅程，而不是三条重复旅程或截图基线：

- 单条旅程只注册一次测试账户，减少真实后端交互和 CI 时间；
- transition 与 overlay 在同一个对比上顺序验证，可直接证明 preset 不负责切换布局；
- 断言语义控件、表单值和真实 Player DOM，比依赖字体栅格化结果的像素截图更稳定；
- Remotion 关键帧视觉数学继续由既有单测和采样联系表负责，本 E2E 只验证真实浏览器中的用户链路与配置落地。

## 文件与组织

新增：

`tests/testenv-integration/frontend/preset-application.spec.ts`

该文件按用户旅程命名，符合 testenv 前端 E2E 的模块镜像豁免。测试使用现有 `registerAndLanding` helper，不硬编码后端、数据库或凭据。

## 用户旅程

1. 注册测试账户并进入 `/app`。
2. 在默认标准页设置用户数据哨兵：角色名 `E2E-PRESET-SENTINEL`、首个属性值 `137`、`fillDuration=73`。
3. 在全局页签添加第二页，并通过现有页面编排按钮建立 comparison；确认布局仍为默认 `transition`。
4. 返回动画细节页签，点击语义按钮“应用预设：薄荷终端”。
5. 验证五套预设按钮均可见，并验证当前页的代表性样式已变为 `mint-terminal`：背景色文本为 `#041714`、雷达 X 为 `1390`、雷达 Y 为 `540`、网格环数为 `4`。
6. 选择另一页面，验证同一代表性页面样式也已应用，证明是整份多页配置级应用。
7. 验证用户数据哨兵未变化：角色名、首个属性值和 `fillDuration` 保持原值。
8. 在对比页签验证布局仍为 `transition`，并验证 `polygonMode=extend`、`legendDotRadius=5`，证明 transition 样式已应用但布局未被 preset 改写。
9. 由用户操作把布局切为 `overlay`，验证 `glowRadius=14`、`arrowSize=22` 和 `dimOpacity=0.16`。
10. 验证真实 Player 仍渲染 SVG 雷达节点，排除配置更新导致预览崩溃。

## 选择器与断言策略

- 优先使用 `getByRole`、可访问名称与现有 `data-field-id`；不依赖 Tailwind class 或 DOM 层级。
- 预设按钮使用已存在的 `aria-label` 与 `data-preset-id`。
- 数值型字段使用对应 `data-field-id` 下的 `input[type="number"]` 断言。
- 对比布局使用现有“对比布局”combobox；transition/overlay 专属字段使用 `comparison:0:*` 的稳定 field id。
- 背景色通过主题编辑器中展示的精确文本 `#041714` 断言，不操作颜色弹窗，也不依赖浏览器对 `input[type="color"]` 的归一化行为。
- Player 健康断言沿用现有 E2E：轮询 `svg polygon, svg path` 数量大于零。

## 非目标

- 不验证保存、刷新、重新加载；现有 `comparison-overlay.spec.ts` 已覆盖配置持久化往返。
- 不创建截图基线，也不做像素级视觉回归。
- 不遍历五套预设逐一执行完整旅程；schema、五套配置完整性与采样一致性已有单元测试覆盖。E2E 选择 `mint-terminal` 作为代表。
- 不测试后端业务逻辑；仅复用真实 testenv 的注册与编辑器入口。

## 失败与隔离

- 测试账户继续使用 `registerAndLanding` 的唯一标识策略，避免与其他测试冲突。
- 测试只修改浏览器内当前编辑器配置，不依赖开发者本地配置或私有数据。
- 若 testenv 未注入可用后端/测试库，测试应像其他 GUI E2E 一样由环境启动失败显式暴露，而不是添加 mock 或静默跳过。

## 验证与交付

实现后按顺序执行：

1. 目标 Playwright spec；
2. `pnpm test:unit`；
3. `pnpm test:integration`；
4. `pnpm lint`；
5. `pnpm build`。

随后使用符合仓库规范的中文 Conventional Commit、DCO 签名与 Codex co-author trailer 提交，并 push 到 `feat/built-in-style-presets`，触发 PR #88 的 GitHub Actions。
