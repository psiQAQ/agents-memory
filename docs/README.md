# 文档知识库索引

本页是 `docs/` 的统一导航，按用途组织现有文档，不移动或重命名历史文件。它帮助人和 Agent 找到资料，但不替代当前 Git、源码、测试或运行状态检查。

> **当前状态源**：`enterprise-memory-system-evaluation.md` 是当前状态的主汇总；其中的结论仍需用当前环境重新验证。

> **历史快照**：规格、计划、ADR 和复现记录描述各自形成时的目标、决策或证据。后续成功不会改写早期失败，旧文件中的状态也不自动代表当前状态。

## 建议阅读顺序

1. 先读[负责人思想](repo-author-comment/comment.md)，确认方案不能偏离的基本方向。
2. 再读[企业智能体记忆系统评估](enterprise-memory-system-evaluation.md)，确认当前证据、风险、评分和下一项 Gate。
3. 需要理解目标架构时，读[企业开发项目记忆管理方案设计](design/2026-08-06-enterprise-memory-design.md)；该文档是 v0.5 草案，仍待负责人评审。
4. 执行任务前，按本页进入对应规格、计划和 ADR；运行 Windows/Docker 实验时另读[集成实验 SOP](../tests/integration/README.md)。
5. 声明完成、失败或阻塞前，核对对应 `reproduction/` 记录及当前 live 状态。

## 当前总览与负责人原则

| 文档 | 分类 | 使用边界 |
| --- | --- | --- |
| [企业智能体记忆系统评估](enterprise-memory-system-evaluation.md) | 当前状态与管理评估 | 当前状态主汇总；集中记录证据、风险、评分、Go/No-Go 和下一步 |
| [企业记忆管理方案：负责人思想](repo-author-comment/comment.md) | 负责人原则 | 高优先级设计约束；调整基本思想前须由负责人确认 |
| [企业开发项目记忆管理方案设计](design/2026-08-06-enterprise-memory-design.md) | 主设计草案 | v0.5，待负责人评审；不能当作已实施或已验证事实 |

## 调研知识与外部输入

这些材料用于理解问题空间和方案来源。外部项目描述、厂商指标和历史判断都要重新核验，不能直接当作当前实现状态。

| 文档 | 作用 |
| --- | --- |
| [TencentDB Agent Memory 上游能力调研报告](2026-08-18-tencentdb-agent-memory-capability-survey.md) | 2026-08-18 基于上游 `feat/server_team` @ `97f9465` 的源码调研：部署方式、团队/权限模型、资产形式、记忆与知识更新链路；已融合一份外部独立调研并逐条交叉验证（见其第 9 节）；比 `reference/tencentdb-agent-memory.md` 快照更新，验证状态 Static |
| [AI 智能体记忆管理调研报告](exa-results/agent-memory-management-2026-08-03.md) | Exa 主调研：产品与框架对比、价值衡量、提取和共享路线 |
| [GPT 对主调研的评审](exa-results/GPT-review.md) | 四层记忆模型、生命周期、Memory Firewall 与待补方向 |
| [AI 智能体记忆管理补充调研](firecrawl-results/agent-memory-supplement-2026-08-06.md) | Firecrawl 补充：MCP OAuth、检索前 ACL、治理与 Memory PR |
| [GPT 独立报告](GPT/GPT-report.md) | 记忆价值三阶段公式与代表项目比较 |
| [微信分享文及评审](kaer-AI-wozi/wxshare.md) | claude-mem 与 Mem0 跨机器方案的外部输入和评审 |

## 参考项目知识库

`reference/` 保存 8 个项目的架构快照。它们用于借鉴机制，不表示仓库采用了对应产品，也不表示外部项目当前版本仍与文档一致。

| 项目 | 分析文档 |
| --- | --- |
| Basic Memory | [basic-memory.md](reference/basic-memory.md) |
| claude-mem | [claude-mem.md](reference/claude-mem.md) |
| Graphiti | [graphiti.md](reference/graphiti.md) |
| LangMem | [langmem.md](reference/langmem.md) |
| Letta | [letta.md](reference/letta.md) |
| Mem0 | [mem0.md](reference/mem0.md) |
| MemRL | [memrl.md](reference/memrl.md) |
| TencentDB Agent Memory | [tencentdb-agent-memory.md](reference/tencentdb-agent-memory.md)（架构参考；其中 `c75ef58` pin 和 Docker 状态是历史快照，当前状态见企业评估） |

## 规格库

规格描述目标、边界和验收合同，不是运行证明。正文中的状态字段保留形成时的快照；当前结论以企业评估和后续复现证据为准。

| 文档 | 用途 | 状态边界 |
| --- | --- | --- |
| [Docker-first 多客户端记忆实验规格](specs/2026-08-09-docker-memory-lab.md) | 当前 Docker-first 安全、身份、Mock 与真实模型边界 | 顶部状态早于后续 Runtime Passed 证据 |
| [Windows 宿主端口桥接设计](specs/2026-08-10-windows-loopback-gateway.md) | Loopback Gateway 的目标、方案和验收条件 | 顶部状态是实施前快照；结果见对应 ADR 与 Windows 运行记录 |
| [TencentDB Agent Memory 本机复现规格](superpowers/specs/2026-08-08-tencentdb-local-reproduction-design.md) | 初始本机复现与双客户端设想 | 历史规格；当时的 Docker 未安装状态已经过时 |

## 计划库

计划记录实施意图和任务拆解。未勾选或已勾选的步骤都不能单独证明当前状态；执行前必须校准当前 SHA、路径、依赖和已完成证据。

| 计划 | 用途 | 当前使用方式 |
| --- | --- | --- |
| [Repository Baseline Implementation Plan](superpowers/plans/2026-08-07-repository-baseline.md) | 根仓库与 Tencent submodule 初始基线 | 历史建库计划，用于追溯 |
| [TencentDB Agent Memory 改造计划书](superpowers/plans/2026-08-07-tencentdb-memory-retrofit.md) | 企业方案分阶段改造需求清单 | 含失效的 `services/*`、`packages/*` 路径，禁止直接执行 |
| [TencentDB Agent Memory Local Reproduction Implementation Plan](superpowers/plans/2026-08-08-tencentdb-local-reproduction.md) | 早期 Windows + Docker 双客户端复现步骤 | 历史计划；当前操作以集成 SOP 和新规格为准 |
| [Docker-first 多客户端记忆系统与 DeepSeek 适配实施计划](superpowers/plans/2026-08-09-docker-memory-lab.md) | Docker-first、Mock、真实模型 Gate 与 fork 修复任务拆解 | 计划状态是快照；当前结果见企业评估和 reproduction 链 |
| [Windows Loopback Gateway Implementation Plan](superpowers/plans/2026-08-10-windows-loopback-gateway.md) | Windows Gateway 的测试、实现和运行步骤 | 已执行的历史计划；实施证据见 Gateway ADR 与 Windows 运行记录 |

## 决策库

`decisions/` 保存已接受的架构和安全决策。ADR 不覆写；发生修正时新增补充决策或勘误，并由企业评估说明当前采用关系。

| ADR | 决策主题 |
| --- | --- |
| [Docker-first 默认 Mock 与秘密边界](decisions/2026-08-09-docker-memory-lab.md) | 默认无付费、真实模型显式启用、secret 隔离 |
| [客户端凭证分发与付费运行证明](decisions/2026-08-09-credential-fanout-and-paid-attestation.md) | 早期 user-key 分发与付费 attestation；客户端文件布局后由 Standalone 单 bundle 决策取代 |
| [宿主路径根绑定与持久目录 no-follow](decisions/2026-08-09-host-path-and-no-follow-hardening.md) | 宿主路径与链接攻击防护 |
| [Attestation 信任边界补充决策](decisions/2026-08-09-attestation-trust-boundary.md) | 未签名 attestation 的可信宿主边界 |
| [Standalone Memory 身份、共享与证据 Gate](decisions/2026-08-09-standalone-memory-gate.md) | A/B/C 身份、共享、隔离和证据结构 |
| [集成 Claude/DeepSeek 兼容修复](decisions/2026-08-10-public-fork-integration.md) | `b75317b` 修复进入根 gitlink 的历史边界；active pin 后由 Public Proxy 回退决策更新 |
| [Public Proxy Docker 公开构建回退](decisions/2026-08-10-public-proxy-docker-fallback.md) | Proxy Docker 构建回退与 active pin `69fd8b` |
| [Windows Loopback Gateway 边界](decisions/2026-08-10-windows-loopback-gateway.md) | Windows loopback 入口、网络与明文流量边界 |

## 实施状态与复现证据库

`reproduction/` 按时间保留静态验证、失败、阻塞、修复后重跑和用户确认。每份记录只证明其列明的 run、SHA 与范围。

### 静态与集成记录

| 记录 | 当时结论 |
| --- | --- |
| [Docker Compose 静态验证](reproduction/2026-08-09-docker-compose-static.md) | Static Passed；构建在 registry 网络阶段失败 |
| [Docker Compose 安全 Gate 静态复验](reproduction/2026-08-09-docker-compose-security-gates-static.md) | 安全契约 Static Passed；运行未证明 |
| [安全 Gate 静态复验勘误](reproduction/2026-08-09-docker-compose-security-gates-static-errata.md) | 对既有记录的 append-only 信任边界勘误，不是新运行 |
| [Standalone Memory 静态契约](reproduction/2026-08-09-standalone-memory-static-contract.md) | Static Passed；当时因 fork 尚未集成而 Expected Blocked |
| [Public Fork 静态集成](reproduction/2026-08-10-public-fork-integration-static.md) | 当时目标 SHA Static Integrated；Docker runtime 未运行 |

### Docker 与 Windows 运行时间线

| Run / 记录 | 结论 |
| --- | --- |
| [`docker-mock-20260810-002427`](reproduction/2026-08-10-docker-mock-20260810-002427-wsl-resource-blocked.md) | HCS/WSL 资源故障导致 Runtime Blocked |
| [`docker-mock-20260810-015646`](reproduction/2026-08-10-docker-mock-20260810-015646-bootstrap-replay-blocked.md) | Build Passed；Bootstrap 重放阻止 runner 启动 |
| [`docker-mock-20260810-024419`](reproduction/2026-08-10-docker-mock-20260810-024419-forged-contract-failed.md) | Gate 1 Passed；Gate 2 因 forged source 契约差异 Failed |
| [`docker-mock-20260810-030443`](reproduction/2026-08-10-docker-mock-20260810-030443-session-precondition-failed.md) | Gate 1 Passed；Gate 2 因 B session 前置条件 Failed |
| [`docker-mock-20260810-033636`](reproduction/2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md) | 两级 Gate、Hub 探针和 Docker Claude headless 在无付费范围 Runtime Passed |
| [Docker TUI 用户确认](reproduction/2026-08-10-docker-mock-20260810-033636-tui-user-confirmed.md) | 该记录只确认 TUI 启动界面；消息往返见下一条记录 |
| [Docker TUI 文本往返](reproduction/2026-08-10-docker-mock-20260810-033636-tui-message-passed.md) | 固定 Mock 文本场景 Runtime Passed |
| [`windows-mock-20260810-093140-a664249f`](reproduction/2026-08-10-windows-mock-20260810-093140-loopback-blocked.md) | 两级 Gate Passed；宿主 loopback Blocked |
| [`windows-mock-20260810-111850-93778ced` headless](reproduction/windows-mock-20260810-111850-93778ced-windows-claude-mock-passed.md) | Gateway、项目配置、Windows Claude headless 与 Mock/Core oracle Runtime Passed |
| [`windows-mock-20260810-111850-93778ced` TUI](reproduction/windows-mock-20260810-111850-93778ced-windows-tui-user-confirmed.md) | Windows TUI 界面、输入和固定 Mock 文本往返由用户确认 |

## 归档与维护规则

| 新内容 | 放置位置 | 同步要求 |
| --- | --- | --- |
| 负责人原则 | `repo-author-comment/` | 改动前取得负责人确认，并同步主设计 |
| 新一轮调研 | `exa-results/`、`firecrawl-results/` 或对应来源目录 | 文件名带日期；说明与旧报告的关系 |
| 新参考项目分析 | `reference/` | 沿用定位、Mermaid、亮点、缺点和采纳建议结构 |
| 方案设计 | `design/` | 标明版本、评审状态和事实/推断边界 |
| 可验收需求 | `specs/` | 写清目标、非目标和验证条件 |
| 实施任务拆解 | `superpowers/plans/` | 写明基线 SHA、路径与前置 Gate；计划不充当状态 |
| 架构或安全决策 | `decisions/` | 新建 ADR；不覆写历史决策 |
| 静态或运行证据 | `reproduction/` | 按 run/SHA 追加；失败与阻塞记录不得被后续成功覆盖 |
| 当前状态变化 | `enterprise-memory-system-evaluation.md` | 与对应 ADR、规格或 reproduction 在同一逻辑变更中同步 |

新增、移动或废弃文档时，同步更新本索引和根 `README.md` 的入口。历史材料中出现的 `AGENTS.md` 可能是外部项目、通用模式或旧方案快照；它不改变本仓库以根 `CLAUDE.md` 为唯一项目级 Agent 指令源的规则。
