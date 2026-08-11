# Task 5 Claude `-p` diagnostic `6d6e9f6a` Ready

## 状态

**Ready / Not Run**。

这是为 `toolsfix-7e1031af` 的 Claude write 阻塞准备的唯一诊断 run，不改写任何历史 Blocked reproduction，也不把预检或 harness review 扩写为 runtime 通过。

## 固定输入与 preflight

| 项目 | 值 |
| --- | --- |
| Root HEAD | `5be0584261fa460ebdfffa94971900cf8b920116` |
| Product gitlink | `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`（clean） |
| `RUN_ID` | `task5-diag-claude-p-20260811-6d6e9f6a` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-diag-claude-p-20260811-6d6e9f6a` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-diag-claude-p-20260811-6d6e9f6a` |

- exact Compose label probes：container/network/volume 均为 `0`。
- evidence path 在开始前不存在；container 与受控端口盘点均为 `0`。
- 七个固定 images 的 preflight 为 `7/7`。
- diagnostic overlay 对 Claude image、UID、security 与只读 bind 的 exact contract 为 PASS。
- fixed diagnostic harness 已独立 review，Critical/Important/Minor 均为 `0`。

以上均是 Ready preflight，不代表 Docker workload、Claude `-p`、Proxy、Core 或业务 Gate 已执行。

## 受控执行范围

获授权后只允许一次且按固定顺序执行：启动四个长期服务 → bootstrap → `claude-config` → 一次 diagnostic Claude write。禁止 retry、reset、finalize、真实/Paid 模型、TUI、raw 输出或扩大为完整 17 步 launcher。所有观测必须保持脱敏；不得读取或记录 raw logs、raw evidence、`.env`、settings、home 或 secret。

## 未运行边界

当前没有启动 Docker、runtime 或 cleanup。diagnostic Claude write、后续两写、六读、final、真实 headless、TUI 与真实/Paid 模型均为 **Not Run**。当前 project/evidence tuple 仅登记为 Ready；失败或完成后均须保持精确资源边界并另立 append-only reproduction。
