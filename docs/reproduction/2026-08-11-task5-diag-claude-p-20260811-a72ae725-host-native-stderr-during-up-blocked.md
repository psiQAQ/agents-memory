# Task 5 Claude `-p` diagnostic `a72ae725` Blocked during Compose up

## 状态

**Blocked / host-native-stderr-during-up**。

本记录是 [a72ae725 Ready preflight](2026-08-11-task5-diag-claude-p-20260811-a72ae725-ready.md) 的独立结果文件。它不改写 Ready 或任何历史 reproduction，且该 tuple 不得复用。

## 单次 workload attempt

唯一 workload attempt 在 Compose `up` 期间停止。Windows PowerShell 5 将 Docker 正常 stderr progress（`Network ... Creating`）转换为 terminating `NativeCommandError`；即使已设置 `PSNativeCommandUseErrorActionPreference`，该行为仍中止宿主协调器。

这不是 diagnostic retry。`bootstrap`、`claude-config`、`claude-headless`、JSON 与 classification 均未执行或产生；不得据此推断 Claude write、Proxy/Core 根因或任何业务 Gate 结论。

## 失败后精确盘点与边界

| 项目 | 观察 |
| --- | --- |
| evidence directory | exists，0 files |
| containers | 5：`config-init` exited 0；`mock-llm`、`memory-core`、`memory-proxy`、`memory-hub` healthy |
| network | 1 |
| volumes | 5 |

服务 health 与 `config-init` exit 0 只描述 failure-time inventory，**不是** bootstrap、客户端配置、Claude write、共享/隔离/leak 或任何业务通过证明。未读取 raw logs、raw evidence 或 secret。

## 恢复入口

本记录提交后已获用户授权，对该精确 project 执行 cleanup；host evidence 保留。下一步先对 tracked Node coordinator 写 TDD：使用 `spawnSync`、bounded stdout 与 direct structured canonical JSON parser，避免 PowerShell 对 Docker progress stderr 的转换；通过后使用全新 tuple。不得 retry 当前 tuple、reset、finalize、进入 TUI/真实模型或扩大范围。
