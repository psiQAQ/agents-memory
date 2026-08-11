# Task 5 deterministic Mock `full-6449fcf8` Claude read Blocked

## 状态

**Blocked / fixed step 11**。

tracked `tests/integration/tools/run-task5-mock.mjs` 对该唯一 tuple 只执行一次，exit `1`，唯一固定输出为 `Task 5 Mock launcher failed step=11`。没有 retry、build、raw child/log/evidence 读取、TUI 或真实/Paid 模型调用。

## 已证明与未证明

固定 17 步中，steps 1–10 均 exit `0`：

1. 四个长期服务启动并 healthy；
2. bootstrap；
3. Claude/OpenCode/Pi 三份 config；
4. protocol/leak Gate；
5. management/outsider Gate；
6. Claude、OpenCode、Pi 三次 write。

step 11 是 Claude 对 OpenCode owner 的第一条 cross-owner read。固定 failure 不能区分 setup、launch 前后的 aggregate observation/verifier、Claude client 或 evidence publish；steps 12–17（其余五读与 finalize）均未运行。不能从前三写成功推断六读/final 已通过，也不能读取 raw runtime 内容猜测根因。

## 固定运行事实

| 项目 | 值 |
| --- | --- |
| Root runtime HEAD | `81761bbf3cb4b44d8218b9fcfaa250dcab389146` |
| Product/gitlink | `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`（clean/exact） |
| `RUN_ID` | `task5-mock-20260812-full-6449fcf8` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-mock-20260812-full-6449fcf8` |
| fixed result | `step=11` |
| cleanup 前 project counts | containers/networks/volumes `5/1/15` |
| cleanup 前 host evidence files | `2`（仅计数，未读内容） |

## 安全恢复入口

先按 TDD 扩展 fixed-phase wrapper 支持 read success，并以全新 tuple 固定“services/bootstrap/config → 三 writes → Claude read(owner=opencode)”路径；结果只允许 `success/client/observation/evidence/setup`。在该诊断完成前，不重跑 full Mock、不复用本 tuple、不进入 TUI/real。
