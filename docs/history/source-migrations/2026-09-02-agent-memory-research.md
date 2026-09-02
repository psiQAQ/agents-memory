# Windows `agent-memory-research` 迁移记录

**状态：Historical**
**迁移日期：2026-09-02**

> 本记录说明一次文档内容迁移的来源、完整性边界和明确排除项；它不代表源目录已删除，也不是 Zotero 或 leaderboard 的当前状态证明。

## 来源状态

| 字段 | 记录 |
| -- | -- |
| 源路径 | `/run/media/psi/新加卷/workspace/agent-memory-research/` |
| Git 状态 | `No commits yet on main`；未配置 remote。 |
| 迁移基准 | 当前工作区文本，而非 Git index 中的暂存版本。 |
| 顶层文件 | `README.md`、`CATALOG.md`、`REVIEW.md`、`AGENTS.md`。 |

## 文件校验值

以下 SHA-256 于迁移开始前读取；它们用于证明未修改源文件。

| 源文件 | SHA-256 |
| -- | -- |
| `README.md` | `a4ad7a790a5627f23792eafb831911f79681bc65f24503ca56bb624dfe045a6c` |
| `CATALOG.md` | `eeaba9e97de95331cd6466102b27f474f8a657aa1c72dbb4d6847bb1d499fb1a` |
| `REVIEW.md` | `f5d949d46a630661b80e608915735d44e5f0145e576a841532ee74693fee5d76` |
| `AGENTS.md` | `b09d41a795864ca88772c2cb3452026a8c2cc220977f03dac014b7da9a663ee3` |

## 内容映射

| 源内容 | 目标位置 | 迁移方式 |
| -- | -- | -- |
| `REVIEW.md` | [文献与产业综述](../../research/reports/2026-08-20-agent-memory-literature-and-industry-survey.md) | 整理为含 Fact / Inference / Recommendation 的 2026-08-20 Snapshot。 |
| `CATALOG.md` | [Zotero 文献目录](../../research/catalogs/2026-08-20-zotero-agent-memory-catalog.md) | 完整保留 collection/item key、链接、stars 快照与来源状态。 |
| `AGENTS.md` 中的文献与 Zotero 规则 | [Zotero 文献调研工作规则](../../foundations/zotero-research-workflow.md) 与根 `CLAUDE.md` | 调整为文档型仓库规则，移除 submodule/运行流程。 |
| `README.md` 中的定位与维护原则 | 根 `README.md`、[文档索引](../../README.md) | 并入现有知识库导航，不重复创建第二个根入口。 |

## 明确排除项

- `.git` 与 `.gitmodules` 不迁入；目标仓库保持无 submodule。
- `agent-memory-leaderboard/` 不迁入。源父仓库登记的 gitlink 为 `5761ed58502d24153115cbdc010e44957cb18c3a`，但迁移检查时工作目录的 `HEAD` 为 `1b8142bfe0f20f1c5218d6b554aa0012de34e504`，且有 11 个已修改的跟踪源码文件。
- 不迁入 Zotero 数据库、PDF、附件、MCP 设置、token 或日志；源目录中也未发现这些顶层调研文件。

## 删除前置条件

本记录与目标仓库提交只能证明顶层 Markdown 已迁入，不能保留被排除的 leaderboard 源码改动。删除源目录前必须由用户单独确认放弃或另行保存这些改动。
