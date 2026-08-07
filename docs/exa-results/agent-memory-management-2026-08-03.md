# AI 智能体记忆管理调研报告

> 调研日期:2026-08-03 | 方法:Exa 深度检索,5 个平行子代理,共审阅 256 个来源
> 目标:为公司各项目组建立高效的记忆收集、共享与调用体系提供依据

---

## 一、主流产品的记忆机制对比

| 维度 | ChatGPT | Claude Code | Cursor | Windsurf | GitHub Copilot |
|------|---------|-------------|--------|----------|----------------|
| 自动 vs 显式 | 混合(自动提取+显式"记住") | 混合(CLAUDE.md + auto memory) | 纯显式(Memories 已于 2025 移除,只剩 Rules) | 混合(auto memories + rules) | 纯自动(`store_memory` 工具) |
| 存储层级 | 用户全局 | Project / User / Org | Project / User / Team | Workspace / Global | Repo / User |
| 过期机制 | 无 | 无 | 无 | 无(推断) | **28 天未用自动删除**(验证成功可重置) |
| 验证机制 | 无 | 无 | 无 | 无 | **实时 citations 验证**(记忆与代码矛盾时自动存储更正版) |

关键细节:

- **ChatGPT Memory**:Saved memories(用户显式要求)+ Chat history insights(自动提取偏好与模式);更新时提示 "Memory updated";可在 Temporary Chat 中禁用。官方未公开"什么值得记"的标准。
  https://openai.com/index/memory-and-new-controls-for-chatgpt/
- **Claude Code**:CLAUDE.md(手写、版本控制、Project/User/Org 三级)+ Auto memory(自动记录用户纠正、构建命令、调试洞察;加载前 200 行/25KB;按 repo 存储、跨 worktree 共享)。
  https://code.claude.com/docs/en/memory
- **Cursor**:自动 Memories 因记忆污染、跨项目泄露等问题在 v2.1 被移除,转向 `.cursor/rules/*.mdc`(四种应用模式:Always / glob 自动附加 / Agent 按需 / 手动 @);官方建议单文件 ≤500 行。
  https://cursor.com/docs/rules.md
- **Windsurf**:auto-generated memories(不消耗 credits)+ `.windsurf/rules/*.md`;工作区隔离。
  https://docs.devin.ai/windsurf/plugins/cascade/memories
- **GitHub Copilot Memory(2026-01,最值得借鉴)**:每条记忆带**代码行号 citations**;读取时即时验证(just-in-time verification),代码与记忆矛盾则自动更正;28 天未用自动过期;repo 权限即记忆权限(写权限者可创建,读权限者可使用);跨 agent 共享(code review agent 学到的东西 coding agent 可继承)。
  https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/

---

## 二、开源记忆框架架构

### 提取决策机制对比

| 框架 | 提取方式 | 冲突处理 | 历史保留 | 存储 |
|------|---------|---------|---------|------|
| **Mem0** | LLM 单遍提取事实 | ADD/UPDATE/DELETE/NOOP;v3 改 ADD-only | 完整事件日志 | 向量 + 图 + SQL 三层 |
| **Zep/Graphiti** | LLM 提取三元组(增量) | **边失效不删除**(4 时间戳:valid/invalid/created/expired) | 完整(双时间模型) | 时间知识图(Neo4j 等) |
| **Letta/MemGPT** | 无自动提取,**agent 用工具自主决定** | agent 决策 | Git 版本控制记忆块 | Core(RAM)/Recall(SSD)/Archival(Disk) 三层 |
| **LangMem** | 热路径工具 + 后台"潜意识"整合 | 管理器决策(新增/更新/删除) | 可选整合 | LangGraph BaseStore 命名空间 |
| **A-Mem** | Zettelkasten 式笔记 + LLM 链接生成 | 记忆演进(新记忆触发旧记忆更新) | 连续精细化 | ChromaDB |
| **Cognee** | 六阶段管道(分块→实体三元组→摘要→嵌入) | 本体模糊匹配验证 | memify 修剪/强化 | 图 + 向量 + 关系三层 |
| **MemOS** | 多模态插件、异步摄入 | MemScheduler 生命周期管理 | 激活/参数/纯文本三态 | 统一 API 图结构 |

要点:

- **Mem0**:检索为四信号融合(语义 + BM25 + 实体 + 时间意图);作用域四维 user_id / agent_id / app_id / run_id。https://docs.mem0.ai/core-concepts/how-it-works
- **Zep/Graphiti**:三层子图(情节→语义实体→社区);检索 = cosine + BM25 + 图 BFS,RRF/MMR/交叉编码器重排;新旧事实冲突时旧边标 `invalid_at` 而非删除——**这是"记忆更新"最严谨的方案**。https://arxiv.org/html/2501.13956
- **Letta**:记忆块有字符上限,逼迫 agent 战略取舍;多 agent 通过**共享记忆块**协作(读写标志控制);记忆块存为文件、Git 提交追踪。https://docs.letta.com/guides/core-concepts/memory/memory-blocks/index.md
- **LangMem**:显式区分三种记忆——语义(事实)/情节(经验、few-shot 示例)/程序(行为规则、提示优化);命名空间 (user_id) / (team_id) / (project_id) / (global) 天然支持团队隔离与共享。https://langchain-ai.github.io/langmem/

---

## 三、记忆价值如何衡量

### 1. 重要性评分(写入侧)
- **Stanford Generative Agents**:检索分 = recency(指数衰减)× relevance(语义相似)× importance(LLM 给事件打 1-10 分)。这是几乎所有后续系统的原型。https://doi.org/10.1145/3586183.3606763
- 进阶:Chen & Cheng (2026) 提出**可学习的多因子价值模型**——权重由下游任务表现学出,同一标量同时驱动编码、遗忘、检索。https://doi.org/10.48550/arxiv.2606.12945

### 2. 衰减与遗忘
- MemoryBank:Ebbinghaus 遗忘曲线,使用即强化;
- Copilot:28 天 TTL + 验证重置;
- MemClaw 等:指数新近度衰减(半衰期 38 天)+ "新事实胜出" + 过时抑制;
- 研究共识:**选择性遗忘是当前所有系统的短板**(MemoryAgentBench、EvolMem)。

### 3. 基准测试
| 基准 | 规模 | 测什么 |
|------|------|--------|
| **LOCOMO** (2024) | 10 对话×300-600 轮 | 单跳/多跳/时间/常识/对抗 QA |
| **LongMemEval** (2024) | 500 题,~115k-1.5M tokens | 信息提取、多会话推理、**时间推理**、**知识更新**、**弃权** |
| **LongMemEval-V2** (2026) | 451 题,Web agent | 状态回忆/跟踪、工作流知识、环境陷阱 |
| **ConvoMem** (2025) | 75,336 QA 对 | 统计显著的大规模评测 |
| **MemBench** | — | 效能/效率/容量(退化曲线)三维 |

### 4. 关键(反直觉)发现
- **ConvoMem 转折点**:0-30 段对话,全量上下文最优(70-82% vs Mem0 等复杂系统仅 30-45%);30-150 段混合;150+ 段才需要 RAG/记忆架构。**记忆系统不是从第一天就需要的**。
- **独立评测与厂商自报差异巨大**(Wolff & Bennati 2026):Mem0 自报 66.9% / 独立测 81.1%;Zep 自报 Graphiti 75.1% / 独立测 56.0%。厂商基准要打折看。http://arxiv.org/abs/2601.07978
- LoCoMo 曾有一个算术错误使头条分数虚高 25.56 个百分点;**最可信的数字来自不卖记忆系统的人**。
- 成本:LLM-on-Write 架构(每条消息跑提取 LLM)比长上下文基线贵 14-77 倍,准确率可能反而低 31-33%(fastpaca 基准)。https://fastpaca.com/blog/memory-isnt-one-thing/
- Letta 团队实验:**纯文本文件 + grep 迭代搜索**在 LoCoMo 上击败 Mem0(74.0% vs 68.5%)——模型对文件系统操作经过后训练,极其擅长。

---

## 四、从日常对话中自动留存有价值记忆的机制

实践中收敛出的管道模式:

1. **触发时机**
   - 热路径:agent 在对话中主动调用记忆工具(Letta、LangMem manage_memory);
   - 后台异步:对话结束后由独立 LLM pass 提取(LangMem background、Mem0、MemOS MemScheduler)——**不阻塞主对话、可批处理、成本可控,是团队场景推荐做法**;
   - 信号驱动:用户纠正、重复出现的建议、明确的"记住"指令(Claude auto memory 的标准:"user corrections and preferences")。

2. **值得记什么(路由规则,AugmentCode 框架)**
   - "能从代码/文档直接读出来吗?" → 不存(避免冗余);
   - "是团队范围的稳定约定?" → 进版本控制的上下文文件(AGENTS.md / CLAUDE.md);
   - "数周内保持稳定的事实/偏好?" → 进记忆库;
   - "正在快速变化?" → 进活文档/规格,不进记忆;
   - Rohit Raj 经验法则:"30 天后还重要吗?" → 是则持久化。

3. **写入时治理**
   - 提取 → 与既有记忆比对 → ADD / UPDATE / INVALIDATE(标过时而非删)/ NOOP;
   - 异步矛盾检测器(MemClaw):写入后后台比对同实体新旧值,旧事实标 stale;
   - 记 provenance(来源对话、时间戳、提取方法),Copilot 甚至带代码行 citations。

4. **读取时验证**
   - Copilot 的 just-in-time verification:用前检查 citations 是否仍与代码一致,不一致则自动更正——防止记忆污染的最有效手段之一。

---

## 五、团队/项目级记忆的共享与更新

### 模式一:版本控制的记忆文件(最轻量,编码团队首选)
- `AGENTS.md`(开放标准,OpenAI/Cursor/Google 支持)、`CLAUDE.md` + `.claude/rules/*.md`、`.cursor/rules/*.mdc`、`.github/copilot-instructions.md`;
- 天然获得 Git 的一切:PR 评审即记忆治理、blame 即溯源、revert 即回滚;
- 支持嵌套(monorepo 每包一个,就近优先)、个人覆盖(CLAUDE.local.md 不入库);
- 局限:纯手动策展,无自动提取、无语义检索、文件过长挤占上下文(建议 ≤500 行)。
- https://agents.md/

### 模式二:记忆平台的组织/项目作用域
- **Mem0**:org → project → user/agent/app/run 多级作用域,项目 API key 自动解析归属;
- **Zep**:用户图(个人)vs 群组图 group_id(团队共享:产品目录、政策);企业版 Context Lake 提供 ABAC、多租户隔离、<200ms 检索;群组记忆需显式 graph.search 调用;
- **LangMem**:命名空间 (memories, user_id) / (team_id) / (project_id) / (global),自建方案里最容易照抄的作用域设计;
- **Letta**:多 agent 共享记忆块,读写标志控制。

### 模式三:多 agent 共享记忆架构(研究前沿)
- 黑板模式:共享工作区,append-only / last-write-wins / version-vector 解冲突;
- G-Memory(arXiv:2506.07398):Insight 图(可泛化见解)→ Query 图 → Interaction 图三层,多 agent 框架性能提升最高 20.9%;
- 记忆池 + LLM 质量门控(arXiv:2404.09982):Prompt-Answer 对经质量评审后进入共享池。

### 模式四:企业知识库 + 记忆混合(Atlan 五层模型)
- In-process → 向量库 → 分层记忆 → 图+向量混合 → **企业上下文层**(治理元数据图:规范指标定义、本体、权限、血统、决策记忆);
- 区分"组织记忆"(接入受治理的数据目录)与"agent 经验记忆"(从交互提取),不要混在一个库里。

### 共享记忆的更新与治理
- **冲突解决**:乐观并发 + 时间元数据定胜负(Graphiti 式,新事实胜出、旧边失效)是最佳实践;
- **权限**:在存储层强制(行级安全、内容级过滤),不要只在 agent 层——agent 可被注入;GitHub 权限镜像(repo 权限同步为记忆读写权限)是现成好模型;
- **溯源**:每条记忆记 provenance 链(源、时间、提取方式),从第一天启用;
- **人工兜底**:知识 owner 定期评审写入、清理过期、裁决冲突;
- **风险**:记忆污染→输出腐败;权限失守→合规问题(GDPR 等);无审计→决策不可辩护。

---

## 六、面向"公司项目组记忆体系"的落地建议

**分阶段架构(按 ConvoMem 转折点与从业者共识):**

**第一阶段(立即可做,零基础设施)——版本控制记忆文件**
- 每个项目 repo:`CLAUDE.md` / `AGENTS.md`(团队约定、构建命令、架构决策)+ `.claude/rules/` 主题规则;
- 治理 = PR 评审;个人偏好放个人级文件不入库;
- 约定"值得记"路由:代码能读出的不记、团队级稳定约定进文件、快速变化的进活文档。

**第二阶段——自动提炼管道(后台异步,不阻塞)**
- 每日/每周从对话日志跑一次提取 LLM(参考 LangMem background / Mem0 管道):抽取用户纠正、重复问题、新约定;
- 产出以 **PR 形式提交到记忆文件**(人审后合入)——把"自动提取"与"Git 治理"嫁接,规避自动记忆污染(Cursor 移除 Memories 的教训);
- 给每条记忆加 provenance(哪次对话、日期)与 TTL/复核日期。

**第三阶段(规模化后才做)——记忆平台**
- 触发条件(Hamza Shabbir 三问):需要多会话个性化?需要跨 agent 共享状态?需要自动冲突解决?至少一项为"是"才上平台;
- 选型:重时间推理/审计 → Zep(Graphiti,自托管需 Neo4j);托管省事 → Mem0;自建 → LangMem 命名空间 + Postgres/pgvector;
- 作用域照 LangMem:(project_id) 项目共享、(user_id) 个人、(global) 公司级;权限镜像 Git/AD 权限;
- 必备治理件:异步矛盾检测、时间失效(不删除)、使用型 TTL(28 天参考 Copilot)、读取时验证。

**度量记忆价值(运营指标):**
- 命中率(注入的记忆被回答实际使用的比例)、纠正率下降(同类错误是否复发)、token 成本节省、时间推理/知识更新类问题的准确率(用 LongMemEval 的五能力做内部抽测)。

---

## 附:主要来源索引

- Copilot 记忆系统:https://github.blog/ai-and-ml/github-copilot/building-an-agentic-memory-system-for-github-copilot/
- Claude Code memory:https://code.claude.com/docs/en/memory
- Mem0:https://docs.mem0.ai/core-concepts/how-it-works | https://arxiv.org/html/2504.19413v1
- Zep/Graphiti:https://arxiv.org/html/2501.13956 | https://github.com/getzep/graphiti
- Letta:https://www.letta.com/blog/agent-memory/
- LangMem:https://langchain-ai.github.io/langmem/
- Generative Agents:https://doi.org/10.1145/3586183.3606763
- LongMemEval:https://doi.org/10.48550/arxiv.2410.10813 | ConvoMem:https://doi.org/10.48550/arxiv.2511.10523
- 独立成本/准确率评测:http://arxiv.org/abs/2601.07978 | https://fastpaca.com/blog/memory-isnt-one-thing/
- 文件+grep 实验:https://pub.towardsai.net/mem0-vs-zep-vs-letta-a-folder-of-text-files-shouldnt-beat-the-61k-star-memory-layer-9d7e65c5799c
- AGENTS.md 标准:https://agents.md/
- 企业记忆架构:https://atlan.com/know/agent-memory-architectures/
- 记忆污染案例:https://memclaw.net/use-cases/stale-memory-long-running-fleets/
- G-Memory:https://arxiv.org/abs/2506.07398
