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
- 曾关联的 `codex/four-agent-memory-upstream` 计划在外部源码仓库归档后删除。本归档不依赖尚未创建的 tag；如需追溯，请以各文档已记录的 commit 为准。
- 如要调研 TencentDB 的当前能力，应新增带访问日期和 immutable commit 的 Snapshot，而不是复用本目录的运行结论。
