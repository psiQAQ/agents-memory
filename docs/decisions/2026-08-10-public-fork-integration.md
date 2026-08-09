# ADR-2026-08-10：集成 Claude/DeepSeek 兼容修复

> **ADR**：Architecture Decision Record，用于记录一项关键工程选择、依据与后果。

> **Submodule**：根仓库记录外部 Git 仓库精确提交、同时让该源码保留独立提交历史的目录。

> **Public fork**：用户在公开 GitHub 仓库中维护的个人派生仓库，用来保存可独立验证并适合后续 PR 的通用修复。

> **Gitlink**：根仓库固定 submodule 精确提交的指针。

> **Static Integrated**：修复已通过源码测试与独立复审，并已写入根 gitlink、镜像标签和静态契约；不表示镜像或服务已经运行。

> **Local-only commit**：只存在于当前本地 Git 仓库、尚未推送到远端的提交；新的 clone 无法取得它。

**状态：** Accepted
**验证状态：** Static Integrated；Docker Build/Runtime Not Run
**日期：** 2026-08-10

## Context

根 Docker Gate 已定义 A/B/C 身份、共享、隔离与上游泄漏契约，但只有把通用修复锁定到根仓库才能进入真实构建。Public fork 分支从 `c75ef5834eeacf17f2df8f84f7cf2d1747822de2` 演进到 `b75317b2bb0deb72240b2016d54252e3232b48fa`，包含 Claude 认证、session identity、Memory/Skill bridge、持久层 key、上游 header、跨平台 tool URL、Panel build context 与 settings 权限修复。

独立复审对最终 SHA 给出 Clean；MemoryProxy 为 93 passed / 3 skipped，MemoryPanel 4/4 且 backend/web build 通过。三项 skip 分别是 Windows 上无法验证的 POSIX mode 和 Node 24 缺少 native `better-sqlite3` binding 的两项测试。Proxy typecheck 仍有与原始基线完全一致的 6 个错误，本分支新增错误为 0。

## Decision

1. 根 submodule gitlink 固定到 `b75317b2bb0deb72240b2016d54252e3232b48fa`。
2. Core、Hub、Proxy 镜像统一使用 `fork-b75317b` 标签，并由 Compose contract 测试锁定。
3. 根当前文档把 ACL/header/runtime tool base 从 Expected Blocked 改为 Static Integrated / Runtime Not Run；没有业务运行证据时不得写 Passed。
4. 旧部署中未被访问的历史行可能仍含 `user_key`。升级前必须离线扫描并清除，再轮换所有 Memory 用户 key；点查时清除不是全库清理。
5. 不在本任务中 push、修改 remote 或创建 PR。最终 public SHA 是 local-only commit，直到用户另行授权 push。

## Consequences

- 当前工作区可直接从 final fork 源码构建，根 runner 的安全契约与服务实现不再存在已知 SHA 漂移。
- 新 clone 执行 `git submodule update` 会在远端找不到 final SHA；这是复现阻断，不得用旧 commit 静默替代。
- Docker Node 22、native SQLite、POSIX mode、Mock 业务流、Windows/Docker Claude TUI 和真实 DeepSeek 仍需后续运行 Gate。
- Public fork 的 25 个提交保留独立修复边界，后续可在用户授权后整理并推送/发起 PR。
