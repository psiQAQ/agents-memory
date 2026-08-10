# ADR-2026-08-10：四 Docker CLI 共享记忆基线

> **ADR**：Architecture Decision Record，记录一项关键工程选择、依据与后果。

> **Gitlink**：根仓库固定 submodule 精确提交的指针。

> **Legacy**：保留供审计的历史目标、决策或证据；它不自动代表当前 active 路线。

**状态：** Accepted
**验证状态：** Static baseline；Docker/Mock/API/TUI Not Run
**日期：** 2026-08-10

## Context

此前仓库的 Windows + Docker Claude 路线和 `69fd8b3` 后的本地修复已有独立证据，但它们不能证明 OpenCode、Pi 或 Codex 能以原生身份接入。新目标要求四个 Docker CLI 使用不同的 Memory user、Agent、Session、user key、home、workspace 和 evidence，只通过显式 team-visible memory 共享同一 Team/Task。

## Decision

1. 根 gitlink 固定为 Tencent upstream default `feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1`；upstream 前移前先审查，不批量迁移 legacy 修复。
2. 以 `codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 作为 local-only legacy ref；它尚未 push，fresh clone 不可取得，未经授权不得 push。跨 clone 可重建保全需要 push 或外部归档授权，在此之前仍未完成；旧 specs/plans/ADR/reproduction 保持原文。
3. Stage 1 依次使用 Claude Code `2.1.226`、OpenCode `1.18.16`、Pi `0.84.1` 的原生身份和 Anthropic Messages 路由；Stage 2 才支持 Codex `0.147.0` 的 `/codex/<space>/v1/responses`。
4. 缺失、格式非法或未绑定的 source 必须 fail closed；OpenCode、Pi、Codex 不得伪装成 `claude-code`、`openai` 或其他平台身份。
5. 模型 key 仅在服务端：Proxy 持有 DeepSeek Pro，Core/Hub 持有 DeepSeek Flash；客户端只持有各自 Memory user key。真实 API 必须在完整 Mock Gate 后并得到明确授权。

## Consequences

- 新的 active 文档仅把本轮工作称为 Static baseline。旧 Windows + Claude Runtime Passed 证据归档为 Legacy，不能计入四 CLI Gate。
- Task 2 必须从精确 upstream SHA source-build Core、Proxy、Hub，并记录 RED/Passed 和固定 image ID/digest。
- 产品缺陷只在 fork 的独立 worktree 修复；根仓库只容纳跨仓库 Compose、客户端和证据 Gate。未经授权不 push、建 PR、修改 remote 或执行破坏性清理。
