# Zotero 文献调研工作规则

**状态：Active**
**更新时间：2026-09-02**

## 元数据

| 字段 | 内容 |
| -- | -- |
| 问题与范围 | 管理 Zotero 元数据与调研目录的写作边界；不管理 Zotero 客户端或 MCP 运行。 |
| 来源范围 | Windows `agent-memory-research` 的 `AGENTS.md`、`README.md` 与 `CATALOG.md`，于 2026-09-02 迁入。 |
| 版本边界 | 2026-08-20 的目录 Snapshot；未来每次 MCP 回读另建带日期记录。 |
| 关联材料 | [Zotero 目录](../research/catalogs/2026-08-20-zotero-agent-memory-catalog.md)、[调研方法](research-methodology.md)、[项目参考](../references/projects/README.md)。 |

## 适用范围

本规则管理 Agent 记忆调研中的 Zotero 元数据、文献目录和项目关联。它不要求在本仓库安装 Zotero、配置 MCP 或保存任何本地 Zotero 数据。

当前可用的历史目录见 [2026-08-20 Zotero Snapshot](../research/catalogs/2026-08-20-zotero-agent-memory-catalog.md)。其中 collection key、item key、stars、附件和标签状态均按其原始日期理解。

## Fact

- 本仓库当前没有连接 Zotero 或 Zotero MCP；已迁入的 key、标签和附件状态来自带日期的 Markdown Snapshot。
- Zotero 数据库、附件与 MCP 配置属于本地应用状态，不是文档型调研仓库的可追踪内容。

## Inference

将可读元数据与本地应用数据分离，能够保留文献发现线索，同时避免把单机附件状态、凭证或运行配置误写成可复现研究结论。

## Recommendation

### 记录原则

- 文献条目优先记录 DOI、arXiv ID、标题、作者、发表版本和公开 URL；项目条目记录 GitHub URL、检查日期与对应论文关系。
- 先按 DOI、arXiv ID、标题和 GitHub URL 去重；论文关联代码时，在 Zotero 中使用 `has-github` 标签和“代码与数据”子笔记描述关系。
- 没有绑定论文的项目可使用 `webpage` 条目，并以 `github-project`、`project-only` 和带日期的 stars 快照说明收录原因。
- stars、榜单、默认分支、release、preview/GA、附件和标签都是动态或本地状态；不得把单次回读结果外推为长期事实。
- 外部项目源码只在其外部仓库检查。调研仓库通过 [项目参考](../references/projects/README.md) 保存带日期、来源和版本边界的分析，不添加 submodule。

### 后续 MCP 回读流程

Zotero 安装和 MCP 配置完成后，在仓库外完成连接与凭证管理；本仓库只接收可阅读的调研结论。

1. 读取目标 collection 与 item，按标识符去重。
2. 回读 item key、集合归属、标签、附件元数据和关联 GitHub URL。
3. 将可验证的变化写入新的带日期 catalog Snapshot，并在相邻综述或项目参考中更新受影响结论。
4. 将未能访问、条目冲突、缺失附件或版本不明明确标为待验证，不覆盖旧 Snapshot。

### 明确禁止

- 不跟踪 Zotero 数据库、存储目录、附件 PDF、MCP 设置、token、cookie 或本地日志。
- 不在本仓库运行 Zotero 客户端、部署 MCP 服务或保存客户端运行配置。
- 不将 item key、PDF 获取状态或标签存在与论文内容正确、项目能力可用混为一谈。
