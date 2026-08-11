# Contributing to Radar-Renderer

> [English](#english) · [简体中文](#简体中文)
>
> This is a human-readable distillation of the project conventions. The full,
> authoritative spec lives in [`CLAUDE.md`](./CLAUDE.md) (it also guides the
> AI coding agent used on this repo). When in doubt, `CLAUDE.md` wins.

---

## English

Thanks for contributing! Please read this before opening a PR. By participating,
you agree to abide by the [`Code of Conduct`](./CODE_OF_CONDUCT.md).

### 1. Getting started

```bash
# Backend (Python 3.11+, uv)
cd backend && uv pip install -e ".[test,dev]"

# Frontend (Node 20+, pnpm 9)
cd frontend && pnpm install
```

Install the git hooks so the same checks run locally as in CI. **Git hooks are
not version-controlled** — `git clone` never runs an installer — so you must run
this **once on every new clone** (your machine, CI, new teammates):

```bash
bash scripts/install-hooks.sh   # lightweight: only installs hooks, no deps
# or the full one-shot bootstrap (hooks + frontend + backend deps):
bash scripts/init_env.sh
```

Both set `core.hooksPath` to `scripts/git-hooks/` (cross-platform, no symlinks).

### 2. Developer Certificate of Origin (DCO) — required

Every commit must be **signed off**. This certifies you wrote the code or have
the right to submit it under the project license.

```bash
git commit -s -m "feat(api): ..."
```

This appends a `Signed-off-by: Your Name <you@example.com>` trailer. The
`DCO` CI check rejects PRs whose commits lack a sign-off matching the author.
Fix a missing sign-off with `git commit --amend -s` or
`git rebase --signoff <base>`.

### 3. Issues & PRs

- **Opening an issue**: use the templates under
  [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/) — pick
  [🐛 Bug report](./.github/ISSUE_TEMPLATE/bug_report.yml) or
  [✨ Feature request](./.github/ISSUE_TEMPLATE/feature_request.yml). For usage
  questions or security reports, follow the links shown on the "New issue" page
  (Discussions / Security policy) instead of opening a blank issue.
- **Branching**: branch off `main`; never push WIP directly to `main`.
- Keep PRs focused; link issues with `Closes #123`.
- Fill in the [PR template](./.github/PULL_REQUEST_TEMPLATE.md) checklist.
- CI (lint + unit + dev-integration + coverage) must be green before merge.
- Every PR also runs the Playwright E2E workflow. It is an advisory check: a
  failure stays visible for investigation but does not block merging.

### 4. Commit message convention

Format: `<type>(<scope>): <subject>`

- **type**: `feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`
- **scope**: module-level (`api`, `service`, `dao`, `models`, `core`, …) or
  comma-separated for cross-module changes.
- **subject**: concise, no trailing period. Chinese or English both accepted;
  this repo's history is primarily Chinese.

### 5. Testing — the three-tier system

Tests are isolated by runtime environment. Paths are **strictly** structured:

| Tier | Path root | External deps |
| - | - | - |
| Unit | `tests/unit/<pkg>/` | none |
| Dev-integration | `tests/dev-integration/<pkg>/` | none (Mock / MSW) |
| Testenv-integration | `tests/testenv-integration/<pkg>/` | real backend + real DB |

Key rules:

- The module layer under `tests/<tier>/<pkg>/` mirrors the package source tree
  **1:1** (the source root `app/` or `src/` is folded away). The frontend
  Playwright e2e under `testenv-integration/` is **exempt** (organized by user
  journey, `*.spec.ts`).
- Python test files: `test_<full_source_filename>.py` (keep `_router`/`_service`
  /`_dao` suffixes). TS/TSX: `<OriginalName>.test.ts(x)`.
- **Network boundary**: in-process anything goes; out-of-process I/O (real DB,
  real HTTP, non-localhost DNS) is **forbidden** in unit & dev-integration, and
  only allowed in testenv-integration. Disk/SQLite-file/temp-dir count as
  in-process and are always fine.

Run before pushing:

```bash
cd backend && uv run pytest ../tests/unit/backend/ ../tests/dev-integration/backend/ -v
cd frontend && pnpm test:unit && pnpm test:integration
```

### 6. Coverage thresholds

| Scope | Total | Per-file floor |
| - | - | - |
| Backend | ≥ 80% | ≥ 50% |
| Frontend | ≥ 60% | ≥ 50% |

Only `unit/` + `dev-integration/` count toward coverage; `testenv-integration/`
(e2e) does not.

### 7. Dependencies — declared, then locked (do not hand-edit lockfiles)

- **Backend**: edit `backend/pyproject.toml`, then regenerate derived files:
  ```bash
  cd backend
  uv pip compile pyproject.toml -o requirements.txt
  uv pip compile pyproject.toml --extra test --extra dev -o requirements-test.txt
  uv lock
  ```
  Commit `pyproject.toml` + both `requirements*.txt` + `uv.lock` together.
- **Frontend**: edit `frontend/package.json`, run `pnpm install`, commit
  `pnpm-lock.yaml`.

Never hand-edit `requirements*.txt`, `uv.lock`, or `pnpm-lock.yaml`.

### 8. Code style

- **Python**: static rules (format, imports, naming, complexity) are enforced by
  **Ruff** — run `uv run ruff check app/`. Semantic conventions (pydantic-first
  models, three-layer model/transform discipline, typed secrets via `SecretStr`,
  business-exception error handling) are detailed in `CLAUDE.md` §12.
- **TS/Frontend**: `pnpm lint` (ESLint) + Prettier.

### 9. Secrets & config

Never commit real connection strings, tokens, or credentials. Use the
`.env.example` templates; real `.env` files are git-ignored. Testenv connection
config is injected by the test system, never hard-coded (see `CLAUDE.md` §3.3.1).

### 10. Releases (maintainers)

This project follows [Semantic Versioning](https://semver.org/).

**Version bumps must go through a PR — never push release commits straight to
`main`.** Branch protection and CI (including the lockfile drift guard) only run
on PRs. Direct pushes to `main` bypass those checks and have already caused
release failures (e.g. bumping `pyproject.toml` without regenerating `uv.lock`).
Do not use admin bypass / rule-violation overrides for release work.

**After the release PR merges, do not tag manually.** The `Release` workflow
(`.github/workflows/release.yml`) waits for the **CI workflow on `main`** to
finish successfully, then:

1. Detects that `frontend/package.json` `version` changed vs the parent commit
2. Checks it matches `backend/pyproject.toml` `version`
3. Creates GitHub Release `vX.Y.Z` on that merge commit (if the tag does not
   already exist)
4. The existing `Deploy` workflow runs on `release: published` and triggers
   Coolify

```bash
# 1. Open a release PR (do not commit version bumps on main):
#    - Bump frontend/package.json `version` to the target version
#    - Bump backend/pyproject.toml to the same version, then in backend/:
#        uv lock
#      Commit pyproject.toml + uv.lock together (and requirements*.txt if deps
#      changed; §7 / CLAUDE.md §5.3)
# 2. Wait for PR CI green, then merge into main
# 3. Wait for CI on main (push) to go green — Release workflow then auto-creates
#    vX.Y.Z and Deploy follows
```

**Backfill / emergency:** Actions → **Release** → **Run workflow**, optional
`version` input (default = current `package.json`). Use only when a version is
already on `main` but no GitHub Release exists (e.g. workflow added after a bump).

**Manual fallback** (if Actions is unavailable):

```bash
python scripts/gen-release-notes.py --from-tag <prev-tag> > pr-list.md
# Summarize → release-notes.md if desired
git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0
gh release create v0.1.0 --notes-file release-notes.md --title "v0.1.0"
```

See [`docs/maintainers/github-setup.md`](./docs/maintainers/github-setup.md)
for the full repo setup checklist.

---

## 简体中文

感谢贡献！开 PR 前请先阅读本文。参与本项目即表示同意遵守
[`行为准则`](./CODE_OF_CONDUCT.md)。

### 1. 环境初始化

```bash
# 后端（Python 3.11+，uv）
cd backend && uv pip install -e ".[test,dev]"

# 前端（Node 20+，pnpm 9）
cd frontend && pnpm install
```

安装 git hook，让本地跑与 CI 相同的检查。**Git hook 不进版本控制**——`git clone`
从不自动运行安装脚本——因此**每个新 clone**（你的机器、CI、新同事）都必须手动跑
一次：

```bash
bash scripts/install-hooks.sh   # 轻量：只装 hook，不装依赖
# 或一次性全量引导（hook + 前后端依赖）：
bash scripts/init_env.sh
```

两者都把 `core.hooksPath` 指向 `scripts/git-hooks/`（跨平台，无需软链）。

### 2. DCO 开发者来源证明（必填）

每个 commit 必须**带签名**，以证明代码由你编写或你有权按本项目许可证提交：

```bash
git commit -s -m "feat(api): ..."
```

这会追加 `Signed-off-by: 你的名字 <you@example.com>` 尾注。`DCO` CI 会拒绝
缺少匹配作者签名的 PR。补签：`git commit --amend -s` 或 `git rebase --signoff <base>`。

### 3. Issue 与 PR

- **开 issue**：请使用 [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/) 下的模板
  —— 选 [🐛 Bug 报告](./.github/ISSUE_TEMPLATE/bug_report.yml) 或
  [✨ 功能请求](./.github/ISSUE_TEMPLATE/feature_request.yml)。用法提问或安全报告请走
  "New issue" 页上的外链（Discussions / 安全策略），不要开空白 issue。
- **分支**：从 `main` 切分支，**禁止**把 WIP 直接推到 `main`。
- PR 聚焦单一主题；用 `Closes #123` 关联 issue。
- 填写 [PR 模板](./.github/PULL_REQUEST_TEMPLATE.md)检查清单。
- 合并前 CI（lint + 单元 + dev-integration + 覆盖率）必须全绿。
- 每个 PR 也会运行 Playwright E2E；该检查为提示性检查，失败会保留供排查，
  但不阻塞合并。

### 4. Commit message 规范

格式：`<type>(<scope>): <subject>`

- **type**：`feat` / `fix` / `docs` / `style` / `refactor` / `test` / `chore`
- **scope**：模块级（`api`、`service`、`dao`、`models`、`core` 等）；跨模块用逗号。
- **subject**：简洁、结尾不加句号。中英皆可，本仓库历史以中文为主。

### 5. 三阶测试体系

测试按运行环境隔离，路径**强制**分层：

| 阶段 | 路径根 | 外部依赖 |
| - | - | - |
| 单元 | `tests/unit/<包>/` | 无 |
| 开发集成 | `tests/dev-integration/<包>/` | 无（Mock / MSW） |
| 测试环境集成 | `tests/testenv-integration/<包>/` | 真实后端 + 真实库 |

关键规则：

- `tests/<阶段>/<包>/` 下的模块层与包源码树 **1:1 对齐**（源码根 `app/` 或 `src/`
  折叠掉）。`testenv-integration/` 下的前端 Playwright e2e **豁免**此规则（按用户
  旅程组织，`*.spec.ts`）。
- Python 测试名：`test_<完整源文件名>.py`（保留 `_router`/`_service`/`_dao` 后缀）；
  TS/TSX：`<原始大小写名>.test.ts(x)`。
- **网络边界**：进程内随便用；进程外 I/O（真实库、真实 HTTP、非 localhost DNS）在
  单元与开发集成中**禁止**，仅 testenv 允许。磁盘 / SQLite 文件 / 临时目录算进程内，
  始终允许。

推送前运行：

```bash
cd backend && uv run pytest ../tests/unit/backend/ ../tests/dev-integration/backend/ -v
cd frontend && pnpm test:unit && pnpm test:integration
```

### 6. 覆盖率门槛

| 范围 | 总覆盖率 | 每文件兜底 |
| - | - | - |
| 后端 | ≥ 80% | ≥ 50% |
| 前端 | ≥ 60% | ≥ 50% |

仅 `unit/` + `dev-integration/` 计入覆盖率；`testenv-integration/`（e2e）不计入。

### 7. 依赖：声明后锁定（禁止手改锁文件）

- **后端**：改 `backend/pyproject.toml`，再重生派生文件：
  ```bash
  cd backend
  uv pip compile pyproject.toml -o requirements.txt
  uv pip compile pyproject.toml --extra test --extra dev -o requirements-test.txt
  uv lock
  ```
  将 `pyproject.toml` + 两份 `requirements*.txt` + `uv.lock` 一并提交。
- **前端**：改 `frontend/package.json`，跑 `pnpm install`，提交 `pnpm-lock.yaml`。

禁止手改 `requirements*.txt`、`uv.lock`、`pnpm-lock.yaml`。

### 8. 代码风格

- **Python**：静态规则（格式、import、命名、复杂度）交给 **Ruff**——
  `uv run ruff check app/`。语义约束（pydantic-first、三层 model/转换纪律、
  `SecretStr` 类型化密钥、业务异常错误处理）详见 `CLAUDE.md` §12。
- **TS / 前端**：`pnpm lint`（ESLint）+ Prettier。

### 9. 密钥与配置

切勿提交真实连接串、token 或凭据。使用 `.env.example` 模板；真实 `.env` 已被 git
忽略。testenv 连接配置由测试系统注入，**不得硬编码**（见 `CLAUDE.md` §3.3.1）。

### 10. 发布（维护者）

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)。

**版本 bump 必须走 PR，禁止直接往 `main` 推发版 commit。** 分支保护与 CI
（含 lockfile 漂移守卫）只在 PR 上完整生效；直推 `main` 曾导致漏跑 `uv lock`
等发版事故。发版时**不得**使用管理员 bypass / 规则豁免。

**发版 PR 合并后不必手动打 tag。** `Release` workflow
（`.github/workflows/release.yml`）会等待 **`main` 上的 CI** 成功结束后：

1. 检测 `frontend/package.json` 的 `version` 相对父提交是否变化
2. 校验与 `backend/pyproject.toml` 版本一致
3. 若尚无对应 tag，则在该 merge commit 上创建 GitHub Release `vX.Y.Z`
4. 现有 `Deploy` workflow 监听 `release: published`，触发 Coolify

```bash
# 1. 开发版 PR（不要在 main 上直接改版本号）：
#    - bump frontend/package.json 的 version
#    - 同步 bump backend/pyproject.toml，并在 backend/ 执行 uv lock
#      将 pyproject.toml + uv.lock 一并提交（依赖变更时还有 requirements*.txt）
# 2. 等 PR CI 绿后 merge 进 main
# 3. 再等 main 上 CI（push）绿 —— Release workflow 自动建 vX.Y.Z，随后 Deploy
```

**补发 / 运维：** Actions → **Release** → **Run workflow**，可选填写 `version`
（默认用当前 `package.json`）。仅用于「版本已在 main、但还没有 GitHub Release」
的场景（例如本 workflow 上线前已 bump 的 0.7.2）。

**人工兜底**（Actions 不可用时）：

```bash
python scripts/gen-release-notes.py --from-tag <上一个tag> > pr-list.md
git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0
gh release create v0.1.0 --notes-file release-notes.md --title "v0.1.0"
```

完整仓库设置清单见 [`docs/maintainers/github-setup.md`](./docs/maintainers/github-setup.md)。
