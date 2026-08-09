# ADR-2026-08-09：Docker-first 默认 Mock 与秘密边界

**状态：** Accepted
**验证状态：** Static；Docker runtime Not Run

## Context

当前批准范围是 Windows 10 原生 Claude 与一个 Docker Linux Claude，Codex、WSL、Win11 和 LAN 验证均后置。实验不能把个人 Claude home、真实模型 key 或付费调用带入可跟踪配置。现有 TencentDB standalone 是系统语义基线，不是已验证的 Docker 业务流。

## Decision

1. 默认 Compose 只访问确定性 Mock；真实 DeepSeek 需要 `compose.real.yaml`、`real-claude` profile 与付费 Gate 三者同时显式满足。
2. Claude 客户端认证使用 Memory 用户 key，并通过 MemoryProxy；DeepSeek key 只供 Proxy/Core/Knowledge 服务端读取。
3. 所有客户端配置由脱敏模板渲染到隔离目录，禁止挂载真实 `~/.claude` 或 Docker socket。
4. 维持 SQLite/Core/Hub/Proxy standalone 基线；不在本阶段增加 PostgreSQL、独立 vector-db 或 Core Redis。
5. 跟踪模板和示例，忽略 `.worktrees/`、本地 settings、`.secrets/`、`.runtime/`、原始日志与本地 env。

## Consequences

- 默认环境可重复、无外网模型费用，但只证明 Mock 契约，不能证明真实 DeepSeek 兼容性。
- 真实调用必须等待用户撤销旧 key 并在工作区外提供新 secret 文件；若 Gate 未满足，状态保持 Blocked/Not Run。
- public fork 的通用修复保持独立提交，不混入私有 Compose 编排。

## Security record: SEC-LOCAL-001

发现历史本地 Claude settings 曾由 Codex turn-diff ref 保存为本地 Git blob；主仓库和普通 commit 中未发现该内容，已知 push 中也未发现。旧 key 必须撤销。未自动删除任何 ref，也未运行 Git GC。受跟踪模板仅来自脱敏字段摘要；本记录刻意不包含 key、长度、blob 内容或任何可复原片段。
