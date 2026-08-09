# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库性质

这是一个企业智能体记忆的调研与实验仓库。根仓库没有构建、测试或运行命令；`docs/` 保存调研和设计，`submodules/TencentDB-Agent-Memory` 是指向个人 fork 的独立源码仓库。

## 最高优先级约束

`docs/repo-author-comment/comment.md` 是仓库负责人的方案思想记录,**以较高优先级参考;若有更好方案,必须先向负责人确认后才能调整其基本思想**。核心思想:记忆按身份颗粒度管理、按项目上下游披露程度交流、记忆价值由 AI 初步生成而查询人决定颗粒程度、以 MCP 方式经身份登录与项目认证跨级调取。

## 内容架构(多文档间的关系)

调研结论分散在多份互相引用的文档中,修改任何一份前需了解全局:

- `docs/exa-results/agent-memory-management-2026-08-03.md` — **主报告**(Exa 轮,256 来源):产品/框架对比、价值衡量、三阶段落地路线。
- `docs/exa-results/GPT-review.md` — GPT 对主报告的**评审**:提出四层记忆模型(Org/Project/User/Runtime)、完整生命周期(候选→验证→生效→衰减→归档)、Memory Firewall、按记忆类型分 TTL;指出主报告待补的五个方向。
- `docs/firecrawl-results/agent-memory-supplement-2026-08-06.md` — **补充报告**(Firecrawl 轮,71 来源):针对评审缺口补充 MCP OAuth 2.1 认证、检索前 ACL 过滤、新工具(claude-mem/TencentDB Agent Memory/MemRL)、记忆即 PR 的实证;末尾有负责人思想 ↔ 调研印证 ↔ 落地组件的映射表。
- `docs/GPT/GPT-report.md` — GPT 独立报告:记忆价值三阶段公式(写入前 V_pre 加权分、调用时排序、使用后 Q-value 更新)、代表项目对比表。
- `docs/kaer-AI-wozi/wxshare.md` — 外部微信分享文(claude-mem 本地捕获 + Mem0 跨机器共享)及附带的 GPT 评审。
- `docs/design/2026-08-06-enterprise-memory-design.md` — **本仓库的主设计产出**:自建 Memory Gateway(MCP)+ Git 双层架构;含身份披露矩阵、无感读写路径、管理平面(薄控制台+角色模板+三元组令牌)、四阶段路线。修改设计时以此为准。
- `docs/reference/*.md` — 8 个参考项目的架构分析(每份:定位 + mermaid 图 + 亮点 + 缺点 + "可参考机制→本方案设计点→采纳建议"表)。新增参考项目时沿用同一模板,mermaid 节点标签一律用双引号包裹。

新一轮调研的结果按检索工具归目录存放(`docs/exa-results/`、`docs/firecrawl-results/`),文件名带日期;不要覆盖旧报告,新报告开头注明与旧报告的关系。

## 已收敛的调研结论(写新内容时保持一致)

1. 落地路线:Git 记忆文件(PR 评审治理)→ 异步自动提炼(以 PR 合入)→ 规模化后才上记忆平台。
2. 写入治理重于提取能力:Memory Firewall、标失效不删除、provenance、生命周期管理。
3. 引用基准数字时优先非利益相关方来源(厂商自报与独立评测差异达 ±15-19 个百分点)。
4. 报告中未找到可靠来源的点均已显式标注"待验证",新增内容沿用此惯例,不做无来源断言。

## TencentDB 开发仓库

当前只有 TencentDB Agent Memory 作为 submodule。克隆本仓库后初始化：

```bash
git submodule update --init submodules/TencentDB-Agent-Memory
```

- `origin`: `https://github.com/psiQAQ/TencentDB-Agent-Memory.git`，用于开发分支和推送。
- `upstream`: `https://github.com/TencentCloud/TencentDB-Agent-Memory.git`，本地添加后仅用于同步和 PR 对照。
- 修改源码前进入 submodule 创建 feature branch，不在 detached HEAD 上提交。
- 其他 7 个项目在 `.gitmodules` 保留地址，但未登记 gitlink；只保留 `docs/reference/` 分析，不为调研目的下载源码。

## 当前优先级

1. 先运行默认 Mock 的 Docker Compose 实验，验证业务探针而不调用真实 DeepSeek；规格见 `docs/specs/2026-08-09-docker-memory-lab.md`。
2. 以隔离配置验证 Windows 10 原生 Claude 与 Docker Linux Claude 经 MemoryProxy 共享同一记忆服务；Codex、WSL、Win11 和 LAN 验证后置。
3. 仅在工作区外新 secret 文件与真实 Gate 齐备时执行 real profile；再在 fork 中做可复现的最小兼容性修复和针对性测试。

`docs/superpowers/plans/2026-08-07-tencentdb-memory-retrofit.md` 是早期需求草案，包含与当前 `fe3230f` 快照不一致的 `services/*`、`packages/*` 路径。完成复现并重新定位源码后才能执行或重写。

## 常用操作

### 决策与实验记录纪律

- 每个新的架构或安全决策新增一份 ADR；不得覆写旧 ADR 来伪装决策从未变化。
- 每次实验开始、失败、阻塞或完成时，都新增一份 `docs/reproduction/<run-id>.md` 记录；同一 commit 同步更新企业评估主状态。
- 若工作将在另一个对话继续，必须先把当前阶段写成明确的 `Blocked` 运行记录，包含已完成证据、阻塞原因和安全的恢复入口，避免只依赖聊天上下文。

- 更新 README:遵循用户全局文档规范——记录每次交互原文(按版本)、保持前后一致、减少结构碎片。
- Docker-first 文档或配置变更与对应实现 commit 必须同步更新：规格、ADR、企业评估的状态矩阵，以及 README 主入口；未运行项明确标为 `Static`、`Not Run` 或 `Blocked`，不得用 health check 声称业务流通过。
- Claude 配置只跟踪 `.claude/settings.template.json`；不读取、复制或提交本地 settings、Claude home、secret、运行期日志或 `.runtime/` 证据。模板中的 URL 必须是 MemoryProxy 占位符，客户端不得持有 DeepSeek key。
- git:操作前检查根仓库与 submodule 各自的分支和状态；每个完整逻辑阶段独立提交；push 仅在负责人明确要求时执行。
