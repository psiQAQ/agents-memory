# Zotero Agent Memory 文献与项目目录（2026-08-20 Snapshot）

**状态：Snapshot**
**迁入日期：2026-09-02**
**原始快照日期：2026-08-20**

## 元数据

| 字段 | 内容 |
| -- | -- |
| 问题与范围 | 保存文献、项目、基准与 Zotero 标识的调研目录；不连接或修改 Zotero。 |
| 原始来源 | Windows 本机工作区 `/run/media/psi/新加卷/workspace/agent-memory-research/CATALOG.md`。 |
| 版本边界 | 无 commit、无 remote 的源工作区当前文本；GitHub stars 为源资料所记的 2026-08-20 快照。 |
| 关联材料 | [产业综述](../reports/2026-08-20-agent-memory-literature-and-industry-survey.md)、[Zotero 工作规则](../../foundations/zotero-research-workflow.md)、[项目参考](../../references/projects/README.md)。 |

## Fact

### 集合与状态词

| 集合 | Zotero key | 源工作区说明 |
| -- | -- | -- |
| `Agent Memory｜核心文献（2026-08-20）` | `5K2XWLLC` | 父集合 |
| `07｜开源项目与实现` | `2TVMEB44` | 开源项目子集合 |
| `08｜传统记忆与跨领域基础` | `LLU775MH` | 基础理论子集合 |

源资料中的状态词含义为：`zotero` 表示仅管理论文/项目元数据和 PDF；`catalog-only` 表示只登记 GitHub URL；`submodule` 表示源仓库曾对项目进行深入源码研究并固定本地 commit。本仓库不采用 `submodule` 作为当前状态，相关源码只允许在外部仓库研究。

### 论文与官方代码

| 文献/基准 | Zotero key | GitHub | Stars（2026-08-20） | 源工作区状态 |
| --- | --- | --- | ---: | --- |
| Generative Agents | `MHHMUYNT` | [joonspk-research/generative_agents](https://github.com/joonspk-research/generative_agents) | 21,959 | catalog-only |
| Reflexion | `JMYM4QQF` | [noahshinn/reflexion](https://github.com/noahshinn/reflexion) | 3,235 | catalog-only |
| MemoryBank | `WHYLS9J4` | [zhongwanjun/MemoryBank-SiliconFriend](https://github.com/zhongwanjun/MemoryBank-SiliconFriend) | 445 | catalog-only |
| MemGPT / Letta | `L8PULKIE` | [letta-ai/letta](https://github.com/letta-ai/letta) | 24,308 | catalog-only；见 [Letta 参考](../../references/projects/letta.md) |
| A-MEM | `8EB8WAC5` | [agiresearch/A-mem](https://github.com/agiresearch/A-mem) / [WujiangXu/A-mem](https://github.com/WujiangXu/A-mem) | 1,151 / 944 | catalog-only |
| LLM Agent Memory Survey | `RE7DID2I` | [nuster1128/LLM_Agent_Memory_Survey](https://github.com/nuster1128/LLM_Agent_Memory_Survey) | 508 | catalog-only |
| Memory in the Age of AI Agents | `KPHFRX9L` | [Shichun-Liu/Agent-Memory-Paper-List](https://github.com/Shichun-Liu/Agent-Memory-Paper-List) | 2,324 | catalog-only |
| LoCoMo | `TILRIX6J` | [snap-research/locomo](https://github.com/snap-research/locomo) | 1,112 | catalog-only |
| LongMemEval | `SNE7RLEY` | [xiaowu0162/LongMemEval](https://github.com/xiaowu0162/LongMemEval) | 1,013 | catalog-only |
| Mem0 | `TDN3TXIX` | [mem0ai/mem0](https://github.com/mem0ai/mem0) | 63,623 | catalog-only；见 [Mem0 参考](../../references/projects/mem0.md) |
| BEAM | `2MLQBPH9` | [mohammadtavakoli78/BEAM](https://github.com/mohammadtavakoli78/BEAM) | 123 | catalog-only |
| PersonaMem | `ZDC84HS9` | [bowen-upenn/PersonaMem](https://github.com/bowen-upenn/PersonaMem) | 189 | catalog-only |
| PersonaMem-v2 | `Y4IMPDZI` | [bowen-upenn/PersonaMem-v2](https://github.com/bowen-upenn/PersonaMem-v2) | 39 | catalog-only |
| CL-bench | `RSYLMD5F` | [Tencent-Hunyuan/CL-bench](https://github.com/Tencent-Hunyuan/CL-bench) | 576 | catalog-only |
| CL-bench Life | `Z84GLZH6` | [Tencent-Hunyuan/CL-bench](https://github.com/Tencent-Hunyuan/CL-bench) | 576 | catalog-only |
| Continual Learning Bench | `UVYCF4ZD` | [pgasawa/continual-learning-bench](https://github.com/pgasawa/continual-learning-bench) | 202 | catalog-only |

### 未绑定正式论文的项目案例

源资料以 stars ≥100 作为社区影响力案例的收录门槛；“未绑定”只表示该目录当时未关联论文，不断言项目没有技术报告。

| 项目 | Zotero key | GitHub | Stars（2026-08-20） | 源资料收录理由 | 关联参考 |
| --- | --- | --- | ---: | --- | --- |
| Cognee | `XB43E3C3` | [topoteretes/cognee](https://github.com/topoteretes/cognee) | 30,132 | 图结构持久记忆平台 | — |
| Graphiti | `P3KP4IWA` | [getzep/graphiti](https://github.com/getzep/graphiti) | 30,106 | 双时态/实时知识图谱 | [Graphiti](../../references/projects/graphiti.md) |
| Supermemory | `PFNKSY6W` | [supermemoryai/supermemory](https://github.com/supermemoryai/supermemory) | 28,966 | Memory API 与 context engine | — |
| LangMem | `KS77DQV8` | [langchain-ai/langmem](https://github.com/langchain-ai/langmem) | 1,619 | Agent 长期记忆 SDK | [LangMem](../../references/projects/langmem.md) |

### Benchmark 与评测项目

| 项目 | Zotero key | GitHub | Stars（2026-08-20） | 源工作区状态 |
| --- | --- | --- | ---: | --- |
| Agent Memory Leaderboard | `IYK2BKBF` | [AML-memory/agent-memory-leaderboard](https://github.com/AML-memory/agent-memory-leaderboard) | 794 | 源仓库 submodule @ `5761ed58502d24153115cbdc010e44957cb18c3a`；本仓库仅保留目录记录 |
| ScriptMem | `F6E25EJ7` | [memorax-ai/ScriptMem](https://github.com/memorax-ai/ScriptMem) | 89 | catalog-only；benchmark 例外 |

### 本轮综述新增文献

| 文献 | Zotero key | 主题 | GitHub/代码 |
| --- | --- | --- | --- |
| Cognitive Architectures for Language Agents | `5JRXLQ4E` | 认知架构与记忆分类 | [ysymyth/awesome-language-agents](https://github.com/ysymyth/awesome-language-agents) |
| HippoRAG | `QH9DC42R` | 海马索引、图与多跳检索 | [OSU-NLP-Group/HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG) |
| ExpeL | `2JCUX8P9` | 经验学习 | [Andrewzh112/ExpeL](https://github.com/Andrewzh112/ExpeL) |
| Agent Workflow Memory | `W5CHF5I7` | 程序性/工作流记忆 | [zorazrw/agent-workflow-memory](https://github.com/zorazrw/agent-workflow-memory) |
| Voyager | `AIB68DXH` | 具身技能库 | [MineDojo/Voyager](https://github.com/MineDojo/Voyager) |
| M3-Agent / M3-Bench | `XP3PFQ5M` | 多模态长期记忆 | [ByteDance-Seed/m3-agent](https://github.com/ByteDance-Seed/m3-agent) |
| MemOS | `2S83UE4L` | Memory OS、多类型记忆 | [MemTensor/MemOS](https://github.com/MemTensor/MemOS) |
| EverMemOS | `7GG8FS7B` | 自组织巩固与重构检索 | [EverMind-AI/EverOS](https://github.com/EverMind-AI/EverOS) |
| Working Memory | `8WTASXV7` | 工作记忆基础 | — |
| Encoding Specificity | `S6T8JL7U` | 编码与检索线索 | — |
| Complementary Learning Systems | `CMECJ7VP` | 快速记录与慢速巩固 | — |
| MemoryAgentBench | `DYDIEGSI` | 生命周期与选择性遗忘 | [HUST-AI-HYZ/MemoryAgentBench](https://github.com/HUST-AI-HYZ/MemoryAgentBench) |
| MemoryArena | `97KDIBG3` | 行动耦合经验记忆 | [ZexueHe/MemoryArena](https://github.com/ZexueHe/MemoryArena) |
| ReasoningBank | `ZZ7CR8Q4` | 自进化推理记忆 | [google-research/reasoning-bank](https://github.com/google-research/reasoning-bank) |
| EMemBench | `FMLVIVAD` | VLM 情景记忆评测 | [InternLM/EMemBench](https://github.com/InternLM/EMemBench) |
| MemSecBench | `K8DPVR92` | 记忆投毒与修复 | 源资料当时未发现作者公开代码 |
| Hindsight | `W3T2L7YJ` | 事实/经历/观察/意见分层 | [vectorize-io/hindsight](https://github.com/vectorize-io/hindsight) |

## Inference

- Zotero key 可以作为未来回读、去重和集合归属核验的稳定定位符，但不应单独视为附件、标签或条目内容已经存在的证据。
- `stars` 适合记录当时的社区关注度，不能代表论文质量、产品成熟度或评测表现。
- 已有项目参考页和本目录互补：前者记录特定版本的架构分析，后者保存文献与项目发现线索；两者都需要独立更新。

## Recommendation

- 后续在配置于仓库外的 Zotero MCP 中，先以 DOI、arXiv ID、标题和 GitHub URL 去重，再核验 collection、item key、附件、标签和“代码与数据”子笔记。
- 更新时创建新的带日期 catalog Snapshot，不覆盖本页的 2026-08-20 记录。
- 候选项目先保留为 catalog 条目；需要深入源码分析时，在外部源码仓库检查，并以项目参考 Snapshot 记录结论，不添加 submodule。

## 局限与待验证项

- 本仓库没有连接 Zotero，因此不能验证源资料声称的“17 条已获取 PDF”“已创建子笔记”或 `has-github` 标签。
- GitHub URL、stars、默认分支、许可证、release、维护状态和项目名称均可能变化。
- AML 的 `5761ed...` 是源仓库曾登记的 gitlink，不是本仓库持有或验证的源码版本。
