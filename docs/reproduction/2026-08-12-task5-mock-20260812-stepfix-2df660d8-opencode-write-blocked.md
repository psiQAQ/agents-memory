# Task 5 deterministic Mock `stepfix-2df660d8` OpenCode write Blocked

## 状态

**Blocked at fixed launcher step 9**。

本记录接续 [stepfix-2df660d8 Ready](2026-08-12-task5-mock-20260812-stepfix-2df660d8-ready.md)，不覆写 preflight 事实。tracked 17-step launcher 只运行一次并以 exit `1` 结束；宿主只收到固定单行 `Task 5 Mock launcher failed step=9`，没有 retry，也没有读取 raw logs/evidence、settings、home、secret 或模型 key。

## 固定运行边界

| 项目 | 结果 |
| --- | --- |
| `RUN_ID` | `task5-mock-20260812-stepfix-2df660d8` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-mock-20260812-stepfix-2df660d8` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-mock-20260812-stepfix-2df660d8` |
| Launcher | 单次 exit `1`；固定 `step=9` |
| Ordered steps | steps 1–8 exit `0`；step 9 是首个 OpenCode write |
| Fail-stop inventory | exact project 为 5 containers / 1 network / 14 volumes；evidence file count `2`，内容未读 |

固定 step 编号只证明 launcher 的前八个命令依次成功退出以及第九个命令未通过；它不把完整三写六读、final oracle、TUI 或真实模型升级为 Passed。steps 10–17 没有运行。

## 根因与最小修复方向

对固定 OpenCode `1.18.16` 源码和当前 headless argv 的静态审查确认：首次 `opencode run` 在未提供 session title 时会启动自动 title generation，因而同一 operation 可产生额外的第二次模型调用；Task 5 oracle 对每个 headless operation 要求 `/anthropic/v1/messages` 主请求 exact `+1`，两者冲突。

根因不是现有 Bearer `authToken` 配置，也不是 `/tmp` mount。最小修复只需给 OpenCode headless `run` 传入固定、非敏感的 `--title`，避免首轮 auto-title side call；不改认证语义，不为 OpenCode 增加 tmpfs。

对应 exact project 的资源生命周期见 [stepfix-2df660d8 exact cleanup](2026-08-12-task5-mock-20260812-stepfix-2df660d8-exact-cleanup-passed.md)。修复与 replacement image 证据见 [OpenCode title replacement image Passed](2026-08-12-task5-opencode-title-replacement-image-passed.md)。完整 Mock Gate、TUI 与真实/Paid 模型仍为 **Not Run**。
