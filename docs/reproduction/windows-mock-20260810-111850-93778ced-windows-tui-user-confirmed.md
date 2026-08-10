# 2026-08-10 Windows Claude TUI 用户确认

> **TUI**：在终端中显示并接收键盘操作的交互界面；Claude Code 的主要交互界面属于 TUI。

> **User Confirmed**：由用户直接观察并确认的结果。它是人工验收证据，不等同于自动化日志。

> **Runtime corroboration**：与用户观察时间相邻的脱敏服务端计数和布尔值旁证；它能支持请求确实发生且未触发列明的泄漏检查，但不能替代用户对界面的观察。

> **Append-only report**：创建后不回写覆盖的运行记录；后续结果使用新报告补充。

- 日期：2026-08-10
- 父 Run ID：`windows-mock-20260810-111850-93778ced`
- Compose project：`mem-win-windows-mock-20260810-111850-93778ced`
- 父运行记录：[Windows Claude Mock Gateway 运行通过](windows-mock-20260810-111850-93778ced-windows-claude-mock-passed.md)
- 确认时根仓库提交：`da882e63d89e97355da1f1dfc19f3dac7fcebf2b`
- Public fork 提交：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 结论：Windows 10 原生 Claude TUI 界面、输入与 Mock 文本往返 **User Confirmed / Runtime Passed（受限范围）**

## User-confirmed fact

用户明确回复“确认”，按交接要求同时确认以下两点：

1. Windows native Claude TUI 界面正常显示并可输入；
2. 输入 `Reply exactly mock text; no tools` 后，收到只表达 `mock text` 的回复。

因此，G5 Windows UX 在本次 Windows 10、run-specific `CLAUDE_CONFIG_DIR`、默认 Mock、单轮无工具文本范围内 Passed。没有收集截图、终端全文、prompt marker、Memory 用户 key、环境变量值、settings 内容或凭证派生值。

## Runtime corroboration

用户确认后只读检查同一 Compose project：4 个长期服务仍为 `running|healthy`，3 个 one-shot 仍为 `exited|0`。没有重启、重建或清理服务。

随后通过 internal network 中的一次性 test-runner 只读取 Mock 的脱敏观察汇总，没有读取或输出 raw payload：

| 项目 | 结果 |
| -- | --: |
| Headless evidence baseline | 6 条 Anthropic `/messages` |
| Post-confirmation count | 8 条 Anthropic `/messages` |
| Count delta | +2 |
| `sensitive_value_seen` | `false` |
| `unexpected_credential_seen` | `false` |
| `memory_user_credential_seen` | `false` |
| `internal_identity_header_seen` | `false` |

计数高于 headless baseline，且四项泄漏布尔均为 false，因此本次用户确认得到运行旁证。该汇总没有保存消息内容，也不能把具体某一条 observation 与用户输入做逐字绑定；用户确认仍是界面和可见回复的直接证据。

## 结论边界

本报告只升级 Windows native Claude TUI 界面、输入与单轮 Mock 文本往返。Docker Claude 的已通过证据仍来自独立 run `docker-mock-20260810-033636`；本 Windows project 没有重跑 Docker Claude，也没有证明两个客户端在同一业务任务中的治理行为。

真实 DeepSeek、streaming、tool use、thinking、长会话、Win11、LAN、WSL Claude、Gateway/Proxy/Core 故障恢复与备份还原仍为 **Not Run**。企业试点/部署结论继续 **No-Go**；本机默认 Mock 开发保持 **Conditional Go**。

项目继续保留，没有执行 `down`、`down -v` 或 prune。2 个 networks 与 6 个 named volumes 仍按敏感运行状态管理。
