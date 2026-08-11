# Task 5 Claude `-p` diagnostic `7186820a` Blocked before Mock

## 状态

**Blocked / claude-cli-nonzero-before-mock**。

本记录是 [7186820a Ready preflight](2026-08-12-task5-diag-claude-p-20260812-7186820a-ready.md) 的独立结果文件；不改写 Ready 或任何历史 reproduction，且该 tuple 不得复用。

## 单次诊断结果

coordinator exit 为 `0`，四个固定步骤在 coordinator 下完成。唯一 canonical output 为：

```json
{"status":"classified","launch":"nonzero","continuity":"ok","sequence_delta":0,"total_delta":0,"expected_operation_present":false,"expected_operation_valid":false,"expected_main_count":0,"unexpected_operation_count":0,"unexpected_path_count":0,"unsafe":false,"dropped":0,"truncated":false}
```

该结果表示 Claude child 在任何 Mock-observed request 前 nonzero。它不区分 settings、CLI args、auth、onboarding、capture 或 Proxy-before-Mock，也不构成这些项中任一项的根因结论。

## 严格范围与保留边界

没有 retry、reset、finalize、TUI、真实/Paid 模型或范围外步骤；未读取 raw logs、raw evidence 或 secret。project 保留，等待用户授权的精确 cleanup；host evidence 保留，但不需要读取其原文。

## 下一 Gate

下一步先为 tracked bounded phase/category 写 TDD，再使用全新 tuple 运行最小诊断。不得复用当前 tuple、将 coordinator exit 0 写成 Claude 通过，或将 `sequence_delta`/`total_delta` 为 0 扩写为业务 Gate 通过。
