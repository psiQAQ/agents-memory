# Task 5 OpenCode typed diagnostic `89398d1d` Passed

## 状态

**Runtime Passed（single OpenCode typed diagnostic only）**。

tracked coordinator 对 [89398d1d Ready](2026-08-12-task5-diag-opencode-20260812-89398d1d-ready.md) 固定的全新 tuple 只运行一次并以 `0` 退出。运行时 root HEAD 为 `73db4d961c2f71482cf40db4a868d242bda5b17a`，其中 diagnostic code 为 `c163b6c83052688476cbfe1b102151e1d694f2c3`；product/gitlink 为 clean/exact `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`。宿主只接收 coordinator 校验后的 canonical 18-key JSON：

```json
{"status":"classified","launch":"code0","launch_phase":"cli-zero","launch_category":"none","output_present":true,"proxy_dns_ok":true,"proxy_tcp_ok":true,"continuity":"ok","sequence_delta":1,"total_delta":1,"expected_operation_present":true,"expected_operation_valid":true,"expected_main_count":1,"unexpected_operation_count":0,"unexpected_path_count":0,"unsafe":false,"dropped":0,"truncated":false}
```

## 已证明边界

- OpenCode config render、child spawn、bounded capture 与 CLI exit `0` 均完成；output present。
- Proxy DNS/TCP probes 均通过，Mock aggregate continuity 为 `ok`。
- 同一 epoch 的 sequence/total delta 均为 `1`；预期 OpenCode operation 存在且有效，main request 精确为 `1`。
- unexpected operation/path 均为 `0`；无 unsafe、dropped 或 truncated state。

本次没有读取 raw child output、runtime logs、settings、home、secret、credential、identity 或 evidence 内容；host evidence file count 为 `0`。该结果只证明 typed diagnostic 的 render/spawn/capture/CLI 与精确单次 Mock operation，不证明普通 `opencode-headless` 的 exact verifier 或 evidence publish，也不证明完整 protocol/leak、management/outsider、三写六读、final oracle、TUI 或真实/Paid 模型。

业务 Gate 因此仍为 **Blocked**。下一 Gate 是先用 TDD 给 normal headless 增加固定阶段诊断，区分 exact verifier 与 evidence publish，而不是复用本 tuple 或直接重跑 full Mock。
