# Agent 记忆项目参考

**状态：Snapshot index**
**更新时间：2026-09-01**

本目录按项目保存架构与机制快照，用于比较可采纳的设计，不表示本仓库集成、部署或认可其中任何产品。

| 项目 | 主要参考机制 | 文档 |
| -- | -- | -- |
| Basic Memory | Markdown + Git 作为规范记忆 | [basic-memory.md](basic-memory.md) |
| claude-mem | Hook 捕获与异步 observation | [claude-mem.md](claude-mem.md) |
| Graphiti | 双时间戳与失效不删除 | [graphiti.md](graphiti.md) |
| LangMem | 多类记忆与双通道写入 | [langmem.md](langmem.md) |
| Letta | 记忆块与异步整理 | [letta.md](letta.md) |
| Mem0 | 事实提取、作用域和检索过滤 | [mem0.md](mem0.md) |
| MemRL | 基于任务反馈的记忆效用 | [memrl.md](memrl.md) |
| TencentDB Agent Memory | 团队记忆、资产与 ACL | [上游快照](tencentdb-agent-memory-upstream-2026-08-18.md) |

各快照的来源和版本边界写在相应文档顶部。需要重新核验时，新增带日期和 immutable commit 的 Snapshot，不覆盖旧文档。
