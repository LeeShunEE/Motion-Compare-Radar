<!-- kinema-tdd-injector: injected -->
<!-- generated at: 2026-06-04 | packages: backend (Python), frontend (TypeScript) | injector-version: 1.3.0 -->

# 研发自动化测试规范 (AGENTS.md)

> 适用对象：Codex 编码代理 + 前后端研发团队
> 由 `kinema-tdd-injector` skill 生成

> **前置必读**：进行任何开发计划（制定 Plan / 动手改代码）之前，**必须先阅读
> [`CONTRIBUTING.md`](./CONTRIBUTING.md)**，了解分支规范、commit/DCO 签名、依赖与
> lockfile 流程、发版（含 `package.json` 版本 bump）等贡献约束，避免与本规范冲突或
> 触发 CI 守卫。

---

## 1. 核心原则

本项目采用 **三阶测试体系**，按运行环境隔离：

| 阶段       | backend 目录                            | frontend 目录                             | 执行者          | 外部依赖          |
| -------- | ------------------ | ------------------- | ------------ | ------------- |
| 单元测试     | `tests/unit/backend/`            | `tests/unit/frontend/`            | Agent 自动 / 本地 | ❌ 无           |
| 开发环境集成测试 | `tests/dev-integration/backend/` | `tests/dev-integration/frontend/` | Agent 自动 / 本地 | ❌ 无（Mock / MSW） |
| 测试环境集成测试 | `tests/testenv-integration/backend/` | `tests/testenv-integration/frontend/` | Agent（本地许可时，复杂任务完成自动）/ 用户手动     | ✅ 真实后端 + 真实库       |

**前端 testenv = Playwright GUI e2e**：连**真实后端 + 真实库**，验证完整用户旅程。e2e 代码位于 `tests/testenv-integration/frontend/`，按用户旅程/功能组织（文件名 `*.spec.ts`），**显式豁免** §2 的"模块层与源码 1:1 对齐"规则（见 §2.6）。连接配置与库内容由**测试系统**提供（见 §3.3）。

---

## 2. 测试路径三层命名规则

测试路径由三层组合而成，**逐层强制**：

| 层 | 规则 |
| - | - |
| **阶段层** | 测试根必为 `tests/unit/`、`tests/dev-integration/`、`tests/testenv-integration/` |
| **包层** | 阶段根的下一级必为仓库顶层应用包名（本项目：`backend/`、`frontend/`）。新增顶层应用包时**必须**在所有阶段根下同步建立同名目录 |
| **模块层** | 包名目录下的子目录与该包源码内部结构 **1:1 对齐**，不得压缩或省略中间目录 |

### 2.1 包源码根折叠

包内的源码根目录（`backend/app/`、`frontend/src/`）在测试树中 **折叠掉**：

```
backend/app/service/task_service.py
  → tests/unit/backend/service/test_task_service.py     ✅
  → tests/unit/backend/app/service/test_task_service.py ❌
frontend/src/components/calendar/Cell.tsx
  → tests/unit/frontend/components/calendar/Cell.test.tsx     ✅
  → tests/unit/frontend/src/components/calendar/Cell.test.tsx ❌
```

### 2.2 文件命名规则

| 语言 | 源 | 测试 |
| - | - | - |
| **Python** | `<pkg-source-root>/<path>/<module>.py` | `tests/<阶段>/<pkg>/<path>/test_<module>.py` |
| **TS/TSX** | `<pkg-source-root>/<path>/<Name>.ts(x)` | `tests/<阶段>/<pkg>/<path>/<Name>.test.ts(x)` |
| **TS e2e（testenv）** | （无源文件镜像，按旅程组织） | `tests/testenv-integration/frontend/<journey>.spec.ts` |

**强制约束**：
- Python 测试名 = `test_` + **完整**源文件名（包括 `_router` / `_service` / `_dao` 等后缀），不许缩写、不许用功能名替代
- TS 测试名 = **原始大小写**源文件名 + `.test`（PascalCase 组件保持 PascalCase，camelCase hook 保持 camelCase）
- Python 与 TS 命名规范不同，是为了贴合各自社区工具链（pytest 默认匹配 `test_*`、vitest 默认匹配 `*.test.*`）

### 2.3 归属判定原则

测试归到哪个子目录，**只看源文件物理位置**，与功能语义、模块名含义无关：

- `models/fts.py`（FTS 是搜索功能） → `models/`，**不归** `service/` 或 `search/`
- 包根 `main.py`（FastAPI 入口等） → 包根 `tests/<阶段>/<pkg>/test_main.py`
- `core/lifespan.py`（启动钩子） → `core/`

### 2.4 测试文件拆分规则（C+D 组合）

测试**原则上单文件**，用 `class`（Python）/ `describe`（TS）分组：

```python
# tests/unit/backend/service/test_task_service.py
class TestCreate: ...
class TestQuery: ...
class TestDelete: ...
```

若单测试文件超过 **800 行**仍难维护，**先考虑拆源码**（源文件已职责过载），源码拆完测试自动 1:1 跟随。**禁止单独拆测试文件而源码不动**。

### 2.5 测试数据文件

非测试代码的辅助数据（JSON / CSV / SQL dump / 图片）一律放 `tests/data/`，按所属测试路径再镜像：

```
tests/data/backend/service/task_service/large_input.json
tests/data/frontend/components/calendar/sample-events.json
```

- `tests/data/` 不放任何 `*.py` / `*.ts` 测试代码
- 超大 fixture（GB 级 sample）走 LFS 或外部存储，**不进 git**

### 2.6 前端 testenv e2e 的 1:1 对齐豁免

`tests/testenv-integration/frontend/` 下的 Playwright GUI e2e **显式豁免**模块层 1:1 对齐规则（§2 第三条）：

- e2e 是**用户旅程导向**而非源文件镜像，按旅程/功能组织目录与文件，不需与 `frontend/src/` 内部结构对应。
- 文件用 Playwright 默认惯例 `*.spec.ts`（与组件单测的 `*.test.tsx` 区分）。
- 阶段层与包层骨架**仍然成立**：根必为 `tests/testenv-integration/`，下一级必为包名 `frontend/`。豁免仅限模块层。

```
tests/testenv-integration/frontend/
  login-and-create-task.spec.ts     ✅ 按旅程命名
  calendar-drag-reschedule.spec.ts  ✅
  components/calendar/Cell.spec.ts   ❌ 不要镜像源码结构
```

---

## 3. Agent 自动行为规范

### 3.1 完成以下任务后，必须自动运行测试

- bug 修复后
- 新功能开发完成
- 重构导致接口变更

### 3.2 自动运行的命令序列

**后端**（工作目录：`backend/`）：

```bash
cd backend
uv run pytest ../tests/unit/backend/ -v
uv run pytest ../tests/dev-integration/backend/ -v
```

**前端**（工作目录：`frontend/`）：

```bash
cd frontend
pnpm test:unit
pnpm test:integration
```

**激活规则**：一律使用 `uv run`（自动管理 venv），**禁止**在命令前添加 `source .venv/bin/activate` 或 `.venv\Scripts\Activate.ps1`。

**准入规则**：自动触发的阶段必须 **100% 通过** + 覆盖率达标，否则不得提交代码。

### 3.3 测试环境集成测试

testenv 阶段连**真实后端 + 真实库**：后端为 API e2e（直连测试库），前端为 Playwright GUI e2e（跨真实后端 + 真实库）。

#### 3.3.1 配置归属（铁律）

testenv 的 **DB / 外部服务连接配置 + 库内容（seed 数据）一律由测试系统统一提供**（通过环境变量等注入）：

- **禁止**在仓库或测试代码中硬编码连接串、库地址、凭据。
- **禁止**依赖开发者本地的私有配置/本地库。
- Agent 编写 testenv 测试时，连接信息一律从测试系统注入的环境变量读取。

#### 3.3.2 触发时机

testenv e2e **不**进每次提交的自动触发链。其自动触发时机为 **复杂 Plan 任务完成时（通常跨多个 commit）**，且**仅当本地运行被允许**时生效。

#### 3.3.3 后端 testenv（API e2e）

本项目**允许**后端 testenv 在开发本地运行。Agent 可在复杂 Plan 任务完成时自动执行一次：

```bash
cd backend && uv run pytest ../tests/testenv-integration/backend/ -v
```

前提：测试系统已注入测试库连接配置（见 §3.3.1）。

#### 3.3.4 前端 testenv（Playwright GUI e2e）

运行 `tests/testenv-integration/frontend/` 下的 Playwright e2e（连真实后端 + 真实库，配置由测试系统提供）：

本项目**允许**前端 testenv e2e 在开发本地运行。Agent 可在复杂 Plan 任务完成时自动执行一次：

```bash
cd frontend && pnpm exec playwright test tests/testenv-integration/frontend/
```

前提：测试系统已注入 baseURL（真实后端地址）与 DB seed（见 §3.3.1、§6.1）。

#### 3.3.5 CI e2e 与本地镜像隔离

`docker-compose.dev.yml` 为中国开发者本地优化，硬编码了阿里云 PyPI 镜像（`PIP_INDEX`）和 Alpine 镜像（`ALPINE_MIRROR`）。但 **CI runner 在欧洲/美国**，访问中国镜像网络不稳定，曾导致 backend 构建时下载 `coverage` 包超时（128s 后 3 次重试失败）。

**铁律**：`.github/workflows/e2e.yml` 的所有 `docker compose` 步骤必须设置 `PIP_INDEX: ''`，覆盖 dev-override 的硬编码值，让 CI 走官方 PyPI（pypi.org）。

```yaml
env:
  POSTGRES_PASSWORD: devpass
  JWT_SECRET_STRING: ci-test-secret-not-for-production
  PIP_INDEX: ''  # CI 用官方 PyPI，不走阿里云镜像
```

**为什么不删 `docker-compose.dev.yml` 的镜像配置**：本地开发在中国，阿里云镜像加速明显；CI 与本地场景不同，用环境变量覆盖实现隔离。

---

## 4. 网络边界规则

**原则**：**进程内随便用，进程外一律禁。**

**磁盘写入不计入"进程外 I/O"** —— 文件读写、本地 SQLite 文件、临时目录都属于进程内允许范围。

### 4.1 允禁对照表

| 行为 | unit | dev-integration | testenv-integration |
| - | - | - | - |
| `fastapi.TestClient` / `httpx.ASGITransport` | ✅ | ✅ | ✅ |
| `unittest.mock` / `pytest-mock` | ✅ | ✅ | ✅ |
| MSW（前端进程内拦截） | ✅ | ✅ | — |
| 文件读写 / 临时目录 | ✅ | ✅ | ✅ |
| SQLite `:memory:` | ✅ | ✅ | ✅ |
| SQLite 本地文件 | ✅ | ✅ | ✅ |
| 连真实数据库（MySQL/PG 等远程） | ❌ | ❌ | ✅ |
| 真实 HTTP 出栈（requests/urllib/未 mock httpx） | ❌ | ❌ | ✅ |
| DNS 解析非 localhost | ❌ | ❌ | ✅ |
| subprocess 启动网络服务 | ❌ | ❌ | ✅ |
| Playwright 真实浏览器驱动 | ❌ | ❌ | ✅ |

---

## 5. 依赖声明

### 5.1 声明源（唯一手改入口）

- **后端**：`backend/pyproject.toml` 的 `[project.dependencies]` 与 `[project.optional-dependencies]`
- **前端**：`frontend/package.json`

### 5.2 派生锁定文件（命令生成，禁止手改）

| 文件 | 用途 |
| - | - |
| `backend/requirements.txt` | 主依赖 pin 版本（pip 兼容兜底；从 uv.lock 投影） |
| `backend/requirements-test.txt` | test+dev 组 pin 版本（从 uv.lock 投影） |
| `backend/uv.lock` | uv 完整解析锁（唯一确定性锁源） |
| `frontend/pnpm-lock.yaml` | 前端锁 |

**全部 lockfile 必须 commit 进 git。**

> **requirements\*.txt 必须用 `uv export` 从 `uv.lock` 投影，不得用 `uv pip compile`。**
> `uv pip compile` 每次对线上 index 重新解析，结果随上游发版漂移，无法作为确定性锁、
> 也无法被 CI 漂移守卫稳定校验。`uv export` 只读 `uv.lock`，是其确定性投影，仅当
> `uv.lock` 变化时才变。`ci.yml` 的 Lockfile drift guard 会按字节校验三者一致。

### 5.3 改后端依赖的流程

1. 编辑 `backend/pyproject.toml`
2. 在 `backend/` 下重生派生文件（**顺序固定**：先解析锁、再投影 requirements）：
   ```bash
   uv lock
   uv export --no-hashes --no-emit-project --format requirements-txt -o requirements.txt
   uv export --no-hashes --no-emit-project --extra test --extra dev --format requirements-txt -o requirements-test.txt
   ```
3. 将 `pyproject.toml` + `uv.lock` + 两份 `requirements*.txt` 一并 commit

**禁止**：跳过 step 2、单独手改 `requirements*.txt`、用 `pip freeze` 凑 requirements、
用 `uv pip compile` 生成 requirements（会引入非确定性漂移）。

> **uv 版本一致性**：漂移守卫按字节比对，本地、`ci.yml`、`dependabot-lockfile-sync.yml`
> 必须用同一 uv 版本（当前钉死 `0.10.3`）。升级 uv 时三处同步改并重生锁文件。

### 5.4 环境初始化

```bash
cd backend && uv pip install -e ".[test,dev]"
cd frontend && pnpm install
```

---

## 6. Conftest / Fixture 治理（方案 B）

### 6.1 Fixture 分层

| 文件 | 职责 |
| - | - |
| `tests/conftest.py` | **跨阶段通用数据 fixture**：`mock_<entity>` 系列（ORM-shape MagicMock，字段统一） |
| `tests/unit/backend/conftest.py` | unit 特化：`mock_session`（基础 AsyncMock） |
| `tests/dev-integration/backend/conftest.py` | dev-integration 特化：`mock_db_session`、`client_with_mock_db`（TestClient + dependency override） |
| `tests/testenv-integration/backend/conftest.py` | testenv-integration 特化：`real_db_session` 等真库 fixture（连接配置由测试系统注入，**不硬编码**） |
| `frontend/playwright.config.ts` | 前端 e2e 配置：`baseURL`（真实后端地址）与测试库 seed **由测试系统注入**（环境变量等），**不在仓库硬编码** |

### 6.2 Fixture 命名约定

- **跨阶段同语义 fixture 必须同名**（如 `mock_task` 不再有 `mock_task_row` 双胞胎）
- 阶段特化的会话/客户端 fixture 可以分别命名（`mock_session` vs `mock_db_session` 反映了不同上下文的真实差异）

### 6.3 Fixture 定义位置

- **默认**：所有 fixture 定义在对应层的 `conftest.py`
- **例外**：仅当某 fixture **只服务一个测试文件**时，允许在该测试文件内 inline `@pytest.fixture`
- **禁止**：在测试文件内定义需跨文件共享的 fixture（应上提到 conftest）

---

## 7. 覆盖率门槛

### 7.1 阈值

| 范围 | 总覆盖率 | 每文件兜底 |
| - | - | - |
| 后端 | ≥ 80% | ≥ 50% |
| 前端 | ≥ 60% | ≥ 50% |

### 7.2 计入测试阶段

- **计入**：`unit/` + `dev-integration/`
- **不计入**：`testenv-integration/`（e2e 不纳入单测覆盖；后端 API e2e 与前端 Playwright e2e 同样不计入）

### 7.3 排除文件

- 后端：`app/__init__.py` 及各子包 `__init__.py`、未来的 alembic 迁移脚本
- 前端：`*.config.ts`、`next.config.ts`、`vitest.config.ts`

### 7.4 强制点：本地 git hook（双触发）

| Hook | 触发 | 跑什么 |
| - | - | - |
| `pre-commit` | 每次 `git commit` | 快速通道：lint + 单元测试（≤ 10s） |
| `pre-push` | 每次 `git push` | 全套：单元 + 集成 + 覆盖率校验 |

**禁止**用 `git commit --no-verify` / `git push --no-verify` 绕过，除非已修复底层问题。

hook 脚本镜像位于 `scripts/git-hooks/`，由 `init_env` 软链到 `.git/hooks/`，否则新 clone 的同事不会自动获得 hook。

---

## 8. 各阶段测试编写规范

### 8.1 单元测试（阶段一）

- **时机**：编码前或编码中（TDD 优先）
- **工具**：`pytest` + `unittest.mock` / `pytest-mock`；前端 `vitest` + `@testing-library/react`
- **禁止**：任何进程外 I/O（详见 §4）

按以下三层从底向上验证：

#### 8.1.1 模型 / 函数层

```python
# tests/unit/backend/models/test_task.py
from app.models import Task

class TestTaskModel:
    def test_table_name(self):
        assert Task.__tablename__ == "tasks"
```

#### 8.1.2 服务层逻辑

```python
# tests/unit/backend/service/test_task_service.py
from unittest.mock import MagicMock
from app.service.task_service import TaskService

class TestCreate:
    def test_create_returns_task(self):
        service = TaskService(dao=MagicMock())
        ...
```

#### 8.1.3 接口层契约（TestClient + 全 mock Service）

```python
# tests/unit/backend/api/test_task_router.py
from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

@patch("app.service.task_service.TaskService.get_task")
def test_get_task_endpoint(mock_service):
    mock_service.return_value = {"id": "t001", "title": "X"}
    response = client.get("/tasks/t001")
    assert response.status_code == 200
```

### 8.2 开发环境集成测试（阶段二）

- **时机**：模块开发完成、提交前
- **工具**：`pytest` + `unittest.mock.patch` 拦截 DAO 层；或 TestClient + dependency override
- **测什么**：Controller → Service → DAO 完整调用链路

### 8.3 后端测试环境集成测试（阶段三 · API e2e）

- **时机**：复杂 Plan 任务完成后（通常跨多个 commit）
- **工具**：`pytest`，**API e2e（直连测试库，无 Mock）**
- **测什么**：真实 SQL、ORM 映射、事务回滚、唯一索引约束、跨接口的真实链路
- **配置**：测试库连接由**测试系统**提供（环境变量注入），禁止硬编码（见 §3.3.1）
- **运行方式**：允许开发本地运行，Agent 在复杂任务完成时自动跑一次

### 8.4 前端测试环境集成测试（阶段三 · Playwright GUI e2e）

- **时机**：复杂 Plan 任务完成后（通常跨多个 commit）
- **工具**：**Playwright**，真实浏览器驱动 GUI
- **测什么**：真实用户旅程，跨**真实后端 + 真实库**端到端验证（登录、关键业务流程、跨页交互）
- **代码位置**：`tests/testenv-integration/frontend/<journey>.spec.ts`，按旅程组织（1:1 对齐豁免见 §2.6）
- **配置**：`baseURL`（真实后端）与库 seed 由**测试系统**提供，禁止硬编码（见 §3.3.1、§6.1）
- **运行方式**：允许开发本地运行，Agent 在复杂任务完成时自动跑一次
- **编写/调试辅助**：撰写或排查 e2e spec 时可借助 **Playwright MCP**（交互式驱动真实浏览器、探查选择器与页面结构）。该 MCP 一般由系统/运行环境**已提供**；若未安装，提醒用户安装 Playwright MCP 后再进行 e2e 编写。注意：最终落地的 e2e 仍是 `*.spec.ts` 代码（由 `playwright test` 运行），MCP 仅用于辅助编写。

---

## 9. 快速参考

```bash
# 后端开发中（Agent 自动触发）
cd backend
uv run pytest ../tests/unit/backend/ -v
uv run pytest ../tests/dev-integration/backend/ -v

# 前端开发中
cd frontend
pnpm test:unit
pnpm test:integration

# 后端 testenv API e2e（本地许可，复杂任务完成自动；配置由测试系统提供）
cd backend && uv run pytest ../tests/testenv-integration/backend/ -v
# 前端 testenv Playwright GUI e2e（本地许可，复杂任务完成自动；连真实后端 + 真实库）
cd frontend && pnpm exec playwright test tests/testenv-integration/frontend/
```

---

## 10. Commit Message 规范

### 10.1 标题格式

格式：`<type>(<scope>): <subject>`

**type**：`feat`（新功能）/ `fix`（修补 bug）/ `docs`（文档）/ `style`（格式）/ `refactor`（重构）/ `test`（测试）/ `chore`（构建/工具）

**scope**：模块级（如 `api`、`dao`、`service`、`models`、`schemas`、`core`、`utils`）或跨模块（用逗号，如 `api, service`）

**subject**：
- 使用**中文**
- 结尾不加句号
- 简洁明确

### 10.2 正文

- 与标题空一行
- **中文**详述，列表用 `-` 或 `*`
- 复杂提交分小标题：主要改进 / 影响范围 / 变更细节

### 10.3 脚注

AI 辅助完成需署名：

```
Co-Authored-By: Codex Opus 4.7 <noreply@anthropic.com>
```

### 10.4 DCO 签名（必填）

每个 commit 必须带 `Signed-off-by`（Developer Certificate of Origin）。用 `git commit -s` 自动追加 `Signed-off-by: <user.name> <user.email>`；与 §10.3 的 `Co-Authored-By` **并存**，不是替代。`.github/workflows/dco.yml` 的 CI 会拒绝缺少**匹配 commit author** 的 `Signed-off-by` 的 PR（详见 [`CONTRIBUTING.md`](./CONTRIBUTING.md) §2）。补签：`git commit --amend -s` 或 `git rebase --signoff <base>`。

---

## 11. 前端包管理器

前端（`frontend/`）统一使用 **pnpm**，禁止使用其他包管理器。

---

## 12. Python 编码规范

> 本章面向 Python 代码的**语义级**可读性与规范约束，与第 1–10 章的测试方法论正交。
> **核心立场**：静态可查的规则（格式、import 顺序、命名、复杂度阈值等）一律交给 **ruff**，本章**只**写 ruff 静态查不出来的语义约束。两边不重复、不打架。

### 12.1 总则（与 ruff 的边界）

- **静态规则以仓库 ruff 配置为准**。本章不复述 ruff 已覆盖的规则，只补充 ruff 查不了的语义约束。若本章某条要求恰好有对应 ruff 规则，会标注让 ruff 兜底。
- **必须启用的 ruff 规则集**（在仓库 `pyproject.toml` 的 `[tool.ruff.lint]` 中落地，本章不替你写配置）：

  | 规则集 | 作用 | 对应本章 |
  | - | - | - |
  | `ANN` | 强制函数注解存在 | §12.4 |
  | `C901` | 圈复杂度上限 | §12.5 |
  | `B006` | 禁可变默认参数 | 见下 |
  | `DTZ` | 禁 naive datetime | 见下 |
  | `FBT001,FBT002` | 布尔位置参数 → 报错 | §12.5 |
  | `T20` | 禁 `print` | §12.8 |
  | `S` (bandit) | 安全：`eval`/`exec`/`shell=True`/不可信 `pickle` 等 | §12.8 |
  | `I` (isort) | import 排序 | — |
  | `N` (pep8-naming) | 命名规范 | — |
  | `UP` (pyupgrade) | 语法现代化 | — |

- **必须关闭的 ruff 规则**：`G004`（logging 用 f-string）—— 本项目**要求** logger 使用 f-string（理由见 §12.8），与 `G004` 直接冲突，故显式关闭。
- **可变默认值**：永远不要用 `[]` / `{}` / `set()` 作函数默认参数（ruff `B006` 兜底），改用 `None`-sentinel 或 pydantic `default_factory`。
- **时间**：存储与比较一律用 **UTC aware** `datetime`（ruff `DTZ` 兜底禁 naive）。
- **类型检查器**：推荐接入 mypy / pyright，但**不强制**——本章约束不依赖类型检查器通过。

```python
# ❌ 可变默认值 / naive 时间
def add_tags(item, tags=[]): ...
created = datetime.now()

# ✅
def add_tags(item: Item, tags: list[str] | None = None) -> None:
    tags = tags or []
created = datetime.now(tz=UTC)
```

### 12.2 数据类型：pydantic-first 全面严格

**一切结构化数据用 `BaseModel`**——只要数据有"固定的几个字段"，就定义模型，包括内部传递、临时聚合、多字段返回值。

| 场景 | 规则 |
| - | - |
| 结构化数据（已知字段集） | `pydantic.BaseModel` |
| 运行时**动态 key** 的纯映射（key 不可枚举） | `dict[K, V]` |
| ORM 实体（SQLAlchemy） | **法定例外**，用 ORM 基类（见 §12.3） |

- **禁止**用裸 `tuple` / 裸 `dict` 当结构体（"第 0 个是 id、第 1 个是名字"这类靠位置/字符串约定的隐式结构）。
- 不可变数据：`model_config = ConfigDict(frozen=True)`。
- 应用配置：用 **`pydantic-settings`** 的 `BaseSettings`，不要散落的 `os.getenv`。
- 函数**入参超过 4 个**时，聚合成一个 `BaseModel`（与 ruff 无关，是可读性约束）。
- **校验下沉、充血模型**（决定校验写在哪一层）：

  | 校验类型 | 写在哪 |
  | - | - |
  | 单字段形态（长度、范围、正则、非空） | `Field(...)` 约束 |
  | 单字段复杂规则 | `@field_validator` |
  | 跨字段、**不依赖外部状态**（如 `start < end`） | `@model_validator(mode="after")` |
  | 依赖 DB / 外部状态的业务规则（如"用户名是否已存在"） | service 层 + 抛业务异常 |

```python
# ❌ 裸 dict 当结构体在层间传递
def build_summary(rows) -> dict:
    return {"total": len(rows), "active": sum(r["on"] for r in rows)}

# ✅ 临时聚合也用 model；形态校验进 Field，跨字段进 model_validator
class Summary(BaseModel):
    total: int = Field(ge=0)
    active: int = Field(ge=0)

    @model_validator(mode="after")
    def _active_not_exceed_total(self) -> "Summary":
        if self.active > self.total:
            raise ValueError("active 不能超过 total")
        return self
```

### 12.3 三层 model 与转换纪律

数据模型按所处的层分三类，**各司其职、命名固定**：

| 层 | 命名 | 职责 |
| - | - | - |
| 接口层（API in/out） | `<动作>Request` / `<动作>Response` | 只暴露**关键字段**，是对外契约 |
| service 领域层 | 自立命名（如 `Task`、`Order`） | 业务核心，**充血**（带行为/校验） |
| DAO 层 | `*ORM`（SQLAlchemy 映射） + `*DAO`（数据访问对象） | 持久化映射与访问 |

**转换纪律（铁律）**：

- **领域 model 永不 `import` 边界类型**（不 import 任何 `*Request`/`*Response`/`*ORM`）——保持领域纯净、可单测。
- **出站**（领域 → 接口）：在**接口层**的 `Response` 上挂 `@classmethod from_domain(cls, domain) -> Self`。
- **入站**（接口 → 领域）：在 **service** 里**显式构造**领域 model，不在 `Request` 上写 `to_domain`。
- 领域 model **自身没有** `to_*` / `from_*` 转换方法。
- `*ORM` 不越出 DAO 层；`*Request`/`*Response` 不进 DAO 层。

```
转换流向（依赖永远指向中心，领域不依赖任何一侧）：

  HTTP 入  ──►  CreateTaskRequest ──┐
                                   │ service 显式构造
                                   ▼
                              Task（领域，充血，零边界 import）
                                   │ DAO 接收/返回领域
                                   ▼
                              TaskORM ◄─► DB
                                   ▲
  HTTP 出  ◄── TaskResponse.from_domain(task) ◄── service 返回领域
```

### 12.4 类型注解

- **完整注解**所有函数的参数与返回值（ruff `ANN` 只保证"存在"，本条要求"准确"）。
- **禁止裸 `Any`**。确实需要时，必须在紧邻处用注释写明理由（为什么此处无法收窄类型）。
- 魔法值（固定取值集合）用 `Enum` 或 `Literal`，不要散落字符串/数字常量。

```python
# ❌ 裸 Any、魔法字符串
def handle(payload: Any): ...
if status == "done": ...

# ✅
def handle(payload: WebhookEvent) -> None: ...

class Status(StrEnum):
    PENDING = "pending"
    DONE = "done"

if status is Status.DONE: ...
```

### 12.5 函数与接口契约

- **单一职责**；用 **guard clause 早返回**压平嵌套，嵌套层级 ≤ 3（圈复杂度由 ruff `C901` 兜底）。
- **布尔行为参数必须 keyword-only**（ruff `FBT001/FBT002` 拦截布尔位置实参）。两个以上状态用 `Enum` 表达，别用布尔标志位堆叠。
  - 注意：这里限制的是**控制行为的布尔参数**；pydantic model 里表示数据的 `bool` 字段不受此限。
- **`Optional` 返回的调用方必须显式处理 `None`**。若"空"具有业务含义（如"该订单必须存在却查不到"），在产生处直接抛**业务异常**，不要把 `None` 继续向上传播让调用方猜。

```python
# ❌ 布尔位置参、Optional 直接外抛让调用方裸用
def export(data, True): ...                 # 这是什么 True？
user = repo.find(uid)
send_email(user.email)                      # user 可能是 None → 崩在远处

# ✅ keyword-only + 业务性"空"在源头抛业务异常
def export(data: Report, *, include_header: bool = True) -> bytes: ...

user = repo.find(uid)
if user is None:
    raise UserNotFoundError(uid)            # 空有业务含义 → 源头抛
send_email(user.email)
```

### 12.6 错误处理

- **禁裸 `except:`**（ruff `E722` 兜底）与 **`except Exception: pass`**。
- **严禁静默吞错**：catch 之后，若该错误有业务含义，**必须** `raise` 一个**专门的自定义业务异常**（可 `from e` 链接根因）。绝不允许"吞掉继续跑"。
- **异常分层**：区分**业务异常**（领域可预期，如 `OrderAlreadyPaidError`）与**系统异常**（基础设施失败）；接口层据此映射不同 HTTP 状态。
- **不用异常做控制流**（异常表达"出错"，不表达"正常分支"）。

```python
# ❌ 静默吞错——根因消失，调用方以为成功
try:
    charge(order)
except Exception:
    pass

# ✅ 译为业务异常并保留根因
class PaymentFailedError(BusinessError): ...

try:
    charge(order)
except GatewayTimeout as e:
    raise PaymentFailedError(order.id) from e
```

### 12.7 注释与文档

- **公共 API**（对外暴露的函数/类/模块）必须写 **docstring**，统一 **Google 风格**（`Args:` / `Returns:` / `Raises:`）。
- 注释解释 **why**（为什么这么做、权衡、坑），**不**解释 **what**（代码本身已经说明在做什么）。复述代码的注释直接删。

```python
# ❌ 复述 what
i += 1  # 把 i 加 1

# ✅ 解释 why
# 上游分页从 1 开始，这里 +1 对齐，避免漏掉首页
i += 1
```

### 12.8 安全与敏感信息

- **logger 必须用 f-string**（配套关闭 ruff `G004`）：`logger.info(f"task {task_id} done")`。统一可读风格、避免 `%`-lazy 与 f-string 混用。
- **密码 / token / 密钥强制类型化**：文本用 `pydantic.SecretStr`，二进制用 `SecretBytes`；且承载它的**变量名 / 字段名以 `_secret_string` / `_secret_bytes` 结尾**，让"这是机密"在命名层一眼可见，需要明文时才显式 `.get_secret_value()`。
- **不记敏感信息**：禁止把整个对象/请求体直接丢进日志（可能裹挟凭据）；异常消息里不得嵌入凭据。
- **raw SQL 强制参数化**（占位符传参），禁止用 f-string / 拼接构造 SQL。
- `eval` / `exec` / `subprocess(shell=True)` / 反序列化不可信 `pickle` / 残留 `print` 由 ruff `S` + `T20` 兜底拦截，本章不赘述。

```python
# ❌ 明文裸存密钥、整对象记日志、字符串拼 SQL
api_key = "sk-xxxx"
logger.info("login: " + str(user))                       # user 里可能有密码哈希
db.execute(f"SELECT * FROM users WHERE name = '{name}'")  # 注入风险

# ✅ SecretStr + 命名后缀、只记必要字段、参数化 SQL
api_key_secret_string: SecretStr = settings.api_key_secret_string
logger.info(f"login uid={user.id}")
db.execute(text("SELECT * FROM users WHERE name = :name"), {"name": name})
# 真正需要明文时才解封：
headers = {"Authorization": f"Bearer {api_key_secret_string.get_secret_value()}"}
```

---

## 13. 构建链路与路径变更的 Plan 审计

本项目 CI 不构建 Docker 镜像（仅本地人工验证，见各 Plan 的风险章节），构建链路改动回归风险高。涉及**系统性路径变更**的 Plan，动手改之前必须做**全量静态审计**，不得按"阶段"或"模块"粗粒度推理。

### 13.1 触发条件

Plan 涉及任一即须审计：改 Docker `build.context` 根、改 Dockerfile 任何 `COPY`/`ADD` 源路径前缀、改 monorepo 包结构 / import alias 根 / 源码根折叠规则，或任何"一处改、多处路径跟随"的连锁变更。

### 13.2 审计动作

动手改之前，先用静态工具列出全部受影响位点并逐条分类，再批量改：

```bash
# 列出所有 COPY/ADD，按是否 --from=xxx 区分"依赖 context / 不依赖"
grep -nE '^(COPY|ADD) ' deploy/**/Dockerfile
```

**关键陷阱**：多阶段 Dockerfile 的**每个阶段（含 production）**都可能有直接从 context 的 COPY——典型如 production 阶段为重装生产依赖（`pnpm install --prod`）而 COPY `package.json`/`pnpm-lock.yaml`，或直接拷入口文件（`server.mjs`）。**不得因"某阶段主要从 builder 取产物"就跳过该阶段全部 COPY**。

### 13.3 审计表入 Plan

审计结果以表格写进 Plan 正文（不得仅脑内推理）：

| 文件:行 | 指令 | 依赖 context? | 处置 |
| - | - | - | - |
| frontend/Dockerfile:121 | `COPY package.json ...` | ✅ | → `COPY frontend/package.json ...` |
| frontend/Dockerfile:135 | `COPY --from=builder /app/.next` | ❌ | 不改 |

### 13.4 反面案例

本节源自 PR #24（前端版本号展示）：Plan 把 `build.context` 从 `../frontend` 改到仓库根时，只审计了 dev/builder 阶段的 COPY，误判"production 阶段全是 `--from=builder` 不用改"，漏掉 production 阶段开头的 `COPY package.json` 与 `COPY render-worker/server.mjs`（均为直接 context 依赖），导致首次 `docker compose build` 失败（`"/package.json": not found`）。本地构建验证兜住了回归，但本可由事前全量审计避免。