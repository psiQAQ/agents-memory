# Task 5 Claude `-p` diagnostic `08c403c6` Blocked during Compose up

## 状态

**Blocked / host-timeout-during-up**。

本记录是 [08c403c6 Ready preflight](2026-08-11-task5-diag-claude-p-20260811-08c403c6-ready.md) 的独立结果文件；不改写 Ready 或任何历史 reproduction。

## 两次宿主动作的严格区分

第一次宿主脚本在任何 workload 前因 `New-Item -LiteralPath` 不受支持而停止。复核时 evidence path 仍不存在、exact Compose labels 为 `0/0/0`；这不是 diagnostic attempt。

修正后第二次才是首个 workload attempt，且不是 diagnostic retry。其 shell command 被错误设置为 1 秒 timeout，在 Compose `up` 期间中止。

## 失败后盘点与未运行边界

| 项目 | 观察 |
| --- | --- |
| evidence directory | exists，0 files |
| containers | 5：`mock-llm` healthy、`config-init` exited 0、`memory-core` health starting、`memory-proxy`/`memory-hub` Created |
| network | 1 |
| volumes | 5 |

上述仅是 timeout 后 Compose 盘点，不证明 bootstrap 或任何业务步骤通过。`bootstrap`、`claude-config` 与 `claude-headless` 均未执行；没有 JSON、classification 或 Claude write 根因结论。未读取 raw logs、raw evidence 或 secret。

## 保留与下一 Gate

当前 tuple 不得复用。本记录提交后，project 按用户授权精确 cleanup；host evidence 保留。下一步使用新的 tuple，以 long-lived asynchronous exec 和 direct structured JSON parser 执行最小诊断；不得 retry/reset/finalize、进入 TUI/真实模型或扩大范围。
