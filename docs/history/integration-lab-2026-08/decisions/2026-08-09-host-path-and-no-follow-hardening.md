> **状态：Historical** — 本决策只适用于已归档的 2026-08 实验，不构成当前仓库的执行要求。

# ADR-2026-08-09：宿主路径根绑定与持久目录 no-follow

**状态：** Accepted
**验证状态：** Static Passed；Runtime Not Run

> **No-follow**：读取或写入前逐层检查路径本身，拒绝 symbolic link、Windows junction 和不安全 hard link，避免操作被重定向到预期目录之外。

> **Canonical path**：解析相对片段和链接后得到的唯一绝对路径。

## Context

调用者原先可以把 `PROJECT_ROOT` 自报为仓库子目录，使仓库其他位置的 secret 看起来位于“root 外”；Windows Compose bind 也只要求变量存在，相对路径会被 Compose 解析进项目目录。持久 Claude home 由 agent 用户控制，`.memory` junction 可以把 root one-shot 的 credential 写入重定向到 volume 外。

## Decision

1. Host preflight 的 repository root 由 `tests/integration/tools/` 中脚本的 `import.meta.url` 固定向上推导并 `realpath`；传入的 `PROJECT_ROOT` 必须与该值精确一致，不能由调用者缩窄、扩大或改成链接别名。
2. Windows config 目录必须已存在、是 canonical absolute directory、不是 link/junction，且位于真实 repository root 外。Host gate 原子写短期 attestation；`windows-config-init` 在容器内核对 host path 字段、时效和实际 bind 后才渲染 settings。
3. `prepare-agent.mjs` 对 state、credentials、home、`.memory`、source key、temporary key 和已有 destination 使用 `lstat` fail-closed 检查。目录不得是 link/junction；source、temporary 和 destination 必须是单链接 regular file。
4. Agent 顺序保持 `bootstrap → agent-config-a/b/c → Claude`；Claude 仍不挂共享 bootstrap state。

## Consequences

- 相对 Windows 路径、仓库内路径、伪造 project root、篡改/过期 attestation 和 junction escape 在写入前被拒绝。
- 真实 Docker bind、Linux uid/gid、Windows Claude TUI 与服务端 ACL 仍需 Runtime 验证；静态测试不能替代这些证据。
- MemoryPanel build context 的 `.dockerignore` 仍是 Task 4 public fork 的 Medium 项，本决策不以 root preflight 代替它。
