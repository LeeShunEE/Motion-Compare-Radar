# Maintainer: GitHub repository setup checklist

> One-time setup that must be done in the GitHub web UI / CLI (cannot live in the
> repo files). Run after pushing the open-source scaffolding to `main`.
> 仅能在 GitHub 网页/CLI 完成的一次性设置（无法写进仓库文件）。在把开源骨架推到
> `main` 后执行。

## 1. Repository basics / 仓库基础

- [ ] Settings → General → set **Description** and **Website**.
- [ ] Add **Topics**: `radar-chart`, `remotion`, `nextjs`, `fastapi`, `data-visualization`, `video`.
- [ ] Settings → General → **Features**: enable **Discussions** and **Issues**;
      enable **Sponsorships** only if desired (we opted out of `FUNDING.yml`).

## 2. Labels / 标签

Run the script (requires `gh` + `gh auth login`):

```bash
bash scripts/setup-labels.sh LeeShunEE/Radar-Renderer
```

Creates: `bug`, `enhancement`, `documentation`, `good first issue`,
`help wanted`, `question`, `duplicate`, `wontfix`, `dependencies`, `frontend`,
`backend`, `ci`.

## 3. Discussions / 讨论区

- [ ] Settings → General → Features → check **Discussions**.
- [ ] In Discussions, keep default categories (Announcements, Q&A, Ideas, Show
      and tell). The issue template `config.yml` already links here.

## 4. Pinned issue / 置顶 issue

- [ ] New issue titled **"Roadmap & Contribution Guide"**; paste the content of
      [`ROADMAP.md`](../../ROADMAP.md).
- [ ] On that issue → **Pin issue**.

```bash
# CLI alternative:
gh issue create --repo LeeShunEE/Radar-Renderer \
  --title "Roadmap & Contribution Guide / 路线图与贡献指引" \
  --body-file ROADMAP.md
# then pin it in the web UI (Pin issue)
```

## 5. Ruleset for `main` / `main` 分支规则

- [ ] Settings → Rules → Rulesets → Add a branch ruleset for `main`:
  - [ ] Require a pull request before merging.
  - [ ] Require status checks to pass: select **Backend (unit + dev-integration + coverage)**,
        **Frontend (unit + integration + coverage)**, and **Check Signed-off-by**.
  - [ ] Do **not** require **Playwright E2E (testenv)**. It runs on every PR and
        reports failures, but remains advisory so it cannot block merging.
  - [ ] Require branches to be up to date before merging.
  - [ ] (Optional) Require review from Code Owners.

## 6. Security / 安全

- [ ] Settings → Security → enable **Private vulnerability reporting**
      (so the `SECURITY.md` advisory link works).
- [ ] Enable **Dependabot alerts** and **Dependabot security updates**
      (the `.github/dependabot.yml` handles version-update PRs).

## 7. First release / 首个发布

When the backend MVP and docs land, follow [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
§10 end-to-end. **Version bumps must go through a PR** (never push release commits
straight to `main` / 版本 bump 必须走 PR，禁止直推 `main`); tag and
`gh release create` only after the PR is merged and CI has passed on that path.

```bash
# After the release PR is merged into main:
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
python scripts/gen-release-notes.py > pr-list.md
# Summarize pr-list.md with LLM → release-notes.md
gh release create v0.1.0 --notes-file release-notes.md --title "v0.1.0"
```
