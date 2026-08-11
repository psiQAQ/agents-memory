# Task 5 OpenCode normal headless phase diagnostic `a666e597` Ready

## 状态

**Ready / Not Run**。

这是 typed diagnostic `89398d1d` Passed/cleaned 后的全新唯一 tuple。历史 Ready、Blocked、Passed 与 cleanup 记录保持 append-only。本记录只证明 fixed-phase wrapper、coordinator、静态合同和 freshness/preflight，不证明 Docker workload、完整 Mock Gate、TUI 或真实模型。

## 固定输入与静态证据

| 项目 | 值 |
| --- | --- |
| Root HEAD | `cbd1a27b1a6129bebca8ad455442e5829ea292fd`（clean） |
| Product/gitlink | `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`（clean/exact） |
| `RUN_ID` | `task5-diag-opencode-headless-20260812-a666e597` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-diag-opencode-headless-20260812-a666e597` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-diag-opencode-headless-20260812-a666e597` |
| Core image | `sha256:fded9d48d76bf71d0652023be0e9aa5553d46c039cc04ace0ec7c1e370f95d44` |
| Proxy image | `sha256:55fedae3f6a3a0a45ac8be45461d8cab23c52f11cc089c1c1e54c7d236de764b` |
| Hub image | `sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4` |
| tools image ID | `sha256:8ca1a2a82a585ecf477577db2308c09348b4c7a6ff6022693f3653ed20004d81` |
| Claude image | `sha256:261a917376f791d9b5e092040c2f488f23588b7103a27606226426f273b040dd` |
| OpenCode image ID | `sha256:263a6d0eade24b72b4b2627984a930fc69a3e621519b1ec050a0320398b890a1` |
| Pi image ID | `sha256:56582fd216db259342f4414ebdc6c9c9188229678d77eb2f360959c9af2e4538` |

- TDD RED 为缺少 phase wrapper/module 与 coordinator export；GREEN 为 focused `47/47`、fresh root Node `254/254`、active Compose `7/7` 加 diagnostic overlay `1/1`，独立 review 为 `Critical 0 / Important 0 / Minor 0`。
- `success` 只有在真实 `launchClient`、before/after exact aggregate verifier 与 atomic `write.json` evidence publication 全部完成后才返回；其余结果只允许 `client`、`observation`、`evidence`、`setup` 固定阶段。
- coordinator 固定先运行一次 Claude write，再运行一次 OpenCode write，以复现非空 prior-operation baseline；固定步骤中无 build、down、prune 或 cleanup。
- exact project 的 containers/networks/volumes 为 `0/0/0`；global containers `0`；evidence path 不存在且 parent 为普通目录；`127.0.0.1:8125` listeners `0`；active image refs `7/7` 精确匹配。

## 唯一允许的下一步

只允许 tracked `tests/integration/tools/run-task5-opencode-headless-diagnostic.mjs` 对该 tuple 执行一次。禁止 build、retry、复用旧 tuple、full Mock、读取 raw child/log/evidence、TUI 或真实/Paid 模型。

若 freshness 检查通过且本次运行创建了 exact project，结果后必须新增 append-only result/cleanup 记录，并仅对该 project 使用 base/mock/claude/opencode/headless-diagnostic overlays 与对应 profiles 执行 `down --volumes --remove-orphans`。若在 label collision 或其他 preflight 阶段失败，则保留碰撞或未知资源审计，不执行 cleanup。任何路径均不得使用 `--rmi` 或全局 prune。
