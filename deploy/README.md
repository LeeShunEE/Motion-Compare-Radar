# Docker Compose 部署说明

radar-chart-rendering 项目 Docker 部署配置，支持 Coolify 平台和本地开发。

## 目录结构

```
deploy/
├── docker-compose.yml       # Coolify/生产专用
├── docker-compose.dev.yml   # 本地开发覆盖
├── backend/
│   ├── Dockerfile           # 后端多阶段构建
│   └── entrypoint.sh        # 启动脚本（含迁移）
├── frontend/
│   └── Dockerfile           # 前端多阶段构建
├── render-worker/
│   └── Dockerfile           # 渲染工作器构建
└── README.md                # 本文档
```

## 服务概览

| 服务 | 技术栈 | 端口 | 健康检查 |
|------|--------|------|----------|
| `db` | PostgreSQL 16 | 5432 | `pg_isready` |
| `backend` | FastAPI + SQLAlchemy | 8000 | `/api/v1/health` |
| `frontend` | Next.js 16 + Remotion | 3000 | — |
| `render-worker` | Node.js + Remotion | 3100 | `/health` |

---

## Coolify 部署（推荐）

Coolify 是自托管部署平台，自动处理反向代理、SSL 和域名绑定。

### 1. 准备工作

1. 在 Coolify 中创建新项目
2. 连接 Git 仓库
3. 设置部署目录为 `deploy/`

### 2. 配置环境变量

在 Coolify UI 中配置以下环境变量：

**必需变量：**

| 变量 | 说明 | 示例 |
|------|------|------|
| `POSTGRES_PASSWORD` | 数据库密码 | `your-strong-password` |
| `JWT_SECRET_STRING` | JWT 密钥 | `min-32-random-characters` |
| `API_PUBLIC_URL` | 对外 API 地址 | `https://api.your-domain.com` |
| `ADMIN_PATH_SECRET_STRING` | 管理入口的 24-96 位 URL-safe 随机路径 | `ops-随机长串` |

**可选变量：**

| 变量 | 说明 |
|------|------|
| `POSTGRES_USER` | 数据库用户（默认 `radar`） |
| `POSTGRES_DB` | 数据库名（默认 `radar_chart`） |
| `CORS_ORIGINS` | CORS 允许来源 |
| `OAUTH_GOOGLE_*` | Google OAuth 配置 |
| `OAUTH_GITHUB_*` | GitHub OAuth 配置 |
| `RESEND_API_KEY` | Resend 邮件 API |

### 3. 域名配置

在 Coolify 中设置：

- **Frontend**: `your-domain.com`（用户访问入口）
- **Backend**: `api.your-domain.com` 或通过路径 `/api/*`
- **Render Worker**: 内部服务，不暴露公网

### 4. 部署

点击 Coolify 的 "Deploy" 按钮，平台会：

1. 拉取代码
2. 构建 Docker 镜像
3. 启动所有服务
4. 配置 HTTPS（自动）

---

## 本地开发部署

### 1. 启动开发环境

```bash
cd deploy

# 使用 SQLite（默认配置）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# 或使用 PostgreSQL
# 修改 docker-compose.dev.yml 中 backend 的 DATABASE_URL
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### 2. 初始化数据库

开发环境跳过了自动迁移，需手动执行：

```bash
# 进入 backend 容器
docker compose exec backend bash

# 运行迁移
alembic upgrade head
```

### 3. 查看日志

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f render-worker
```

### 4. 停止服务

```bash
docker compose down

# 清理数据（谨慎使用）
docker compose down -v
```

---

## 手动生产部署（无 Coolify）

### 1. 创建环境文件

```bash
cp .env.example .env
# 编辑 .env 文件，设置所有必需变量（POSTGRES_PASSWORD / JWT_SECRET_STRING 等）
```

> 部署环境变量（compose 用的 `${VAR}`）模板见 `deploy/.env.example`。
> 后端**本地开发**变量另见 `backend/.env.example`（复制为 `backend/.env`），两者职责不同，互不替代。

### 2. 构建镜像

```bash
cd deploy
docker compose build
```

### 3. 启动服务

```bash
docker compose up -d
```

### 4. 检查状态

```bash
docker compose ps
docker compose logs -f
```

---

## 验证部署

### 健康检查

```bash
# Backend 健康检查
curl http://localhost:8000/api/v1/health
# 期望响应: {"status": "healthy", "service": "radar-chart-backend"}

# Render Worker 健康检查
curl http://localhost:3100/health
# 期望响应: {"ok": true}

# Frontend 页面
curl http://localhost:3000
# 期望: HTML 页面内容
```

### 数据库迁移验证

```bash
docker compose exec backend alembic current
# 显示当前迁移版本
```

### 渲染功能验证

1. 访问前端页面 `http://localhost:3000`
2. 登录/注册账户
3. 创建任务并触发渲染
4. 检查生成的视频文件

---

## 环境变量详解

### 后端环境变量

| 变量 | 必需 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | 数据库连接字符串 |
| `JWT_SECRET_STRING` | ✅ | JWT 签名密钥（≥32字符） |
| `CORS_ORIGINS` | ✅ | CORS 允许来源列表 |
| `STORAGE_ROOT` | ✅ | 存储根目录 |
| `WORKER_BASE_URL` | ✅ | Render Worker 地址 |
| `RENDER_CONCURRENCY` | — | 并发渲染数（默认 2） |
| `RENDER_TIMEOUT_SECONDS` | — | 渲染超时（默认 600） |
| `INITIAL_ADMIN_EMAIL` | — | 数据库无管理员时可完成首次引导的邮箱 |
| `MAX_PUBLIC_ASSET_BYTES` | — | 单个公共资源上限（默认 100 MiB） |

### OAuth 配置（可选）

> 任一 provider 未配置 `CLIENT_ID` 时，前端会**自动隐藏**对应登录按钮，不会报错。

| 变量 | 说明 |
|------|------|
| `OAUTH_GOOGLE_CLIENT_ID` | Google OAuth 客户端 ID |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Google OAuth 密钥 |
| `OAUTH_GOOGLE_REDIRECT_URI` | 回调地址，填**前端**路由 `https://<前端域名>/auth/callback/google`（须与 Google 后台「授权回调地址」完全一致） |
| `OAUTH_GITHUB_CLIENT_ID` | GitHub OAuth 客户端 ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | GitHub OAuth 密钥 |
| `OAUTH_GITHUB_REDIRECT_URI` | 回调地址，填**前端**路由 `https://<前端域名>/auth/callback/github`（须与 GitHub 后台 Authorization callback URL 完全一致） |

### 前端环境变量

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_API_URL` | API 公开地址 |
| `ADMIN_PATH_SECRET_STRING` | 运行时管理入口；不使用 `NEXT_PUBLIC_` 前缀 |

### 资源限制（可选，compose 单机语义）

通过 `${VAR:-默认}` 注入容器资源上限，Coolify 面板或 `.env` 覆盖即生效，不填走默认值：

| 变量 | 默认 | 说明 |
|------|------|------|
| `BACKEND_MEMORY_LIMIT` | `1g` | 后端容器内存上限 |
| `BACKEND_CPUS` | `1.0` | 后端容器 CPU 核数 |
| `RENDER_WORKER_MEMORY_LIMIT` | `2g` | 渲染工作器内存上限（渲染吃内存，默认给大些） |
| `RENDER_WORKER_CPUS` | `2.0` | 渲染工作器 CPU 核数 |
| `DB_MEMORY_LIMIT` | `512m` | PostgreSQL 内存上限 |

> 采用 compose v2 顶层 `mem_limit` / `cpus`（单机语义），不使用 `deploy.resources`（Swarm/k8s 语义，Coolify 单机不一定兑现）。

---

## 数据持久化

| Volume | 用途 | 生产建议 |
|--------|------|----------|
| `postgres_data` | PostgreSQL 数据 | 定期备份 |
| `backend_storage` | 用户文件 + 渲染产物 | 定期备份 |
| `render_outputs` | 渲染工作器输出 | 可清理 |
| `public_assets` | 管理员上传的公共剪影与音乐 | 定期备份，不从 Git seed |

---

## 安全注意事项

1. **JWT 密钥**：生产必须使用强随机密钥（≥32字符）
2. **数据库密码**：使用强密码，不使用默认值
3. **OAuth 密钥**：通过 Coolify Secrets 管理，不进 git
4. **SSL/TLS**：Coolify 自动配置，无需手动设置
5. **容器用户**：生产容器以非 root 用户运行

---

## 故障排查

### Backend 无法启动

```bash
# 检查数据库连接
docker compose exec backend python -c "
from sqlalchemy.ext.asyncio import create_async_engine
import asyncio
async def test():
    engine = create_async_engine('your-database-url')
    async with engine.connect():
        print('DB OK')
    await engine.dispose()
asyncio.run(test())
"

# 检查迁移状态
docker compose exec backend alembic history
```

### Render Worker 无法启动

```bash
# 检查 Chromium 安装
docker compose exec render-worker which chromium-browser

# 检查 Remotion bundler
docker compose exec render-worker ls -la src/remotion/
```

### Frontend 无法访问 Backend

1. 检查 `NEXT_PUBLIC_API_URL` 配置
2. 检查 CORS 配置是否包含前端地址
3. 检查网络连通性：
   ```bash
   docker compose exec frontend curl http://backend:8000/api/v1/health
   ```

---

## 更新部署

### Coolify 环境

**自动部署（默认）**：发布 GitHub Release（见 [`CONTRIBUTING.md`](../CONTRIBUTING.md) §10：`gh release create v0.x.0`）或手动运行 [`Deploy` workflow](../.github/workflows/deploy.yml) 时，GitHub Actions 调用 Coolify Deploy Webhook，Coolify 随即拉取 `main` 最新 HEAD 并重建。

> 前提：仓库已配置 `COOLIFY_WEBHOOK` 与 `COOLIFY_TOKEN` 两个 Actions secret（见 workflow 注释）。Webhook URL 与 token 等同部署触发密钥，仅存 GitHub 加密 secret，不入库。
>
> 注意：Coolify 部署的是 `main` 的最新 HEAD，**不是** Release tag 指向的 commit。发版须遵循「先合并到 main → 在 main HEAD 上打 tag」的顺序。

**手动部署（兜底）**：自动触发失效时，可在 Coolify UI 点击 "Redeploy"，同样拉取最新代码并重建。

### 手动环境

```bash
cd deploy
docker compose pull  # 如果使用预构建镜像
docker compose build  # 从源码构建
docker compose up -d  # 重启服务
```

---

## 参考资料

- [Coolify 官方文档](https://coolify.io/docs)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Remotion 部署指南](https://remotion.dev/docs/rendering)
