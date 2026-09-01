# 2026-08 四 Agent / Docker 实验归档

> **状态：Historical** — 本目录只保存已结束的 2026-08 实验材料，不是当前方案或执行 SOP。
> **归档日期：2026-09-01**

本目录保存曾用于 Windows、Docker、Mock、Claude Code 和 TencentDB fork 集成的实验记录。它们保留用于追溯曾验证或曾阻塞的事项；根仓库已移除相应执行代码、Compose 配置、客户端模板和 submodule，因此本文档均不可作为当前 SOP、运行证明或实现任务。

## 内容

| 目录或文件 | 内容 |
| -- | -- |
| [final-evaluation.md](final-evaluation.md) | 当时的综合评估与风险矩阵。 |
| [decisions/](decisions/) | 当时的架构与安全决策。 |
| [specifications/](specifications/) | 当时的需求、边界与验收合同。 |
| [plans/](plans/) | 当时的实施计划。 |
| [reproduction/](reproduction/) | 静态、失败、阻塞与受限通过证据。 |
| [references/](references/) | 当时 fork 的 TencentDB 快照。 |

## 溯源边界

- 该实验线包含历史 fork、历史本地 commit 和过去的运行环境；它不追踪当前 TencentDB Agent Memory 的 `local_ds`。
- `agents-memory` 的历史执行分支 `codex/four-agent-memory-compose` 已归档为注释 tag `archive/codex-four-agent-memory-compose-20260901`，peeled commit 为 `cafd509d23ae4f17077fcf745f64eb4cacc1a7f5`；原远端分支已删除。该 tag 仅用于溯源，不能恢复任何执行义务。
- 外部源码仓库中曾关联的 `codex/four-agent-memory-upstream` 已归档为 `archive/codex-four-agent-memory-upstream-20260901`，peeled commit 为 `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`。它与本仓库的历史 Compose 实验线是不同的引用，均不代表当前 TencentDB Agent Memory 的开发状态。
- 如要调研 TencentDB 的当前能力，应新增带访问日期和 immutable commit 的 Snapshot，而不是复用本目录的运行结论。
