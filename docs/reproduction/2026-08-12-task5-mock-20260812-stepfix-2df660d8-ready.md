# Task 5 deterministic Mock `stepfix-2df660d8` Ready

## 状态

**Ready / Not Run**。

这是 `e83748e2` generic failure 归档、exact cleanup 与 launcher fixed-step TDD 后的全新唯一 tuple。它只允许 tracked `tests/integration/tools/run-task5-mock.mjs` 执行固定 17 步，不复用任何历史 project/evidence。

## 固定输入与 freshness

| 项目 | 值 |
| --- | --- |
| Preflight root HEAD | `62827328cf5e4acdadaa25de19800416a722bbc7`（clean） |
| Product gitlink | `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`（clean/exact） |
| `RUN_ID` | `task5-mock-20260812-stepfix-2df660d8` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-mock-20260812-stepfix-2df660d8` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-mock-20260812-stepfix-2df660d8` |

- exact project labels 为 containers/networks/volumes `0/0/0`；evidence path 不存在；global containers `0`；`127.0.0.1:8125` listeners `0`。
- base + mock/claude/opencode/pi/management merged config exit `0`；required exact image IDs `7/7` 匹配。
- launcher fixed-step focused `7/7`、root Node `233/233`、Compose config `7/7`、独立 review `C0/I0/M0`。

## 唯一允许的运行

launcher 固定执行 long-running services → bootstrap → 三 client config → 24-case protocol/leak → management/outsider → Claude/OpenCode/Pi 三次 write → 六次 ordered cross-owner read → final oracle。任一步失败立即停止，只允许固定 `step=1..17` 或 generic failure；不 retry、不读 raw logs/evidence、不进入 TUI/real。

若完整 Gate 成功，exact project 保留到 scoped review 与用户 TUI 人工确认；这时它尚未“用完”，不得提前 cleanup。若失败，则先做最小脱敏盘点/归档，再按用户要求精确清理该 project containers/network/volumes；不得使用 `--rmi` 或 prune。
