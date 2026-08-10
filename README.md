# refine-memory：企业智能体记忆管理调研与实验

## 项目背景

本仓库用于调研和验证企业智能体记忆方案，目标是：**在公司内为每个项目组建立一套 AI 智能体记忆的高效收集、共享与调用体系**。根仓库保存调研、设计与实验记录；`submodules/TencentDB-Agent-Memory` 指向个人 fork，作为复现、兼容性修复和后续 PR 的源码工作区。

仓库负责人的方案基本思想记录在 `docs/repo-author-comment/comment.md`,以较高优先级作为本仓库后续工作的参考:记忆按身份颗粒度管理、按项目上下游披露程度交流、价值由 AI 初步生成而查询人决定颗粒程度、以 MCP 方式经身份登录与项目认证跨级调取。

## 交互记录

- **v1(2026-08-03)**:「调研一下目前不同智能体在记忆管理方面有哪些尝试……记忆的价值是如何衡量的,提取的方式是什么,如何在每日对话中让有价值的记忆进行自动留存……团队或者项目级别的记忆如何进行共享和更新的?我的目的是在公司中能让每个项目组有一个记忆的高效收集和共享调用。」
  → 产出 Exa 主调研报告(5 子代理,256 来源):`docs/exa-results/agent-memory-management-2026-08-03.md`
- **v1.5(外部输入)**:引入 GPT 独立报告与评审(`docs/GPT/`、`docs/exa-results/GPT-review.md`)、微信分享文分析(`docs/kaer-AI-wozi/wxshare.md`)、负责人方案思想(`docs/repo-author-comment/comment.md`)。
- **v2(2026-08-06)**:「调用firecrawl,再调研一次,并重新检查本仓库状态,调研结果放入合理位置。创建根目录README.md。提交一次。」(后追加:参考仓库以 submodule 收录至根目录 submodules/;根目录创建 CLAUDE.md)
  → 产出 Firecrawl 补充调研(3 子代理,71 来源,针对权限/MCP/防火墙/PR 流程缺口):`docs/firecrawl-results/agent-memory-supplement-2026-08-06.md`;创建本 README 与 CLAUDE.md;形成首次提交所需的调研基线。
- **v3(2026-08-06)**:「开始设计一款适合企业开发项目的记忆管理方案,例如 IC 部门的多人合作开发……可以不绑定在某一个agent框架上……不同agent之间也可达到记忆的个性化共享。可形成一份完整文档,并推荐使用mermaid流程图进行展示。另外加上git在这个流程中的作用……尽量做到无感使用,在调用MCP时就能做到记忆方案。」
  → 产出设计文档:`docs/design/2026-08-06-enterprise-memory-design.md`(自建 Memory Gateway MCP + Git 双层架构,含 5 幅 mermaid 图、身份披露矩阵、无感读写路径、四阶段落地路线;v0.1 待负责人评审)。
- **v4(2026-08-06)**:「MCP的连接是可以通过设置环境变量的方式来登陆不同项目,而不用在使用agent时进行登陆要求。」
  → 设计文档升至 v0.2:身份链路改为环境变量预置凭证(MEMORY_TOKEN + MEMORY_PROJECT_ID 随项目工作区配置,使用 agent 时零登录,多项目并行自动定位),交互式 OAuth 降为备选通道,权限校验仍全部在服务端。
- **v5(2026-08-06)**:「设计一个系统,每个人的项目有唯一的环境变量登陆账户密码,每个人登陆上这个系统或者网页平台,在项目管理人员或者开发人员建立项目,自动为不同人员配置一些既定角色,每个角色可用提示词或者既有了解范围来建立知识库范畴(方案可参考,你可以给一个更适合落地的想法)。」
  → 设计文档升至 v0.3:新增第 11 节管理平面——薄控制台 + Git 平台为事实源(不建第二套账号体系);项目创建向导自动实例化角色并签发 (user, project, role) 三元组唯一令牌;"提示词定义范畴"修正为"提示词作输入、AI 编译为结构化 filter、PM 确认生效",权限执行一律走结构化配置。
- **v6(2026-08-06)**:「comment.md 再次阅读规则,整理文档基本思想,去除重复描述,增加可读性(调用 humanizer-zh),按思想不同方向展开;完成后根据 comment.md 更新最新 design 方案。」
  → 重整 `docs/repo-author-comment/comment.md`:去重后归纳为五个方向(身份/项目/价值/接入/落地形态),去除 AI 腔,思想内容不变。设计文档升至 v0.4:新增 §3.1 落地形态(知识库以 git submodule 挂在项目仓库,本地 agent 按身份生成披露文档并维护,远端网关同步分发),§4.3 知识库结构改为按披露等级分层(source/ + disclosure/{public,interface,internal,private})。
- **v7(2026-08-07)**:逐项确认设计文档第 12 节五个开放问题。
  → 设计升至 v0.5:五项决策(单个 IC 项目试点 / 跨级调取由 project owner 单人批准 / 离职时有价值个人记忆转项目保留 / 网关部署部门自管服务器+对接 AD/LDAP / 非代码资产用通用 asset 引用类型)落入 §4.2/§5.1/§5.2/§9/§10,第 12 节转为「已确认的关键决策」;纳入 comment 第 7 条(兼容多 agent + agent 不可用时人工手动维护兜底)。
- **v8(2026-08-07)**:「以 TencentDB 为模板写一份改造计划书,按各阶段适合 PR 的进度推进;参考 comment 建议,已有更好方案或不宜大改的不动但记录,汲取其他方案亮点;调用 superpowers 写入建议目录。」
  → 用 superpowers:writing-plans 产出 `docs/superpowers/plans/2026-08-07-tencentdb-memory-retrofit.md`(10 个 PR、5 个 Phase)。该计划早于当前 `fe3230f` 源码快照，目录和命令需要在复现后重新校准，不能直接执行。
- **v9(2026-08-07)**:「首先复现腾讯的方案，解决 Claude Code 的适配性问题；其次在本机 Windows Codex、Windows Claude Code 和 WSL Claude Code 三个智能体上搭建和管理记忆共享平台。」
  → 首次提交改为可开发基线：TencentDB submodule 指向 `psiQAQ/TencentDB-Agent-Memory` fork；执行顺序收敛为“原样复现 → 最小兼容性修复 → 三智能体共享验证”。

## 仓库结构与阅读顺序

```text
refine-memory/
├── README.md                      # 本文件:项目背景与导航
├── CLAUDE.md                      # 供 Claude Code 使用的仓库指引
├── submodules/
│   └── TencentDB-Agent-Memory/    # 个人 fork 的可开发 git submodule
└── docs/
    ├── repo-author-comment/
    │   └── comment.md             # ① 负责人方案思想(高优先级,先读)
    ├── design/
    │   └── 2026-08-06-enterprise-memory-design.md  # ⑦ 企业记忆管理方案设计(v0.5)
    ├── superpowers/plans/          # ⑨ 实施计划书
    │   └── 2026-08-07-tencentdb-memory-retrofit.md # 以 TencentDB 为模板的改造计划(10 PR / 5 Phase)
    ├── reference/                  # ⑧ 8 个参考项目的架构分析(亮点/缺点/可参考点 + mermaid)
    │   ├── mem0.md          graphiti.md   letta.md      langmem.md
    │   └── claude-mem.md    basic-memory.md  tencentdb-agent-memory.md  memrl.md
    ├── exa-results/
    │   ├── agent-memory-management-2026-08-03.md   # ② Exa 主调研报告
    │   └── GPT-review.md          # ③ GPT 对主报告的评审(四层模型/生命周期/Firewall)
    ├── firecrawl-results/
    │   └── agent-memory-supplement-2026-08-06.md   # ④ Firecrawl 补充调研(权限/MCP/治理)
    ├── GPT/
    │   └── GPT-report.md          # ⑤ GPT 独立报告(价值三阶段公式/代表项目对比)
    └── kaer-AI-wozi/
        └── wxshare.md             # ⑥ 微信分享文:claude-mem+Mem0 跨机器方案及评审
```

## 调研核心结论

1. **分阶段路线**:Git 管理的显式项目记忆(CLAUDE.md/AGENTS.md + PR 评审)→ 后台异步自动提炼(以 PR 形式合入,人审兜底)→ 规模化后才引入记忆平台(Zep/Mem0/自建)。前 150 段对话内全量上下文即可胜过复杂记忆系统(ConvoMem),记忆架构不必第一天就上。
2. **记忆价值分三阶段衡量**:写入前(未来有用性/杠杆/新颖性/可信度加权评分)、调用时(相关性+时效+权威性排序)、使用后(以任务成败反馈更新记忆效用,MemRL Q-value 范式)。
3. **写入治理重于提取能力**:需要 Memory Firewall(重要性过滤+冲突检测+权限检查)、"标失效不删除"(Graphiti 双时间戳)、来源追溯(provenance)与生命周期(候选→验证→生效→衰减→归档)。
4. **团队共享的权限底座**:MCP OAuth 2.1 + Enterprise-Managed Authorization 已可作为身份底座;ACL 必须在向量检索前过滤;"团队共享+按角色分级披露"的企业级开源方案尚为空白,是自研补位点。

## 参考项目

`docs/reference/` 保存 8 个开源项目的架构分析，`.gitmodules` 保留它们的仓库地址。当前只有需要实际复现和改造的 TencentDB Agent Memory 登记为 gitlink；其余项目不下载源码。

| 仓库 | 参考价值 | 最值得借鉴的可参考点 | 分析文档 |
|------|---------|---------------------|---------|
| [mem0](https://github.com/mem0ai/mem0) | 事实提取管道、memory-triage 分诊、OpenMemory MCP | 作用域字段禁改+检索强制带 filter;混合打分归一化 | [mem0.md](docs/reference/mem0.md) |
| [graphiti](https://github.com/getzep/graphiti) | 时序知识图谱、边失效 | 双时间戳"失效不删除"字段语义;SearchFilters 编译为查询下推 | [graphiti.md](docs/reference/graphiti.md) |
| [letta](https://github.com/letta-ai/letta) | 记忆块自编辑、多 Agent 共享、sleep-time | Git 为源+Postgres 为缓存的双写;sleep-time 异步整理 | [letta.md](docs/reference/letta.md) |
| [langmem](https://github.com/langchain-ai/langmem) | 语义/情节/程序三类记忆、命名空间 | 热路径+后台防抖双通道写入;先检索旧记忆再增改删的整合 | [langmem.md](docs/reference/langmem.md) |
| [claude-mem](https://github.com/thedotmack/claude-mem) | hook 自动捕获 observation | 捕获与加工分离的异步写路径(降级 exit 0);三层渐进披露检索 | [claude-mem.md](docs/reference/claude-mem.md) |
| [basic-memory](https://github.com/basicmachines-co/basic-memory) | Markdown/Git 规范记忆层 | "Git 为规范、索引为投影"领域模型;Project 隔离+跨项目引用授权 | [basic-memory.md](docs/reference/basic-memory.md) |
| [TencentDB-Agent-Memory fork](https://github.com/psiQAQ/TencentDB-Agent-Memory) | 团队级记忆中枢(与本项目目标最接近) | IsolationFilter 查询下推;L2/L3 注入 prompt、L0/L1 只读工具的分层注入 | [tencentdb-agent-memory.md](docs/reference/tencentdb-agent-memory.md) |
| [MemRL](https://github.com/MemTensor/MemRL) | 任务反馈(Q-value)学习记忆效用 | Q 值更新公式与元数据组;两阶段检索+unknown 检测(不如不注入) | [memrl.md](docs/reference/memrl.md) |

```bash
# 克隆本仓库后初始化可开发的 TencentDB submodule
git submodule update --init submodules/TencentDB-Agent-Memory
```

当前 gitlink 指向尚未 push 的本地 public fork 提交 `69fd8b31e3fd4362af6c65407b92b26dfabebd0c`。从首个本地修复 `c75ef58` 起至当前修复，共 27 个本地 public commit。Windows 重启后 Docker engine 已恢复；完整所选镜像构建、无付费 Mock 两级 Gate、Hub health 与只读业务探针、Docker Claude `2.1.207` headless、TUI 启动和文本往返均已通过。独立 Windows run 又证明 Loopback Gateway 宿主 health、项目专用 config、原生 Claude `2.1.207` headless、Mock 增量与 Core owner oracle 均通过；用户随后确认 Windows TUI 界面、输入与 `mock text` 往返，post-confirmation Mock 计数由 headless baseline 6 增至 8 且四项泄漏布尔均为 false。全局 `.claude/settings.json` 元数据不变。Docker 与 Windows 结论来自两个独立 project，不能写成同一 project 的双客户端重跑。真实 DeepSeek、stream/tool/thinking、故障恢复或 Win11/LAN/WSL Claude 仍不在已通过范围。新的 clone 在该提交推送到 `psiQAQ/TencentDB-Agent-Memory` 前无法取得它；本任务没有 push 授权。

## 当前执行顺序

当前主入口是[企业智能体记忆系统评估](docs/enterprise-memory-system-evaluation.md)，其中集中记录证据状态、风险、评分门槛和下一步；本轮 Docker-first 约束见[规格](docs/specs/2026-08-09-docker-memory-lab.md)。Standalone 业务 Gate 的身份、共享与证据边界见[决策记录](docs/decisions/2026-08-09-standalone-memory-gate.md)，根 Gate 静态实现见[复现记录](docs/reproduction/2026-08-09-standalone-memory-static-contract.md)；public fork 的原始集成边界见[决策记录](docs/decisions/2026-08-10-public-fork-integration.md)与[集成记录](docs/reproduction/2026-08-10-public-fork-integration-static.md)，当前 Proxy 公开构建回退见[新决策记录](docs/decisions/2026-08-10-public-proxy-docker-fallback.md)，Windows 端口边界见[Loopback Gateway 决策](docs/decisions/2026-08-10-windows-loopback-gateway.md)。

本轮运行证据按 run ID 保持不可变，不用后一次成功覆盖前一次失败：

| Run | 结论 | 复现记录 |
| -- | -- | -- |
| `docker-mock-20260810-002427` | HCS/WSL 系统资源分配阻塞；重启后已恢复，但本 run 仍为 Blocked | [WSL 资源阻塞](docs/reproduction/2026-08-10-docker-mock-20260810-002427-wsl-resource-blocked.md) |
| `docker-mock-20260810-015646` | 完整构建通过；不可重复执行的 Bootstrap 被 Compose 重放，runner 未启动 | [Bootstrap 重放阻塞](docs/reproduction/2026-08-10-docker-mock-20260810-015646-bootstrap-replay-blocked.md) |
| `docker-mock-20260810-024419` | Gate 1 通过；Gate 2 暴露 forged source 的 400/401 预期差异 | [Forged contract 失败](docs/reproduction/2026-08-10-docker-mock-20260810-024419-forged-contract-failed.md) |
| `docker-mock-20260810-030443` | Gate 1 通过；Gate 2 暴露 B session 未初始化，并推断 C 需要同类前置条件 | [Session 前置条件失败](docs/reproduction/2026-08-10-docker-mock-20260810-030443-session-precondition-failed.md) |
| `docker-mock-20260810-033636` | 两级 Gate、Hub 只读业务探针、Docker Claude headless、TUI 启动和 Mock 文本往返通过 | [无付费运行通过](docs/reproduction/2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)、[TUI 用户确认](docs/reproduction/2026-08-10-docker-mock-20260810-033636-tui-user-confirmed.md)、[TUI 文本往返](docs/reproduction/2026-08-10-docker-mock-20260810-033636-tui-message-passed.md) |
| `windows-mock-20260810-093140-a664249f` | 两级 Gate 与 agent config 通过；宿主 loopback 阻塞，Windows config/headless/TUI 未运行 | [宿主 Loopback 阻塞](docs/reproduction/2026-08-10-windows-mock-20260810-093140-loopback-blocked.md) |
| `windows-mock-20260810-111850-93778ced` | Gateway、项目专用 config、Windows Claude headless 与 Mock/Core oracle 通过；TUI 界面、输入和 Mock 文本往返已由用户确认 | [Windows Claude Mock 运行通过](docs/reproduction/windows-mock-20260810-111850-93778ced-windows-claude-mock-passed.md)、[Windows TUI 用户确认](docs/reproduction/windows-mock-20260810-111850-93778ced-windows-tui-user-confirmed.md) |

1. 分别引用本次 Windows run 与 `docker-mock-20260810-033636`，再验证两个独立客户端的身份隔离、共享读取和写入治理。
2. 仅在用户提供工作区外的新 secret 文件且真实 Gate 通过后，显式加载 real profile 验证 DeepSeek；Codex、WSL Claude、Win11、LAN、备份恢复与故障注入后置；public fork 的可复现通用修复独立提交，不混入私有编排。

现有企业改造计划先作为需求清单，不在原样复现前执行。尤其不能直接使用其中不存在的 `services/*`、`packages/*` 路径。

## 注意事项

- 根仓库的 Docker 实验静态测试位于 `tests/integration/`，执行 `node --test tests/integration/test/*.test.mjs`；TencentDB 服务源码的构建、测试和依赖仍位于 submodule 内。
- `.claude/settings.template.json` 是根目录的权威 Claude settings 模板；集成镜像上下文保留一份由自动测试锁步校验的同步副本。本地 settings、Claude home、secret、运行证据和原始日志均不提交。
- 厂商自报基准(Mem0/Zep 等)与独立评测差异可达 ±15-19 个百分点,引用数字时优先采用非利益相关方来源。
- 调研报告中已明确标注未找到可靠来源的点(如 cmem 隐私争议、memory ROI 公开数字),引用时勿当作已证实结论。
- 修改或推翻负责人方案基本思想前,须先向负责人确认(见 `docs/repo-author-comment/comment.md`)。
