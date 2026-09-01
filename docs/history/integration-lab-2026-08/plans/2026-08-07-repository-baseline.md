> **状态：Historical** — 本计划属于已归档的 2026-08 实验，不应直接执行。

# Repository Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可在个人 fork 上复现、调试并向腾讯上游提交 PR 的仓库初始基线。

**Architecture:** 根仓库保存调研、设计和实验记录；唯一源码 submodule 指向 `psiQAQ/TencentDB-Agent-Memory`。腾讯仓库作为本地 `upstream` remote，仅用于同步与 PR 对照。

**Tech Stack:** Git、Git submodule、Markdown。

## Global Constraints

- 只创建一个初始 commit，不 push。
- 不下载当前阶段不需要的其他参考仓库。
- 不修改 TencentDB 源码或安装依赖。

---

### Task 1: 建立一致的初始仓库基线

**Files:**

- Modify: `.gitmodules`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/2026-08-07-tencentdb-memory-retrofit.md`
- Create: `docs/superpowers/plans/2026-08-07-repository-baseline.md`

- [ ] `.gitmodules` 保留 8 个参考仓库地址；仅 TencentDB 登记 gitlink 并指向个人 fork。
- [ ] README 与 CLAUDE 指引区分可开发 submodule 和只保留分析文档的参考项目。
- [ ] 将平台路线收敛为“复现 → Claude Code 适配 → 三智能体共享”。
- [ ] 标记旧 10-PR 改造计划必须按当前源码重新校准。
- [ ] 运行 `git diff --check`、submodule URL/SHA 检查和 Markdown 本地链接检查。
- [ ] 创建一次初始 commit，不 push。
