# Agent 记忆文献与产业综述（2026-08-20 Snapshot）

**状态：Snapshot**
**迁入日期：2026-09-02**
**原始快照日期：2026-08-20**

## 元数据

| 字段 | 内容 |
| -- | -- |
| 问题与范围 | 记录 Agent 记忆的对象、生命周期、研究热点、评测、国内外方案与分阶段建设建议；不重新核验 2026-08-20 之后的产品、榜单或 stars。 |
| 原始来源 | Windows 本机工作区 `/run/media/psi/新加卷/workspace/agent-memory-research/REVIEW.md`。 |
| 版本边界 | 源仓库为无 commit、无 remote 的当前工作区；本文仅整理其 2026-08-20 快照，不以其内容证明现况。 |
| 关联材料 | [Zotero 文献目录](../catalogs/2026-08-20-zotero-agent-memory-catalog.md)、[调研方法](../../foundations/research-methodology.md)、[项目参考](../../references/projects/README.md)、[企业方案设计](../../design/enterprise-memory-design.md)。 |

## 摘要

- 本快照将 Agent 记忆视为状态管理闭环，而不等同于长上下文、会话持久化或向量数据库。
- 2026-08-20 的资料将跨会话事实与个性化判断为较成熟方向，把经验/程序性记忆、团队共享、治理安全和多模态列为仍需谨慎验证的方向。
- 原资料建议先建设可追溯事件、结构化记忆、混合检索、时间/作用域过滤、版本与删除能力，再扩展图巩固、工作流与多 Agent 协作。
- 目录中的 Zotero item key、stars、产品状态和“已获取 PDF”等均是源工作区声明；后续应由 Zotero MCP 或第一方来源重新核验。

## Fact

### 记忆闭环与对象边界

源快照区分了三项容易混淆的能力：长上下文只能扩大单次可读信息；会话持久化只能续聊；向量数据库只提供存储和相似检索。其给出的 Agent 记忆闭环是：

```text
observe
  -> write / extract
  -> organize / consolidate
  -> retrieve
  -> use / act
  -> update / forget
  -> audit
```

[Agent Memory Leaderboard（AML）](https://agentmemories.ai/competition/)在该快照中被记录为以 Add/Search 为核心的可复核检索合同；源资料同时指出，这一合同不会覆盖自主写入、内部反思、参数记忆或行动控制。源资料还记录：截至 2026-08-20，AML 没有可核验的首期公开排名；参评或支持方展示不能替代评测结果。[公开榜单页](https://agentmemories.ai/leaderboard/industry/textual)

| 类型 | 典型内容 | 常见实现 | 主要风险 |
| -- | -- | -- |
| 工作记忆 | 当前目标、计划、工具输出和中间状态 | context、scratchpad、checkpoint | context 污染、预算失控 |
| 情景记忆 | 对话、行动、环境、失败和结果 | 事件日志、轨迹库、时间线 | 记录过多、检索噪声 |
| 语义记忆 | 稳定事实、实体关系、用户偏好和摘要 | 文档、事实表、知识图谱 | 摘要失真、事实过期 |
| 程序性记忆 | 工作流、规则、技能与调试经验 | prompt、runbook、skill library、代码 | 错误经验固化、负迁移 |
| 前瞻记忆 | 未来承诺、提醒和事件触发动作 | task table、scheduler、event trigger | 漏触发、重复执行 |

源资料以 [CoALA](https://arxiv.org/abs/2309.02427)、[Voyager](https://arxiv.org/abs/2305.16291) 和 [Agent Workflow Memory](https://arxiv.org/abs/2409.07429)说明：事实回忆与可复用技能/工作流是不同的记忆目标。

### 生命周期研究线索

| 阶段 | 源快照的机制与边界 | 代表来源 |
| -- | -- | -- |
| 写入 | 区分原话、观察、事实、推断、偏好、意图与程序规则；记录 `source`、时间、实体、置信度、证据、`supersedes` 与隐私作用域。 | — |
| 巩固 | 实体对齐、去重、聚类、冲突检测、摘要与规则提炼；摘要必须可回到原始 evidence。 | [A-MEM](https://arxiv.org/abs/2502.12110)、[MemOS](https://arxiv.org/abs/2507.03724)、[EverMemOS](https://arxiv.org/abs/2601.02163)、[Hindsight](https://arxiv.org/abs/2512.12818) |
| 检索 | 组合 BM25、向量、实体图、时间过滤、轨迹连接和 reranker；纯 embedding 对时间、否定、多跳与罕见词并不稳定。 | [HippoRAG](https://arxiv.org/abs/2405.14831)、Graphiti、Hindsight |
| 更新 | 同时保存 valid time 与 transaction time；区分 observation、fact、belief 和当前 view，使用版本关系而非覆盖旧事实。 | — |
| 遗忘 | 区分物理删除、取消索引、摘要压缩、降权和冷存储；隐私撤回应可验证。 | [MemoryAgentBench](https://arxiv.org/abs/2507.05257) |
| 使用 | 评估记忆能否改变工具选择、避免重复失败、兑现承诺和形成稳定策略，而非仅回答历史问题。 | [MemoryArena](https://arxiv.org/abs/2602.16313)、[ExpeL](https://arxiv.org/abs/2308.10144)、[ReasoningBank](https://arxiv.org/abs/2509.25140) |

源资料提示：MemoryAgentBench 的论文与 GitHub README 可能存在术语版本漂移，复现应固定论文与仓库版本。

### 理论和系统借鉴

源快照将传统理论视为设计灵感，而非神经机制证明。

| 概念 | 可借鉴的工程含义 | 不应作出的等同 |
| -- | -- | -- |
| 工作记忆 | 上下文需要执行控制与预算管理 | context window 不是人类工作记忆容量 |
| 情景/语义/程序性记忆 | 分开保存事件、事实和技能 | 数据结构分类不等于脑区对应 |
| 互补学习系统 | 快速事件写入与慢速巩固分离 | LLM 后台摘要不是生物睡眠 |
| 编码特异性 | 写入时保留时间、实体、任务与因果索引 | 单一 embedding 不会复现人类线索系统 |
| 重构性回忆与再巩固 | 允许组合、抽象、更新，但保留证据与版本 | 不应直接改写原始事件 |
| 前瞻记忆 | 用时间/事件触发器管理承诺 | 历史 RAG 不能替代可靠调度器 |

原始参考包括 [Working Memory](https://doi.org/10.1016/S0079-7421(08)60452-1)、[Encoding Specificity](https://doi.org/10.1037/h0020071) 和 [Complementary Learning Systems](https://doi.org/10.1037/0033-295X.102.3.419)。源资料还列出数据库的双时态/事务/provenance、信息检索的 reranking/diversity、存储系统的 append-only log/compaction，以及持续学习和强化学习的 replay 等工程类比。

### 热点、评测与方案快照

| 方向 | 源快照的热度与成熟度判断 | 主要限制 |
| -- | -- | -- |
| 长对话事实与个性化 | 很高 / 较成熟 | 偏好变化、敏感画像与越界个性化 |
| 时序图、冲突与巩固 | 很高 / 中等 | 更新与来源追踪仍需业务验证 |
| 经验、程序性、自进化记忆 | 上升最快 / 中早期 | 错误经验、回滚和评测成本 |
| 代码与开发记忆 | 高 / 中早期 | 公开可复现 benchmark 较少 |
| 多 Agent/团队记忆 | 上升 / 中早期 | ACL、一致性与责任归属 |
| 多模态/具身记忆 | 上升 / 早期 | 生态与通用 benchmark 较薄 |
| 治理、安全与投毒 | 快速升温 / 早期 | 默认防护与公开验证不足 |

源资料以 [M3-Agent](https://arxiv.org/abs/2508.09736) 和 [EMemBench](https://arxiv.org/abs/2601.16690)作为多模态记忆线索，以 [MemSecBench](https://arxiv.org/abs/2607.27080)说明持久化投毒与选择性修复的评测需求。

| 评测线 | 代表项目 | 主要能力 | 源快照记载的局限 |
| -- | -- | -- | -- |
| 长对话 QA | LoCoMo、LongMemEval、BEAM | 事实、多跳、时间、长上下文 | 问答不能代理行动价值 |
| 个性化 | PersonaMem / v2 | 显式/隐式偏好与画像变化 | 可能鼓励越界收集 |
| 生命周期 | MemoryAgentBench | 增量写入、容量、遗忘 | 版本措辞可能漂移 |
| 经验行动 | MemoryArena、ReasoningBank | 经验迁移、策略复用 | 环境依赖强、成本高 |
| 代码记忆 | CL-bench、ScriptMem、AML coding | 调试与开发经验 | AML coding 数据和 verifier 当时未公开 |
| 多模态 | M3-Bench、EMemBench | 视听情景、时空、归纳 | 生态仍薄 |
| 安全 | MemSecBench、ASB | 投毒、持久化、修复 | 产品默认能力缺少统一验证 |

源快照也记录了下列方案定位；每行均是截至该日期的资料汇总，而不是现行能力声明。

| 类别 | 方案 | 定位摘要 | 关联的现有参考 |
| -- | -- | -- |
| 开源/托管 | [Mem0](https://github.com/mem0ai/mem0) | 事实/偏好记忆的 SDK 与平台候选 | [Mem0 参考](../../references/projects/mem0.md) |
| 开源/托管 | [Zep / Graphiti](https://github.com/getzep/graphiti) | 双时态事实、关系变化和图检索 | [Graphiti 参考](../../references/projects/graphiti.md) |
| 开源/托管 | [Letta](https://github.com/letta-ai/letta) | 有状态 Agent runtime | [Letta 参考](../../references/projects/letta.md) |
| 框架 | [LangGraph / LangMem](https://github.com/langchain-ai/langmem) | 自建逻辑和存储组合 | [LangMem 参考](../../references/projects/langmem.md) |
| 开源/托管 | [Cognee](https://github.com/topoteretes/cognee)、[Supermemory](https://github.com/supermemoryai/supermemory)、[MemOS](https://github.com/MemTensor/MemOS)、[Hindsight](https://github.com/vectorize-io/hindsight) | 图/向量语义层、一体化 API、Memory OS、分层记忆 | — |
| 大型云 | [Google Vertex AI Memory Bank](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/agent-engine/memory-bank/set-up)、[Microsoft Foundry Memory Store](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/memory-usage)、[OpenAI Agents SDK Sessions](https://openai.github.io/openai-agents-python/sessions/) | 托管记忆或会话能力 | 功能、preview/GA 与 SLA 均须重查 |
| 国内平台 | [腾讯云 Agent Memory](https://cloud.tencent.com/product/agm)、[阿里云百炼](https://help.aliyun.com/zh/model-studio/memory-library)、[火山引擎](https://www.volcengine.com/docs/84313/1817506)、[百度千帆](https://cloud.baidu.com/doc/qianfan/s/Wmh4sttcr)、[智谱](https://docs.bigmodel.cn/cn/guide/platform/intelligent-agent)、[MemTensor](https://github.com/MemTensor/MemOS)、[ByteDance Seed](https://github.com/ByteDance-Seed/m3-agent) | 团队/平台/多模态等不同侧重点 | 采购与集成前须按产品重新核验 |

### 来源快照中的选择矩阵

| 需求 | 原资料的优先考察对象 |
| -- | -- |
| 为既有 Agent 快速添加长期记忆 | Mem0 OSS / Platform |
| 强时序、变化事实与关系推理 | Zep Cloud / Graphiti |
| Agent 长期存在并主动管理状态 | Letta |
| 已使用 LangGraph 且要求自控 | LangGraph Store + LangMem + 自选存储 |
| 私有图+向量部署 | Cognee 或 Graphiti |
| 一体化 memory/RAG/profile API | Supermemory |
| 研究多类型记忆 | MemOS / Hindsight |
| 深度绑定公有云 | 对应云平台记忆服务 |

## Inference

- 由写入、版本、检索和删除的资料可推得：记忆系统的关键风险不在于单一向量检索，而在于证据、时间、权限和生命周期是否能共同约束记忆。
- 由评测范围可推得：只报告检索或问答分数，不足以证明记忆能改善长期 Agent 行动；行动收益应与固定环境、verifier 和任务历史一起评估。
- 由理论和产品快照可推得：图、巩固、反思与 Memory OS 值得作为研究主题，但不应因名称或厂商自报而视为生产成熟。
- 由多个团队/平台案例可推得：多 Agent 共享的主要难题是 scope、ACL、并发更新、责任和回滚，而不是增加共享向量库。

## Recommendation

源资料提出的路线可作为后续设计讨论的输入，而非当前实施承诺：

1. **可靠 baseline**：append-only 事件、事实/事件/偏好/程序/意图分类、BM25 + vector 检索、时间与 scope 过滤、provenance、编辑/版本/删除/审计。
2. **组织与行动**：实体对齐、冲突检测、双时态、异步 consolidation、graph/path retrieval，以及对 retrieval、answer、action improvement 的拆分评测。
3. **长期自治**：多 Agent 权限、前瞻记忆、多模态情景记忆、参数/激活/外部记忆协同，以及投毒、删除残留和负迁移红队测试。

企业设计采用这些机制前，应先与 [负责人原则](../../foundations/owner-principles.md) 的身份、项目披露、记忆价值和 MCP 约束核对。

## 局限与待验证项

- 本文没有重新访问论文、产品页、GitHub、AML 或 Zotero；所有动态信息按 2026-08-20 Snapshot 理解。
- 不能横向比较厂商自报 benchmark：模型、数据、检索预算和 judge 可能不同。
- 目录中的 `stars`、release、preview/GA、SLA、榜单、代码可用性及平台功能均需以新的带日期 Snapshot 更新。
- 本文不保存或证明 Zotero 附件、PDF、子笔记和标签；这些状态待未来通过 MCP 回读验证。
