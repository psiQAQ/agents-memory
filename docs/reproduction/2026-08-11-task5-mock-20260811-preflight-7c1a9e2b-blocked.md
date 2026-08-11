# Task 5 deterministic Mock `preflight-7c1a9e2b` Blocked

## 状态

**Blocked / business Gate 未通过**。

本记录是 append-only runtime evidence，不改写此前 product/root/image 前置 Passed 的限定结论。固定 launcher 已启动并 fail closed；没有继续 TUI、真实模型或 Task 6。

## 固定输入与授权边界

| 项目 | 值 |
| --- | --- |
| Root branch / HEAD | `codex/four-agent-memory-compose@164df28f079ba29d8c1d5cf35ac884e460d9eb35` |
| Product gitlink | `2de58c2f656978cfe310e3ac3ade085d8096f83b` |
| `RUN_ID` | `task5-mock-20260811-preflight-7c1a9e2b` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-mock-20260811-preflight-7c1a9e2b` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-mock-20260811-preflight-7c1a9e2b` |
| Launcher | tracked `node tests/integration/tools/run-task5-mock.mjs`，固定 17 步，`--no-build` |

负责人已授权本次本地 Mock Docker workload 与 evidence 目录创建。gateway 使用进程内随机 disposable non-LLM 值；该值未输出、未记录、未写入本文件。未读取 Tencent `.env`、模型/用户 secret、旧 runtime evidence、settings 或 home。

## Started

- Docker context：`desktop-linux`；client/server `29.6.2`。
- 启动前 root fresh Node：150/150 Passed。
- 七个固定 image tag 的 image ID 与 active SOP 记录一致。
- 目标 evidence 路径启动前不存在；launcher 自行执行 exact Compose-project label freshness probes 后创建。

## Exact outcome

launcher exit 1，只输出固定 `Task 5 Mock launcher failed`。默认 launcher 不暴露 child output 或失败 step，因此本记录不猜测具体步骤号。

失败后只执行只读、精确 project 状态盘点：

- `mock-llm`、`memory-core`、`memory-proxy`、`memory-hub` 均为 running/healthy；
- `config-init` 为 exited 0；
- 精确 project 保留 1 个 network；
- 精确 project 保留 `core-data`、`hub-data`、`proxy-data`、`proxy-logs`、`runtime-config` 共 5 个 volume；
- 精确 evidence 目录存在，但没有 evidence 文件。

以上只证明失败后的 Compose 状态，不证明固定 step 1 或任何后续业务 step 已由 launcher 判为 Passed。protocol/leak、management/outsider、三次写入、六次读取、final oracle 与三个真实 headless 的结果均未形成脱敏 evidence，保持 **Not Verified**；Task 5 deterministic Mock Gate 为 **Blocked**。

## 保留现场与后续边界

精确 project、network、volumes 与 evidence 目录全部保留供诊断；未执行 `down`、`down -v`、prune、cleanup、build、真实 API、TUI、push、PR 或 remote 修改。下一步必须先在该保留现场内确定固定失败步骤和原因，并在获得新的实施授权后决定修复或重跑；在此之前不得进入 TUI 或 Task 6 Paid/真实模型 Gate。
