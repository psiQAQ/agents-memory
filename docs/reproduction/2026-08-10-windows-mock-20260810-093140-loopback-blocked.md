# 2026-08-10 Windows Mock 宿主 Loopback 阻塞

> **Append-only reproduction report**：只新增、不覆盖旧实验结果的复现记录，用来保留当时已通过的阶段、失败点和未执行范围。

> **Run ID**：一次实验的唯一名称；它把 Compose project、忽略的原始证据目录和报告关联起来。

> **Gate**：进入下一阶段前必须通过的检查；任一 Gate 失败就停止，不把后续项目记为通过。

> **Loopback**：只在本机可访问的网络地址；这里指 Windows 宿主 `127.0.0.1:8096`。

> **Headless**：不进入交互界面的 Claude Code 命令行验证。

> **TUI**：Claude Code 在终端中显示并接收键盘操作的交互界面。

> **Mock**：返回固定结果的模拟模型服务；本 run 没有访问真实 DeepSeek。

- 类型：Append-only Failed/Blocked reproduction report
- 日期：2026-08-10
- Run ID：`windows-mock-20260810-093140-a664249f`
- Compose project：`mem-win-20260810-093140-a664249f`
- 报告基线根仓库 HEAD：`20fc67b9640fcc1c038e71f7ea0f2d0250de3df7`
- Public fork SHA：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 原始证据目录：`.runtime/runs/windows-mock-20260810-093140-a664249f/`
- 结论：Mock Gate Passed；Standalone Gate Passed；`agent-config-a` Passed；宿主 Loopback Failed/Blocked；Windows config/headless/TUI Not Run；DeepSeek 0

## 已确认事实

| 阶段 | 状态 | 证据边界 |
| -- | -- | -- |
| Mock contract | Passed | 忽略目录中的 `mock-contract.json` 为 `status=ok`，11/11 项断言完成 |
| Standalone memory | Passed | 忽略目录中的 `standalone-memory.json` 为 `status=ok`，12/12 项断言完成；报告不复制其中的稳定派生值 |
| `agent-config-a` | Passed | 运行阶段记录 one-shot 容器为 `exited|0` |
| 宿主 `127.0.0.1:8096` | Failed / Blocked | `agent-config-a` 之后未发现宿主监听，运行在 host-loopback 阶段停止 |
| Windows host attestation / config init | Not Run | 位于失败阶段之后，没有生成可作为通过证据的新配置结果 |
| Windows Claude headless | Not Run | 未启动 Windows Claude 请求 |
| Windows Claude TUI | Not Run | 未进入交互式人工验收 |
| DeepSeek | 0 / Not Run | 未选择 real profile，未加载真实模型 secret，真实模型请求为 0 |

本报告只摘录状态和断言数量，不记录 token、key、nonce 原文，不记录 key 的 hash、前缀、长度或其他可跨报告关联的稳定值。两份原始 JSON 继续留在忽略目录，不转存为受跟踪运行日志。

## 失败边界

批准规格记录：Compose 展开与容器 `HostConfig.PortBindings` 都声明了直接从 internal 网络中的 MemoryProxy 发布 `127.0.0.1:8096`，但容器生效端口表为空；Docker Desktop 同时报告该 internal 网络没有可用于端口转发的容器 IP。使用同一 Mock 镜像、监听 `0.0.0.0` 的普通 bridge 对照可从宿主取得 HTTP 200。

**事实：** 本 run 的两级业务 Gate 和 agent 配置准备已经通过，随后在宿主 listener 检查处失败。它不能证明 Windows Claude 配置、headless、TUI 或真实模型路径。

**推断：** 现有证据把阻塞点定位到 Docker Desktop 对 internal 网络容器的直接宿主端口发布，而不是 Mock/Standalone Gate、MemoryProxy 监听地址或 agent-a bundle 生成。该推断不等于已证明新的 Gateway 运行成功。

**建议：** 保留本 run 和两份原始 JSON 不变。使用独立 Loopback Gateway 的修复应创建新的唯一 run/project，重新执行完整两级 Gate、宿主 `curl.exe --noproxy '*'`、Windows config、headless、服务端观察和 TUI；不得把后续结果回填为本 run 的成功。

决策与剩余风险见 [Windows Loopback Gateway ADR](../decisions/2026-08-10-windows-loopback-gateway.md)，操作入口见 [Docker 多客户端记忆实验](../../tests/integration/README.md)，当前企业结论见 [企业智能体记忆系统评估](../enterprise-memory-system-evaluation.md)。
