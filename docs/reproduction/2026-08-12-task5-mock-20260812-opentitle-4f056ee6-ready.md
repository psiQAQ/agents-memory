# Task 5 deterministic Mock `opentitle-4f056ee6` Ready

## 状态

**Ready / Not Run**。

本记录固定 OpenCode fixed-title replacement 后的全新 run/project/evidence tuple。只读 preflight 已完成；tracked 17-step launcher 尚未执行，未创建 evidence 目录，也未启动 Docker workload。

## 固定边界

| 项目 | 值 |
| --- | --- |
| `RUN_ID` | `task5-mock-20260812-opentitle-4f056ee6` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-mock-20260812-opentitle-4f056ee6` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-mock-20260812-opentitle-4f056ee6` |
| Preflight root HEAD | `4f056ee61d90c64b2b22bdf69550256e588f378b` |
| Product/gitlink | `9e456a5b7bb47ae40596237d0f0b87c1edfc098f` |

root 与 product worktree 均 clean，gitlink 与 product HEAD 一致。exact Compose-project label 查询为 containers/networks/volumes `0/0/0`；evidence 路径不存在且父目录有效；全局容器为 `0`；宿主 `127.0.0.1:8125` 监听数为 `0`。base + mock/real/claude/opencode/pi/management Compose config 为 `7/7` Passed。

## Exact images

| 组件 | Exact image ID |
| --- | --- |
| Core | `sha256:fded9d48d76bf71d0652023be0e9aa5553d46c039cc04ace0ec7c1e370f95d44` |
| Proxy | `sha256:55fedae3f6a3a0a45ac8be45461d8cab23c52f11cc089c1c1e54c7d236de764b` |
| Hub | `sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4` |
| tools | `sha256:8ca1a2a82a585ecf477577db2308c09348b4c7a6ff6022693f3653ed20004d81` |
| Claude Code | `sha256:261a917376f791d9b5e092040c2f488f23588b7103a27606226426f273b040dd` |
| OpenCode fixed-title | `sha256:263a6d0eade24b72b4b2627984a930fc69a3e621519b1ec050a0320398b890a1` |
| Pi | `sha256:56582fd216db259342f4414ebdc6c9c9188229678d77eb2f360959c9af2e4538` |

## 唯一下一动作

只允许对本 tuple 单次执行 tracked `tests/integration/tools/run-task5-mock.mjs`。launcher 使用一次性 non-LLM gateway 值，不读取 Tencent `.env`、模型 key、settings、home、旧 evidence 或 raw logs。失败必须 fail-stop、保留脱敏现场并新增 reproduction；成功 project 保留到 scoped review 与用户 TUI 决策。不得 retry、build、真实/Paid 模型或提前进入 TUI。
