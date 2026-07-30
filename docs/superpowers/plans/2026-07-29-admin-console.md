# Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Next.js 前端和 FastAPI 后端中交付一期管理员控制台，覆盖混淆入口、公共资源、用户与权限、使用审计、渲染运维和系统 Dashboard，并通过三阶自动化测试。

**Architecture:** Next.js `proxy.ts` 将运行时密钥路径重写到内部 `control-internal` 路由；FastAPI 以数据库中的 `is_active` 与 `is_admin` 作为唯一安全边界。公共资源使用独立命名卷，管理员领域 API/服务集中在 `app/api/v1/admin/` 与 `app/service/admin/`，审计事件和渲染历史落 PostgreSQL，实时队列指标来自现有 `RenderQueue`。

**Tech Stack:** Python 3.11+、FastAPI、SQLAlchemy async、Alembic、Pydantic v2、PostgreSQL/SQLite 测试；Next.js 16.2、React 19、TypeScript、Tailwind CSS、Vitest/Testing Library/MSW、Playwright；Docker Compose、GitHub Actions。

## Global Constraints

- 只在 `feat/admin-console` 分支的 `.worktrees/admin-console` worktree 中开发。
- 所有行为变更遵循 RED → GREEN → REFACTOR；每个测试先验证因缺少目标行为而失败。
- Python/TypeScript 测试路径遵守仓库 `AGENTS.md` 的源码镜像规则；Playwright 以用户旅程组织。
- 管理 API 必须使用 `CurrentAdminDep`；混淆路径不是授权机制。
- 不记录密码、token、完整请求体、完整 `input_props`、原始 IP 或完整 User-Agent。
- `frontend/public` 不作为线上 seed；公共资源由管理员上线后上传到独立卷。
- 后端依赖不新增；若实施中确需新增，必须先改 `pyproject.toml`，再用仓库规定的 `uv lock`/`uv export` 顺序重生锁文件。
- 每次 commit 使用中文 Conventional Commit 标题、`git commit -s`，并带 Codex Co-Author footer。
- 五个功能阶段各自一个 commit；设计和计划文档可各自独立提交。

## Build and Path Audit

动手修改 Compose 前，逐项以当前文件为准复核，不能只检查 builder 阶段：

| 文件:当前行 | 当前指令/挂载 | 依赖运行时公共路径 | 处置 |
| --- | --- | --- | --- |
| `deploy/docker-compose.yml:87` | `../frontend/public:/app/public_assets` | 是 | 改为 `public_assets:/app/public_assets` |
| `deploy/docker-compose.yml:89` | `render_tmp:/app/public_assets/_render_tmp` | 嵌套挂载 | 保留 |
| `deploy/docker-compose.yml:162` | `render_tmp:/app/public/_render_tmp` | 嵌套挂载 | 保留 |
| `deploy/docker-compose.yml:166` | `backend_storage:/app/public/_user_media:ro` | 嵌套挂载 | 保留 |
| `deploy/docker-compose.dev.yml:64` | frontend public → backend | 是 | 改为 `public_assets:/app/public_assets` |
| `deploy/docker-compose.dev.yml:87` | frontend public → frontend | 是 | 改为 `public_assets:/app/public:ro` |
| `deploy/docker-compose.dev.yml:124` | frontend public → worker | 是 | 改为 `public_assets:/app/public:ro` |
| `deploy/frontend/Dockerfile:149` | builder public → production public | 构建时 | 保留，运行时由卷遮蔽 |
| `deploy/render-worker/Dockerfile:71` | frontend public → development | 构建时 | 保留 |
| `deploy/render-worker/Dockerfile:108` | frontend public → builder | 构建时 | 保留 |
| `deploy/render-worker/Dockerfile:174` | builder public → production | 构建时 | 保留，运行时由卷遮蔽 |
| `deploy/backend/Dockerfile:127` | 创建 `/app/public_assets/_render_tmp` | 卷权限 | 扩展为公共分类目录和可写权限准备 |
| `.github/workflows/e2e.yml:34` | 宿主机 `frontend/public` seed | 是 | 改为测试系统在容器/公共卷内注入；所有 compose 步骤继续设置 `PIP_INDEX: ''` |

---

## Task 1: Stage 1 — 管理员身份、账号状态、混淆入口与 API 守卫

**Files:**

- Modify: `backend/app/models/user.py`
- Modify: `backend/app/dao/orm.py`
- Modify: `backend/app/dao/user_dao.py`
- Modify: `backend/app/service/user_service.py`
- Modify: `backend/app/service/auth_service.py`
- Modify: `backend/app/service/oauth_service.py`
- Modify: `backend/app/api/deps.py`
- Modify: `backend/app/schemas/auth.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/core/exceptions.py`
- Create: `backend/app/api/v1/admin/__init__.py`
- Create: `backend/app/api/v1/admin/session_router.py`
- Create: `backend/app/schemas/admin.py`
- Modify: `backend/app/api/v1/router.py`
- Create: `backend/alembic/versions/a7c3e1f902b4_admin_console_foundation.py`
- Create: `frontend/src/proxy.ts`
- Create: `frontend/src/app/control-internal/layout.tsx`
- Create: `frontend/src/app/control-internal/page.tsx`
- Create: `frontend/src/components/admin/AdminGuard.tsx`
- Create: `frontend/src/components/admin/AdminShell.tsx`
- Modify: `frontend/src/lib/api-client.ts`
- Modify: `frontend/src/lib/auth-store.ts`
- Test: `tests/unit/backend/models/test_user.py`
- Test: `tests/unit/backend/dao/test_user_dao.py`
- Test: `tests/unit/backend/service/test_auth_service.py`
- Create: `tests/unit/backend/api/test_deps.py`
- Create: `tests/unit/backend/api/v1/admin/test_session_router.py`
- Create: `tests/unit/frontend/proxy.test.ts`
- Create: `tests/unit/frontend/components/admin/AdminGuard.test.tsx`
- Create: `tests/unit/frontend/components/admin/AdminShell.test.tsx`
- Modify: `tests/unit/frontend/lib/api-client.test.ts`
- Modify: `tests/dev-integration/backend/api/v1/test_auth_router.py`
- Create: `tests/dev-integration/backend/api/v1/admin/test_session_router.py`

- [ ] **RED:** 增加用户领域/DAO/认证测试，证明默认 active、管理员字段映射、停用账号拒绝受保护接口、首次匹配 `INITIAL_ADMIN_EMAIL` 且数据库无管理员时自动提升，以及不能通过普通登录绕过停用状态。
- [ ] **RED:** 增加 admin session 路由测试，证明无 token=401、普通 active 用户=403 `admin_required`、disabled admin=403 `account_disabled`、active admin 可访问 `/api/v1/admin/me`。
- [ ] **RED:** 增加 proxy 与管理 guard 组件测试，证明 secret 缺失/非法时 fail closed、正确 secret rewrite、`/admin` 和直接 `/control-internal` 为 404，非管理员不呈现管理内容。
- [ ] 逐个运行目标测试并确认失败原因是字段、依赖、路由或组件尚不存在。
- [ ] **GREEN:** 增加 `is_admin`、`is_active`、`last_login_at` 全链路字段，数据库 migration 使用服务器默认值并建立必要索引。
- [ ] **GREEN:** 在 `deps.py` 实现 active/admin 依赖；补充稳定业务异常码；所有已有受保护路由改用 active 用户依赖。
- [ ] **GREEN:** 在认证成功路径更新时间、按引导规则提升首位管理员；不得缓存 JWT 角色。
- [ ] **GREEN:** 注册 admin router，返回最小管理员身份/capabilities 响应。
- [ ] **GREEN:** 实现运行时 `ADMIN_PATH_SECRET_STRING` 校验、rewrite 和内部路由拦截；实现高密度但最小可用的管理 Shell、导航与权限状态。
- [ ] **REFACTOR:** 消除认证路径重复并保持领域模型不 import API/ORM 类型。
- [ ] 运行阶段目标测试、后端 unit/dev-integration、前端 unit/integration；确认覆盖率门槛。
- [ ] 提交：`feat(admin): 建立管理员身份与混淆入口`。

## Task 2: Stage 2 — 独立公共资源卷与剪影/音乐 CRUD

**Files:**

- Create: `backend/app/models/public_asset.py`
- Create: `backend/app/service/admin/public_asset_service.py`
- Create: `backend/app/api/v1/admin/assets_router.py`
- Modify: `backend/app/api/v1/admin/__init__.py`
- Modify: `backend/app/api/v1/assets_router.py`
- Modify: `backend/app/schemas/admin.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/core/exceptions.py`
- Modify: `deploy/docker-compose.yml`
- Modify: `deploy/docker-compose.dev.yml`
- Modify: `deploy/backend/Dockerfile`
- Modify: `.github/workflows/e2e.yml`
- Modify: `deploy/README.md`
- Modify: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/hooks/admin/useAdminAssets.ts`
- Create: `frontend/src/components/admin/assets/AssetManager.tsx`
- Create: `frontend/src/app/control-internal/assets/page.tsx`
- Create: `tests/unit/backend/models/test_public_asset.py`
- Create: `tests/unit/backend/service/admin/test_public_asset_service.py`
- Create: `tests/unit/backend/api/v1/admin/test_assets_router.py`
- Modify: `tests/dev-integration/backend/api/v1/test_assets_router.py`
- Create: `tests/dev-integration/backend/api/v1/admin/test_assets_router.py`
- Modify: `tests/unit/frontend/lib/api-client.test.ts`
- Create: `tests/unit/frontend/hooks/admin/useAdminAssets.test.ts`
- Create: `tests/unit/frontend/components/admin/assets/AssetManager.test.tsx`

- [ ] **RED:** 用临时目录写服务测试，覆盖固定分类、扩展名、basename/control-char、100 MiB 限额、默认 409、显式覆盖、原子替换、删除 404、列表排序和零文件空态。
- [ ] **RED:** 路由测试覆盖 admin-only multipart 上传/覆盖/删除及公开 GET 仍无需认证。
- [ ] **RED:** 前端测试覆盖双分类、上传进度、冲突二次确认、删除确认、成功后刷新和 API 错误态。
- [ ] 运行目标测试并确认预期失败。
- [ ] **GREEN:** 提取单一公共资源服务供公开与管理路由复用，写入使用同目录临时文件与 `Path.replace`。
- [ ] **GREEN:** 实现 admin assets API 和前端管理页；二进制下载继续复用公开路由。
- [ ] **GREEN:** 按审计表把 backend/frontend/worker 接到 `radar_public_assets`；保留 `_render_tmp` 与 `_user_media` 嵌套挂载；不复制 `frontend/public` 内容。
- [ ] **GREEN:** e2e seed 改为测试系统向运行中卷注入，Compose 命令全部显式保留 `PIP_INDEX: ''`。
- [ ] **REFACTOR:** 公共扩展名/文件名校验只保留一个事实来源。
- [ ] 运行目标测试、四套本地自动测试，并执行 `docker compose config` 静态验证。
- [ ] 提交：`feat(admin): 增加公共资源持久化管理`。

## Task 3: Stage 3 — 用户权限控制与使用审计

**Files:**

- Create: `backend/app/models/audit_event.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/dao/audit_event_dao.py`
- Modify: `backend/app/dao/user_dao.py`
- Modify: `backend/app/dao/render_task_dao.py`
- Create: `backend/app/service/audit_service.py`
- Create: `backend/app/service/admin/user_admin_service.py`
- Create: `backend/app/api/v1/admin/users_router.py`
- Create: `backend/app/api/v1/admin/audit_router.py`
- Modify: `backend/app/schemas/admin.py`
- Modify: `backend/app/dao/orm.py`
- Modify: `backend/app/service/auth_service.py`
- Modify: `backend/app/api/v1/files_router.py`
- Modify: `backend/app/api/v1/render_router.py`
- Modify: `backend/app/api/v1/tasks_router.py`
- Modify: `backend/app/service/gc_service.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/alembic/versions/a7c3e1f902b4_admin_console_foundation.py`
- Modify: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/hooks/admin/useAdminUsers.ts`
- Create: `frontend/src/hooks/admin/useAuditEvents.ts`
- Create: `frontend/src/components/admin/users/UserTable.tsx`
- Create: `frontend/src/components/admin/users/UserDetail.tsx`
- Create: `frontend/src/components/admin/activity/AuditTable.tsx`
- Create: `frontend/src/app/control-internal/users/page.tsx`
- Create: `frontend/src/app/control-internal/users/[userId]/page.tsx`
- Create: `frontend/src/app/control-internal/activity/page.tsx`
- Create: `tests/unit/backend/models/test_audit_event.py`
- Create: `tests/unit/backend/dao/test_audit_event_dao.py`
- Create: `tests/unit/backend/service/test_audit_service.py`
- Create: `tests/unit/backend/service/admin/test_user_admin_service.py`
- Create: `tests/unit/backend/api/v1/admin/test_users_router.py`
- Create: `tests/unit/backend/api/v1/admin/test_audit_router.py`
- Create: `tests/dev-integration/backend/api/v1/admin/test_users_router.py`
- Create: `tests/dev-integration/backend/api/v1/admin/test_audit_router.py`
- Create: `tests/unit/frontend/hooks/admin/useAdminUsers.test.ts`
- Create: `tests/unit/frontend/hooks/admin/useAuditEvents.test.ts`
- Create: `tests/unit/frontend/components/admin/users/UserTable.test.tsx`
- Create: `tests/unit/frontend/components/admin/users/UserDetail.test.tsx`
- Create: `tests/unit/frontend/components/admin/activity/AuditTable.test.tsx`

- [ ] **RED:** 测试审计模型/DAO 的白名单 metadata、游标分页、筛选、180 天清理和 UTC 时间。
- [ ] **RED:** 测试用户搜索/筛选/详情汇总，角色与状态修改，并覆盖禁止自我停用、自我撤权、停用或撤权最后一位 active admin 的事务保护。
- [ ] **RED:** 测试登录、上传/覆盖/删除、渲染提交/取消/删除/下载与管理员资源/权限动作生成不含敏感字段的事件。
- [ ] **RED:** 前端测试覆盖用户表筛选、详情统计、危险操作确认、操作后即时刷新和审计筛选分页。
- [ ] 运行目标测试并确认预期失败。
- [ ] **GREEN:** 新增 `audit_events` ORM/domain/DAO/service 与 migration；定义 `AuditAction` 枚举和结构化 metadata 模型。
- [ ] **GREEN:** 在现有动作成功边界写事件；失败事件仅对明确需要追踪的认证/管理员操作写入，不把秘密写进异常或日志。
- [ ] **GREEN:** 实现用户列表/详情/角色/状态/activity 与全局 audit API，存储用量扫描失败返回 partial 标记。
- [ ] **GREEN:** GC 增加每天一次的审计保留清理。
- [ ] **GREEN:** 实现用户和活动管理页。
- [ ] **REFACTOR:** 共享分页响应、时间范围和筛选模型，避免裸 dict 跨层传递。
- [ ] 运行目标测试及四套自动测试。
- [ ] 提交：`feat(admin): 完成用户权限与使用审计`。

## Task 4: Stage 4 — 全局渲染队列、进度与历史运维

**Files:**

- Modify: `backend/app/models/render_task.py`
- Modify: `backend/app/dao/orm.py`
- Modify: `backend/app/dao/render_task_dao.py`
- Modify: `backend/app/service/queue_service.py`
- Modify: `backend/app/service/task_service.py`
- Create: `backend/app/service/admin/render_admin_service.py`
- Create: `backend/app/api/v1/admin/render_router.py`
- Modify: `backend/app/schemas/admin.py`
- Modify: `backend/alembic/versions/a7c3e1f902b4_admin_console_foundation.py`
- Modify: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/hooks/admin/useAdminRender.ts`
- Create: `frontend/src/components/admin/render/ActiveRenderTable.tsx`
- Create: `frontend/src/components/admin/render/RenderHistoryTable.tsx`
- Create: `frontend/src/app/control-internal/render/page.tsx`
- Modify: `tests/unit/backend/models/test_render_task.py`
- Modify: `tests/unit/backend/dao/test_render_task_dao.py`
- Modify: `tests/unit/backend/service/test_queue_service.py`
- Create: `tests/unit/backend/service/admin/test_render_admin_service.py`
- Create: `tests/unit/backend/api/v1/admin/test_render_router.py`
- Create: `tests/dev-integration/backend/api/v1/admin/test_render_router.py`
- Create: `tests/unit/frontend/hooks/admin/useAdminRender.test.ts`
- Create: `tests/unit/frontend/components/admin/render/ActiveRenderTable.test.tsx`
- Create: `tests/unit/frontend/components/admin/render/RenderHistoryTable.test.tsx`

- [ ] **RED:** 测试 RenderQueue 全局快照包含 pending/running、position、rendered/total frames、ETA、近期 FPS，且返回不可变领域模型而非内部结构。
- [ ] **RED:** 测试历史筛选/分页和管理员取消；已结束取消返回 409。
- [ ] **RED:** 测试仅 failed/canceled 可 retry，新任务复用用户/mode/codec/input props、生成独立输出路径并设置 `retry_of_task_id`，原任务不变。
- [ ] **RED:** 前端测试覆盖 active 自动轮询、历史筛选、确认取消/重试、操作结果和错误恢复。
- [ ] 运行目标测试并确认预期失败。
- [ ] **GREEN:** 增加 retry 关联 migration/模型映射和 DAO 查询。
- [ ] **GREEN:** 为队列增加只读 admin snapshot；实现 history/cancel/retry API 和审计事件。
- [ ] **GREEN:** 实现渲染运维页；仅 active 视图短轮询，页面隐藏时暂停。
- [ ] **REFACTOR:** 复用现有 task response/进度计算，不复制 ETA/FPS 算法。
- [ ] 运行目标测试及四套自动测试。
- [ ] 提交：`feat(admin): 提供全局渲染任务运维`。

## Task 5: Stage 5 — 系统 Dashboard、健康状态与完整 E2E

**Files:**

- Create: `backend/app/models/admin_dashboard.py`
- Create: `backend/app/service/admin/dashboard_service.py`
- Create: `backend/app/service/admin/system_health_service.py`
- Create: `backend/app/api/v1/admin/dashboard_router.py`
- Create: `backend/app/api/v1/admin/system_router.py`
- Modify: `backend/app/schemas/admin.py`
- Modify: `backend/app/core/lifespan.py`
- Modify: `backend/app/clients/render_worker_client.py`
- Modify: `frontend/src/lib/api-client.ts`
- Create: `frontend/src/hooks/admin/useAdminDashboard.ts`
- Create: `frontend/src/hooks/admin/useSystemHealth.ts`
- Create: `frontend/src/components/admin/dashboard/KpiGrid.tsx`
- Create: `frontend/src/components/admin/dashboard/QueueOverview.tsx`
- Create: `frontend/src/components/admin/dashboard/HealthPanel.tsx`
- Modify: `frontend/src/app/control-internal/page.tsx`
- Create: `frontend/src/app/control-internal/system/page.tsx`
- Create: `tests/unit/backend/models/test_admin_dashboard.py`
- Create: `tests/unit/backend/service/admin/test_dashboard_service.py`
- Create: `tests/unit/backend/service/admin/test_system_health_service.py`
- Create: `tests/unit/backend/api/v1/admin/test_dashboard_router.py`
- Create: `tests/unit/backend/api/v1/admin/test_system_router.py`
- Create: `tests/dev-integration/backend/api/v1/admin/test_dashboard_router.py`
- Create: `tests/dev-integration/backend/api/v1/admin/test_system_router.py`
- Create: `tests/unit/frontend/hooks/admin/useAdminDashboard.test.ts`
- Create: `tests/unit/frontend/hooks/admin/useSystemHealth.test.ts`
- Create: `tests/unit/frontend/components/admin/dashboard/KpiGrid.test.tsx`
- Create: `tests/unit/frontend/components/admin/dashboard/QueueOverview.test.tsx`
- Create: `tests/unit/frontend/components/admin/dashboard/HealthPanel.test.tsx`
- Create: `tests/testenv-integration/frontend/admin-access-control.spec.ts`
- Create: `tests/testenv-integration/frontend/admin-public-assets.spec.ts`
- Create: `tests/testenv-integration/frontend/admin-user-management.spec.ts`
- Create: `tests/testenv-integration/frontend/admin-render-operations.spec.ts`
- Create: `tests/testenv-integration/frontend/admin-dashboard.spec.ts`
- Create: `tests/testenv-integration/frontend/admin-helpers.ts`
- Create: `tests/data/frontend/admin/sample-silhouette.svg`
- Create: `tests/data/frontend/admin/sample-music.flac`

- [ ] **RED:** 后端测试覆盖 `24h|7d|30d` 用户/渲染/成功率/平均和 P95 指标、队列并发/FPS、三类存储 count/bytes、近期失败和规范化错误聚合；空数据时数值稳定。
- [ ] **RED:** 健康测试覆盖 DB `SELECT 1`、worker timeout/degraded、三个目录可读写/只读预期、磁盘空间、uptime，且不泄露绝对宿主路径或配置秘密。
- [ ] **RED:** 前端测试覆盖 KPI、健康降级、队列占用、空态/错误重试、range 切换和 system 详情。
- [ ] **RED:** 编写五条 Playwright 真实旅程，所有账号、路径 secret、API URL 和 seed 能力由测试系统环境注入；先对当前系统运行并确认按缺失管理能力失败。
- [ ] **GREEN:** 实现聚合领域模型、SQL/文件系统指标服务、短超时 worker health 和 admin endpoints。
- [ ] **GREEN:** 实现 Dashboard 与 system 页，不引入新图表依赖；用现有设计 token 和语义化 HTML 呈现趋势/分布。
- [ ] **GREEN:** 完成 Playwright helper 与旅程：入口/权限、资源 CRUD、用户权限、渲染运维、Dashboard/health。
- [ ] **REFACTOR:** 统一格式化、loading/empty/error/degraded 组件，确保移动端可用和键盘可操作。
- [ ] 运行目标测试、全套测试和构建验证。
- [ ] 提交：`feat(admin): 交付系统看板与端到端测试`。

## Task 6: Final Verification, Issue, Push, PR and CI Monitoring

- [ ] 后端格式/静态检查：`cd backend && uv run ruff check app ../tests`。
- [ ] 后端 unit：`cd backend && uv run pytest ../tests/unit/backend/ -v`。
- [ ] 后端 dev-integration：`cd backend && uv run pytest ../tests/dev-integration/backend/ -v`。
- [ ] 前端 lint：`cd frontend && pnpm lint`。
- [ ] 前端 unit：`cd frontend && pnpm test:unit`。
- [ ] 前端 dev-integration：`cd frontend && pnpm test:integration`。
- [ ] 前端 production build：`cd frontend && pnpm build`。
- [ ] Compose 静态验证：在 `deploy/` 注入非敏感占位环境后运行 `docker compose config`。
- [ ] 若测试系统已提供真实 DB/baseURL/seed，运行后端 testenv：`cd backend && uv run pytest ../tests/testenv-integration/backend/ -v`。
- [ ] 运行 Playwright：`cd frontend && pnpm exec playwright test ../tests/testenv-integration/frontend/`；若本地环境未注入，记录精确缺失变量并由 CI 验证，不能硬编码绕过。
- [ ] 检查 `git diff --check`、迁移 head、DCO、五阶段 commit 和 worktree clean 状态。
- [ ] 使用 GitHub CLI 创建描述需求、验收标准和指标范围的 Issue。
- [ ] 推送 `feat/admin-console` 到 `origin`。
- [ ] 创建关联 Issue（`Closes #...`）的 PR，正文附五阶段变更、测试证据、部署变量和迁移步骤。
- [ ] 每隔 300 秒运行一次 `gh pr checks`/`gh run view`；失败则下载日志、按 systematic-debugging 写回归测试后修复、提交并 push。
- [ ] 直到所有必需 GitHub Actions 成功后，再报告 PR、Issue、commit 和最终验证结果。

## Commit Sequence

1. `docs(admin): 设计管理员控制台一期架构`
2. `docs(admin): 制定管理员控制台开发计划`
3. `feat(admin): 建立管理员身份与混淆入口`
4. `feat(admin): 增加公共资源持久化管理`
5. `feat(admin): 完成用户权限与使用审计`
6. `feat(admin): 提供全局渲染任务运维`
7. `feat(admin): 交付系统看板与端到端测试`
