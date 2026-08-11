# Task 5 Claude `-p` diagnostic `a72ae725` Ready

## 状态

**Ready / Not Run**。

这是替代 `08c403c6` host-timeout-during-up Blocked tuple 的新唯一 diagnostic preflight。它不复用旧 tuple，不改写任何 Ready/Blocked 历史，也不把 preflight 扩写为 Docker workload 或业务 Gate 通过。

## 固定输入与 freshness

| 项目 | 值 |
| --- | --- |
| Root HEAD | `ed48941febf717810e4582bdee38770e1d9339ae`（clean） |
| Product gitlink | `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`（clean/exact） |
| `RUN_ID` | `task5-diag-claude-p-20260811-a72ae725` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-diag-claude-p-20260811-a72ae725` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-diag-claude-p-20260811-a72ae725` |

- exact Compose label probes 为 container/network/volume `0/0/0`；evidence path 不存在，name conflicts 为 `0`。
- `127.0.0.1:8125` listeners 为 `0`；七个 active images 均按 exact preflight `7/7`。
- diagnostic overlay contract 为 PASS。

以上只证明该新 tuple 可安全进入受控诊断；不证明 Docker workload、Claude write、Proxy、Core、JSON parse 或任何业务 Gate 已运行。

## 受控范围与未运行边界

如获后续运行授权，只允许一次 workload attempt，使用 long-lived asynchronous host execution 与 direct structured canonical JSON parser。禁止 retry、reset、finalize、TUI、真实/Paid 模型和范围外命令；不得读取或输出 raw logs、raw evidence、`.env`、settings、home 或 secret。

当前没有启动 Docker、build、runtime 或 cleanup。diagnostic Claude write、后续两写、六读、final、真实 headless、TUI 与真实/Paid 模型均为 **Not Run**。无论失败或完成，均须另立 append-only reproduction，并保持精确 project/evidence 边界。
