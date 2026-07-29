# 管理员控制台设计

## 1. 背景

当前系统只有普通用户界面和用户级文件、渲染任务能力。公共剪影与音乐由
`frontend/public/` 提供，backend 只开放无需认证的列举和下载接口；系统不存在管理员
角色、管理员 API、运营审计、全局任务视图或系统状态面板。

本设计在现有 Next.js 前端中增加一个通过混淆路径访问的管理区域，并在现有 FastAPI
后端中增加强制管理员鉴权的管理 API。混淆路径只用于降低无目标扫描，不作为安全边界；
真正的安全边界是数据库中的管理员权限、账号启用状态和每个管理 API 的服务端鉴权。

一期作为一次统一交付完成，但拆成五个连续阶段开发，每个阶段单独 commit：

1. 管理员身份、账号停用、混淆入口和 API 鉴权。
2. 独立公共资源存储以及剪影、音乐 CRUD。
3. 用户列表、权限控制和使用审计。
4. 当前渲染队列、进度、管理员任务操作和历史查询。
5. 系统 Dashboard、聚合指标和完整 E2E 回归。

## 2. 目标与非目标

### 2.1 目标

- 在现有前端内提供独立视觉与导航结构的管理员控制台。
- 外部访问路径由部署环境变量控制，直接访问可猜测的内部路径返回 404。
- 管理员权限可由初始管理员引导建立，并在控制台内授予或撤销。
- 管理员可启用或停用普通用户；停用状态立即作用于所有受保护 API。
- 管理员可上传、覆盖、下载和删除公共剪影与音乐。
- 公共资源存放在独立持久卷中，不从 Git 或镜像 seed，不在部署时覆盖线上内容。
- 提供关键用户活动审计、全局渲染队列与历史、系统健康和运营指标。
- 所有新能力具备 unit、dev-integration 和真实 Playwright E2E 覆盖。

### 2.2 非目标

- 不创建单独的管理员前端应用或独立域名。
- 不把混淆路径当作认证或授权机制。
- 不实现多级 RBAC；一期只有普通用户与管理员两种角色。
- 不引入 Prometheus、Grafana、Redis 或外部队列。
- 不支持任意公共资源分类；一期只有 `silhouettes` 与 `music`。
- 不记录密码、Token、完整请求体、完整 `input_props`、原始 IP 或完整 User-Agent。
- 不自动把仓库中的 `frontend/public/` 文件复制到新公共资源卷。
- 不解决多 backend 副本的队列共享；一期保持当前单 backend 进程队列模型。

## 3. 总体架构

```text
浏览器
  │  /<ADMIN_PATH_SECRET_STRING>/...
  ▼
Next.js proxy.ts ──rewrite──► 内部 /control-internal/... 页面
  │                               │
  │                               ├─ 普通登录状态
  │                               └─ GET /api/v1/admin/me
  ▼
FastAPI /api/v1/admin/*
  │
  ├─ CurrentAdminDep：有效 JWT + is_active + is_admin
  ├─ PostgreSQL：用户、任务、审计事件、聚合查询
  ├─ RenderQueue：当前排队、运行、帧进度、ETA、近期 FPS
  ├─ public_assets：公共剪影与音乐的唯一文件事实来源
  └─ backend_storage：用户上传与渲染产物
```

前端、backend 与 render-worker 继续部署在同一个 Compose 应用中。管理员页面沿用现有
认证状态和 API client，但使用独立的管理布局、导航与查询 hooks。后端管理路由集中在
`app/api/v1/admin/`，领域逻辑集中在 `app/service/admin/`，避免把管理员分支散落到普通
用户路由。

## 4. 安全设计

### 4.1 混淆路径

- 新增仅存在于 frontend 运行时环境的 `ADMIN_PATH_SECRET_STRING`。
- 值必须是 24 至 96 个 URL-safe 字符，不能使用 `admin`、`manage`、`dashboard` 等保留值。
- 使用 Next.js 16 的 `frontend/src/proxy.ts` 在运行时读取该环境变量。
- `/<secret>` 与 `/<secret>/*` 重写到内部 `/control-internal` 与
  `/control-internal/*`。
- proxy 在处理任何 rewrite 之前先拦截浏览器直接请求 `/control-internal/*`，并 rewrite
  到专用 404 页面；内部 rewrite 不会再次进入 proxy，因此不依赖可伪造的请求 header。
- 直接访问 `/admin`、`/control-internal` 或错误 secret 均返回 404，不重定向到登录页，以免暴露
  管理区存在。
- 管理区内导航使用相对路径，避免把 secret 写入构建产物、翻译文件或公开配置。
- secret 不使用 `NEXT_PUBLIC_` 前缀、不写日志、不通过 API 返回。

混淆路径被泄露时，未登录用户仍只能进入普通登录流程；非管理员登录后访问管理 API
得到 403。所有写操作仍经过管理员鉴权和审计。

### 4.2 用户权限与账号状态

`users` 表新增：

- `is_admin: bool`，默认 `false`，建索引。
- `is_active: bool`，默认 `true`，建索引。
- `last_login_at: datetime | null`。

领域 `User`、ORM、DAO、认证响应与 `/auth/me` 保持字段一致。JWT 不缓存角色；每次受保护
请求继续从数据库加载用户，因此撤权或停用立即生效。

新增依赖：

- `CurrentActiveUserDep`：拒绝 `is_active=false` 的用户，返回 403 和稳定业务错误码
  `account_disabled`。
- `CurrentAdminDep`：在 active 校验后要求 `is_admin=true`，否则返回 403 和
  `admin_required`。

### 4.3 初始管理员

- backend 环境变量 `INITIAL_ADMIN_EMAIL` 指定一个初始管理员邮箱。
- 用户成功注册或登录后，仅在数据库中当前不存在任何管理员且邮箱匹配时授予管理员。
- 一旦存在管理员，环境变量不再自动提升其他用户，也不会重新提升已被撤权的用户。
- 禁止停用自己、撤销自己的管理员权限，且禁止撤销或停用最后一个 active 管理员。
- 所有管理员授予、撤销、启用和停用操作写入审计表。

## 5. 数据模型

### 5.1 审计事件

新增 `audit_events` 表：

- `id: bigint` 主键。
- `actor_user_id: bigint | null`，系统事件允许为空。
- `subject_user_id: bigint | null`，面向用户的操作记录目标用户。
- `action: string`，使用代码内 `AuditAction` 枚举。
- `resource_type: string | null`。
- `resource_id: string | null`。
- `success: bool`。
- `metadata: json`，只存经过 schema 白名单过滤的非敏感字段。
- `created_at: UTC datetime`，建索引。

一期动作集合：

- `auth.login_succeeded`
- `user.upload_created`、`user.upload_replaced`、`user.upload_deleted`
- `render.submitted`、`render.canceled`、`render.deleted`、`render.downloaded`
- `admin.user_activated`、`admin.user_deactivated`
- `admin.role_granted`、`admin.role_revoked`
- `admin.asset_created`、`admin.asset_replaced`、`admin.asset_deleted`
- `admin.render_canceled`、`admin.render_retried`

审计事件默认保留 180 天，由现有后台 GC 生命周期增加每日清理；保留天数通过
`AUDIT_RETENTION_DAYS` 配置。管理员查询支持时间范围、用户、动作、成功状态和游标分页。

### 5.2 渲染重试关联

`render_tasks` 新增可空 `retry_of_task_id`，指向原任务。管理员重试失败或取消任务时创建
新任务，复用原始 `user_id`、`mode`、`codec` 和 `input_props`，生成新的输出路径并入队，
保留原任务历史。

## 6. 公共资源管理与存储

### 6.1 文件布局

公共资源卷是文件的唯一事实来源：

```text
public_assets/
  silhouettes/
  music/
```

首次部署创建空目录，不复制 `frontend/public/` 中的文件。管理员上线后通过管理控制台
上传文件。缺失分类目录时 backend 自动创建；普通资源列举接口对空目录返回空数组。

### 6.2 Compose 挂载

新增命名卷：

```yaml
volumes:
  public_assets:
    name: radar_public_assets
```

运行时挂载：

| 服务 | 目标路径 | 权限 | 用途 |
| --- | --- | --- | --- |
| backend | `/app/public_assets` | 读写 | 列举、下载和管理员 CRUD |
| frontend | `/app/public` | 只读 | 浏览器通过 `/silhouettes/*`、`/music/*` 读取 |
| render-worker | `/app/public` | 只读 | Remotion `publicDir` 在 bundle 时读取 |

render-worker 继续在 `/app/public/_render_tmp` 挂载可写 `render_tmp`，在
`/app/public/_user_media` 挂载只读 `backend_storage`。backend 继续在
`/app/public_assets/_render_tmp` 挂载同一个 `render_tmp`。嵌套挂载覆盖父卷对应子目录。

开发 Compose 同样使用 `public_assets`，不再把 `../frontend/public` 作为运行时公共资源
来源。三个 Dockerfile 中现有的 `COPY frontend/public` 保留，保证构建目录存在；运行时
命名卷覆盖该目录，镜像内容不是线上 seed。

### 6.3 管理规则

- 分类固定为 `silhouettes` 与 `music`。
- 剪影允许现有 `_IMAGE_EXTS`，音乐允许现有 `_AUDIO_EXTS`。
- 文件名必须是单一 basename，拒绝空名、点目录、路径分隔符和控制字符。
- 单文件默认上限 100 MiB，通过 `MAX_PUBLIC_ASSET_BYTES` 配置。
- 上传采用同目录临时文件加原子替换，避免并发读取半文件。
- 默认不覆盖同名文件并返回 409；UI 明确二次确认后使用覆盖参数。
- 删除不存在文件返回 404；删除和覆盖均写审计。
- 普通 `/api/v1/assets/*` 保持公开只读；写操作只存在于 `/api/v1/admin/assets/*`。

## 7. 管理 API

所有列表 API 使用有上限的分页，默认 50、最大 200。错误沿用统一业务异常响应。

### 7.1 管理员会话

- `GET /api/v1/admin/me`：返回管理员公开身份和能力，用于管理 layout 守卫。

### 7.2 公共资源

- `GET /api/v1/admin/assets?category=`
- `POST /api/v1/admin/assets/{category}`，multipart 上传，支持显式 `overwrite`。
- `DELETE /api/v1/admin/assets/{category}/{name}`

下载继续复用公开的 `GET /api/v1/assets/{category}/{name}`。

### 7.3 用户与权限

- `GET /api/v1/admin/users`：搜索邮箱、用户名，按角色、状态、验证状态过滤。
- `GET /api/v1/admin/users/{user_id}`：身份、当前存储、渲染汇总、最近活动。
- `PATCH /api/v1/admin/users/{user_id}/role`
- `PATCH /api/v1/admin/users/{user_id}/status`
- `GET /api/v1/admin/users/{user_id}/activity`
- `GET /api/v1/admin/audit-events`

### 7.4 渲染队列与历史

- `GET /api/v1/admin/render/active`：排队与运行任务、位置、帧进度、ETA。
- `GET /api/v1/admin/render/history`：用户、状态、codec、mode、时间范围过滤。
- `POST /api/v1/admin/render/{task_id}/cancel`
- `POST /api/v1/admin/render/{task_id}/retry`

管理员取消沿用队列取消语义；管理员重试只允许 failed 或 canceled 任务，并创建关联的新任务。

### 7.5 Dashboard 与健康状态

- `GET /api/v1/admin/dashboard?range=24h|7d|30d`
- `GET /api/v1/admin/system/health`

Dashboard 返回：

- 用户总数、管理员数、已验证用户数、时间范围内活跃用户数。
- 渲染提交量、状态分布、成功率、平均和 P95 排队时间、平均和 P95 渲染时间。
- 当前 pending、running、配置并发、近期平均 FPS。
- 用户上传、渲染产物、公共资源的文件数和字节数。
- 最近失败任务和按规范化错误码聚合的主要错误。

系统健康返回 backend uptime、数据库 `SELECT 1`、render-worker `/health`、三个存储目录
可访问性和磁盘剩余空间。响应不包含环境变量、连接串、绝对宿主机路径或凭据。

## 8. 前端管理区

内部路由结构：

```text
frontend/src/app/control-internal/
  layout.tsx
  page.tsx                 # Dashboard
  assets/page.tsx
  users/page.tsx
  users/[userId]/page.tsx
  activity/page.tsx
  render/page.tsx
  system/page.tsx
```

管理布局包含桌面侧栏和移动端抽屉，视觉延续现有设计 token，但信息密度高于编辑器。页面：

- Dashboard：核心 KPI、服务健康、队列占用、近期开销与失败摘要。
- 公共资源：剪影网格、音乐列表、上传进度、覆盖确认和删除确认。
- 用户：搜索过滤表格、用户详情、角色与状态控制、使用汇总。
- 活动：审计事件筛选和分页。
- 渲染：active 队列与历史任务两个视图，实时轮询进度，取消和重试确认。
- 系统：服务、存储、版本和 uptime 详情。

管理区状态遵循：加载、空数据、可重试错误和权限失效四类明确状态。收到 401 时复用现有
刷新/登录流程；收到 `admin_required` 或 `account_disabled` 时清理管理区数据并显示不可访问
状态，不泄露 secret 以外的内部路由。

## 9. 指标计算与隐私

优先从现有事实来源实时计算：

- 用户身份与注册时间来自 `users`。
- 登录次数、最后活动和时间范围活跃用户来自 `audit_events`。
- 用户上传用量来自 `backend_storage/users/<uid>/uploads`。
- 渲染产物空间来自 `backend_storage/users/<uid>/outputs`。
- 渲染数量、状态、耗时和失败来自 `render_tasks`。
- 当前进度、位置、ETA 和 FPS 来自 `RenderQueue` 内存态。
- 公共资源用量来自 `public_assets`。

不创建重复的每日汇总表。一期数据量下由带索引的 SQL 聚合和文件系统扫描满足需求；文件
系统统计在单次请求中缓存，并设置短超时。后续若实际数据量导致 Dashboard 超时，再独立
设计异步聚合。

## 10. 错误处理与并发

- 管理 service 抛专用业务异常，接口层统一映射 400、403、404、409。
- 最后管理员保护在数据库事务内重新计数，避免并发撤权留下无管理员系统。
- 公共资源上传使用原子替换；删除与读取竞态返回稳定 404，不暴露文件系统异常。
- 管理员取消已结束任务返回 409；重试活动任务返回 409。
- worker 健康检查超时只让该子状态 degraded，不让整个 Dashboard API 失败。
- 单个用户目录不可读时记录系统错误并在响应中标记 partial，其他统计仍返回。

## 11. 数据库与部署迁移

Alembic 迁移一次性增加用户权限字段、审计表、渲染重试关联和必要索引。既有用户回填为
`is_admin=false`、`is_active=true`。部署前配置：

- backend：`INITIAL_ADMIN_EMAIL`、`AUDIT_RETENTION_DAYS`、
  `MAX_PUBLIC_ASSET_BYTES`。
- frontend：`ADMIN_PATH_SECRET_STRING`，只作为运行时环境变量。
- Compose：新增并共享 `public_assets` 命名卷。

上线顺序：部署新版本，使用匹配 `INITIAL_ADMIN_EMAIL` 的现有或新用户登录完成初始授权，
通过混淆路径进入控制台，再在线上传公共资源。生产不执行资源 seed。

### 11.1 构建与路径静态审计

本变更改变运行时公共资源根，以下位点必须逐条处理：

| 文件:行 | 当前指令/挂载 | 依赖路径？ | 处置 |
| --- | --- | --- | --- |
| `deploy/docker-compose.yml:87` | `../frontend/public:/app/public_assets` | 是 | 替换为 `public_assets:/app/public_assets` |
| `deploy/docker-compose.yml:89` | `render_tmp:/app/public_assets/_render_tmp` | 是，嵌套 | 保留 |
| `deploy/docker-compose.yml:162` | `render_tmp:/app/public/_render_tmp` | 是，嵌套 | 保留 |
| `deploy/docker-compose.yml:166` | `backend_storage:/app/public/_user_media:ro` | 是，嵌套 | 保留 |
| `deploy/docker-compose.dev.yml:64` | backend `../frontend/public` | 是 | 替换为公共资源卷 |
| `deploy/docker-compose.dev.yml:87` | frontend `../frontend/public` | 是 | 替换为只读公共资源卷 |
| `deploy/docker-compose.dev.yml:124` | worker `../frontend/public` | 是 | 替换为只读公共资源卷 |
| `deploy/frontend/Dockerfile:149` | `COPY --from=builder /app/public` | 仅镜像构建 | 保留，运行时被卷覆盖 |
| `deploy/render-worker/Dockerfile:71` | dev `COPY frontend/public` | 仅镜像构建 | 保留 |
| `deploy/render-worker/Dockerfile:108` | test `COPY frontend/public` | 仅镜像构建 | 保留 |
| `deploy/render-worker/Dockerfile:174` | production `COPY --from=builder /app/public` | 仅镜像构建 | 保留，运行时被卷覆盖 |
| `deploy/backend/Dockerfile:127` | 创建 `/app/public_assets/_render_tmp` | 决定卷权限 | 扩展为创建公共分类目录并保持 uid 所有权 |
| `.github/workflows/e2e.yml:34` | 宿主机 seed `frontend/public/music` | 是 | 改为测试系统向运行中公共卷注入 seed |

所有 `.github/workflows/e2e.yml` 的 `docker compose` 步骤继续显式设置 `PIP_INDEX: ''`。

## 12. 测试设计

### 12.1 后端 unit

- 用户模型、DAO 与管理员依赖：active/admin 组合、初始管理员、最后管理员保护。
- 公共资源 service：分类、扩展名、路径穿越、大小、冲突、覆盖、原子写入和删除。
- 审计 DAO/service：白名单 metadata、过滤、分页和保留清理。
- 管理用户统计与 Dashboard 聚合。
- 全局任务查询、取消、重试关联与队列视图。
- 系统健康部分失败降级。

路径严格镜像源码，例如：

- `backend/app/service/admin/asset_service.py`
  → `tests/unit/backend/service/admin/test_asset_service.py`
- `backend/app/api/v1/admin/assets_router.py`
  → `tests/unit/backend/api/v1/admin/test_assets_router.py`

### 12.2 后端 dev-integration

- 普通用户访问所有管理 API 均为 403。
- 管理员用户可完成资源 CRUD、用户权限变更、审计查询、任务查询与 Dashboard。
- 停用用户的旧 Token 立即失效。
- 管理 API 通过真实 service/DAO 与 SQLite 测试库，外部 worker 健康调用 mock。

### 12.3 前端 unit 与 dev-integration

- `proxy.ts` 的 secret 匹配、子路径重写和内部路径 404。
- 管理 layout 的登录、非管理员、停用和成功状态。
- 各页面的加载、空态、错误、筛选、确认对话框和 API mutation。
- MSW 覆盖全部管理端点，不产生真实 HTTP 出栈。

### 12.4 Playwright testenv E2E

新增按用户旅程组织的 spec：

- `admin-access-control.spec.ts`：错误路径 404、普通用户无权、初始管理员进入、权限撤销即时生效。
- `admin-public-assets.spec.ts`：管理员上传剪影和音乐、普通编辑器可选择、覆盖、删除。
- `admin-user-management.spec.ts`：搜索用户、停用/启用、授予/撤销管理员、最后管理员保护。
- `admin-render-operations.spec.ts`：查看真实队列与进度、取消、历史过滤、失败任务重试。
- `admin-dashboard.spec.ts`：真实数据库数据反映到用户、任务、存储与健康指标。

E2E 使用测试系统注入的 `ADMIN_PATH_SECRET_STRING`、`INITIAL_ADMIN_EMAIL`、baseURL 和数据库
seed；测试资源放在 `tests/data/frontend/admin/`。不硬编码生产地址、凭据或真实管理员邮箱。

## 13. 验证与提交策略

每个阶段先写失败测试、确认 RED，再写最小实现并确认 GREEN。每阶段结束运行受影响测试并
使用中文 Conventional Commit + `git commit -s`，保留 Codex 协作署名。五阶段完成后依次运行：

```bash
cd backend
uv run pytest ../tests/unit/backend/ -v
uv run pytest ../tests/dev-integration/backend/ -v

cd ../frontend
pnpm test:unit
pnpm test:integration
pnpm lint
pnpm build

cd ..
docker compose -f deploy/docker-compose.yml config
docker compose -f deploy/docker-compose.yml build

cd frontend
pnpm exec playwright test ../tests/testenv-integration/frontend/
```

testenv 只有在测试系统提供真实 backend、数据库和 seed 环境时执行。最终检查 Alembic
升级、全新空公共资源卷、重部署后资源保留以及生产镜像中三个服务的实际挂载。

## 14. Issue 与 PR

开发和验证完成后创建一个功能 Issue，描述背景、五阶段范围、安全边界和验收标准。PR 从
`feat/admin-console` 分支创建，正文使用仓库模板并以 `Closes #<issue>` 关联 Issue，列出五个
阶段 commit、测试证据、部署变量、数据库迁移和公共资源卷上线步骤。
