# ADR-2026-08-09：客户端凭证分发与付费运行证明

**状态：** Accepted
**验证状态：** Static Passed；Runtime Not Run

> **Credential fan-out**：由受信任的一次性进程把共享启动结果中的单个客户端凭证，复制到该客户端独占目录；客户端本身不能读取共享凭证目录。

> **Attestation**：宿主机预检成功后生成的短期证明文件。它只记录已批准的路径和运行参数，不包含模型 key。

## Context

Bootstrap 会一次创建 A/B/C 三个 Memory 用户凭证。若 Claude 容器直接挂载 bootstrap volume，任一客户端都能看到其他客户端凭证和 `bootstrap.private.json`。此外，容器内的 `/run/secrets` 与 `/lab` 只能证明容器挂载结果，不能证明原始 secret 在宿主机工作区之外。

## Decision

1. Bootstrap 只写入 named volume 的 `/state/run` 子目录。`agent-config-a/b/c` 以 root 身份一次性读取对应的 `credentials/<agent>.user-key`，原子写入各自 home 的 `.memory/user-key`，权限为 `0600`，所有者为 `10001:10001`。
2. Claude 容器只挂自己的 home 与 workspace，不挂 bootstrap volume；入口仅从 `/home/claude/.memory/user-key` 生成该客户端的 `settings.json`。
3. Windows 首轮只使用 agent-a。受信任的 `windows-config-init` 从 agent-a 私有 home 生成项目专用 Windows settings，不向 Windows Claude 暴露共享 bootstrap 目录。
4. 真实模型运行分成两步：宿主 `--write-attestation` 先对 canonical project、secret、evidence 路径做检查；容器 `--verify-attestation` 再核对 host path 字符串、run ID、预算、turn 和时效，并重新验证实际挂载的 secret。
5. Proxy 不直接挂 DeepSeek secret。`real-config-init` 把 key 安全转义进 root 创建、`0600`、`10001:10001` 所有的运行时配置；Core 与 Hub 仍通过同一个 Compose secret 在启动时注入环境。
6. `REAL_LLM_MAX_BUDGET_USD` 与 `REAL_LLM_MAX_TURNS` 是声明性审批输入，不是 Proxy、Core、Knowledge 或 Claude Code 的硬性费用/turn 限制。

## Consequences

- 单个 Claude 客户端不再能从挂载目录读取其他用户 key 或管理凭证。
- 宿主安全边界与容器运行边界均有独立、可复核的 fail-closed 检查。
- Attestation 15 分钟后失效；真实测试应在镜像已准备好之后才生成证明。
- 当前结论仅来自静态和单元测试。文件所有权、Docker Desktop bind 行为、Windows Claude TUI 与真实服务认证仍需运行验证。
