# Task 5 deterministic Mock `opentitle-4f056ee6` OpenCode write Blocked

## 状态

**Blocked at fixed launcher step 9**。

本记录接续 [opentitle-4f056ee6 Ready](2026-08-12-task5-mock-20260812-opentitle-4f056ee6-ready.md)，不覆写 preflight 事实。tracked 17-step launcher 只运行一次并以 exit `1` 结束；宿主只收到固定单行 `Task 5 Mock launcher failed step=9`，没有 retry，也没有读取 raw logs/evidence、settings、home、secret 或模型 key。

## 固定运行边界

| 项目 | 结果 |
| --- | --- |
| `RUN_ID` | `task5-mock-20260812-opentitle-4f056ee6` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-mock-20260812-opentitle-4f056ee6` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-mock-20260812-opentitle-4f056ee6` |
| Runtime root HEAD | `570c41dfa929040058eec7178263d5ca24eb7ec5` |
| Product/gitlink | `9e456a5b7bb47ae40596237d0f0b87c1edfc098f` |
| Launcher | 单次 exit `1`；固定 `step=9` |
| Ordered steps | steps 1–8 exit `0`；step 9 是首个 OpenCode write |
| Fail-stop inventory | exact project 为 5 containers / 1 network / 14 volumes；4 个 long-running services healthy，`config-init` exit `0`；evidence file count `2`，内容未读 |
| Client evidence counts | Claude `1` / OpenCode `0` / Pi `0`；只计数，不读取内容 |

固定 step 编号只证明 launcher 的前八个命令依次成功退出以及第九个命令未通过；steps 10–17 没有运行，完整三写六读、final oracle、TUI 与真实模型均未通过。

## 脱敏 aggregate 诊断边界

首次宿主编排编码尝试在调用 Docker 前因 `TextEncoder` 缺失停止，因此不计为 workload。随后只执行一次 `--rm`、脱敏 aggregate probe，结果为：

```text
CLEAN true
TOTAL 5
MAIN 2
OPERATIONS 2
UNEXPECTED 0
OPENCODE_REQUESTS 1
OPENCODE_MAIN 1
CATEGORY OPENCODE_EXPECTED_ONCE_STEP_FAILED
```

这只证明 OpenCode 的预期主请求精确一次到达 Mock，且该 probe 未观察到额外或 unexpected request。step 9 仍是复合边界；现有脱敏证据不能在 CLI nonzero、bounded output scan、aggregate postcheck 或 evidence publish 中确定具体失败项，也不能把其中任一项写成根因。

下一 Gate 是使用全新 tuple 的 OpenCode typed diagnostic；不得复用或 retry 本 tuple。对应 Docker 生命周期见 [opentitle-4f056ee6 exact cleanup](2026-08-12-task5-mock-20260812-opentitle-4f056ee6-exact-cleanup-passed.md)。完整 Mock、TUI 与真实/Paid 模型仍为 **Not Run**。
