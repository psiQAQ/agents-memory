# CLAUDE.md

本文件是本仓库所有 Agent 共享的唯一项目级指令源（canonical instruction source）。

- Claude Code 直接读取根目录 `CLAUDE.md`。
- OpenAI Codex 在根目录不存在 `AGENTS.md` 时，通过 `.codex/config.toml` 的 `project_doc_fallback_filenames = ["CLAUDE.md"]` 读取本文件。
- 其他 Agent 进入本仓库时也应显式读取并遵守本文件，不另建重复的项目级规则。
- 不要重新创建根目录 `AGENTS.md`、链接文件或第二份重复的项目级规则。

每次新对话或新任务开始时，先读本文件，再从 `docs/README.md` 定位当前企业评估和与任务相关的最新运行记录。聊天摘要、历史计划和旧结论只能用于定位，不能替代当前 Git、源码、测试或运行状态。

## 仓库知识库与渐进披露索引

这是一个企业智能体记忆的调研与实验仓库。根仓库不承载产品源码实现；`tests/integration/` 保存跨宿主和双客户端集成实验，`docs/` 保存调研、设计、决策与运行证据，`submodules/TencentDB-Agent-Memory` 是指向个人 fork 的独立源码仓库。

按任务需要逐层读取，不要把历史文档一次性当成当前事实：

| 用途 | 入口 | 使用边界 |
| --- | --- | --- |
| 项目背景和仓库入口 | `README.md` | 用于理解目标与历史；不是当前状态的唯一来源 |
| 文档知识库总索引 | `docs/README.md` | 按调研、参考、设计、规格、计划、决策和证据分类；新增文档时同步维护 |
| 当前状态、风险、评分和下一 Gate | `docs/enterprise-memory-system-evaluation.md` | 当前主评估入口，但不能替代 live Git/runtime 检查 |
| Windows/Docker 操作 | `tests/integration/README.md` | 当前可执行 SOP；新实验必须使用唯一 run/project/evidence 路径 |
| 负责人思想 | `docs/repo-author-comment/comment.md` | 修改基本思想前必须先取得负责人确认 |
| 企业方案设计 | `docs/design/2026-08-06-enterprise-memory-design.md` | 主设计草案（v0.5，待负责人评审）；需与负责人思想和最新实验证据交叉核对 |
| 规格与验收合同 | `docs/specs/`、`docs/superpowers/specs/` | 描述目标与边界，不是运行证明；旧状态字段可能是历史快照 |
| 实施计划 | `docs/superpowers/plans/` | 记录意图和任务拆解，不代表完成；执行前校准 SHA、路径和前置 Gate |
| 决策记录 | `docs/decisions/` | ADR 是不可覆写的决策史；当前采用关系以企业评估为准 |
| 实施状态与运行证据 | `docs/reproduction/` | 每份记录只证明对应 run/SHA/范围，后续成功不覆盖早期失败 |
| 调研与参考知识 | `docs/exa-results/`、`docs/firecrawl-results/`、`docs/GPT/`、`docs/kaer-AI-wozi/`、`docs/reference/` | 外部输入与架构快照须按任务重新核验 |

研究任务按 `docs/README.md` 的分类逐层读取，不一次性加载全部历史材料。新增参考项目时沿用 `docs/reference/` 的现有模板：定位、Mermaid 图、亮点、缺点和“可参考机制 → 本方案设计点 → 采纳建议”表；Mermaid 节点标签统一用双引号包裹。新一轮调研结果按检索工具放入 `docs/exa-results/` 或 `docs/firecrawl-results/`，文件名带日期，不覆盖旧报告，并在新报告开头说明与旧报告的关系。

## 最高优先级约束

`docs/repo-author-comment/comment.md` 是仓库负责人的方案思想记录，以较高优先级参考。若有更好方案，必须先向负责人确认后才能调整其基本思想。核心思想包括：

- 记忆按身份颗粒度管理。
- 按项目上下游披露程度交流。
- 记忆价值由 AI 初步生成，由查询人决定颗粒程度。
- 通过 MCP 完成身份登录、项目认证和跨级调取。

## 第一目标与阶段顺序

除非负责人在当前任务中明确改变目标，当前第一目标是完成并管理一套可重复演示的记忆共享系统：

- Windows 原生 Claude Code 使用 `agent-a`；Docker Claude Code 使用 `agent-b`。当前 Windows 演示基线为 Windows 10。
- A、B 连接同一套 MemoryProxy/MemoryCore，但必须使用不同的 Memory 用户、Agent、Session 和 user key。
- A、B 加入同一 Team，通过明确授权的 team-visible 记忆验证共享；隔离客户端继续作为反例。
- 主对话共用 DeepSeek Pro 上游，记忆提炼使用 DeepSeek Flash 上游；模型凭证只留在服务端。
- 先通过无付费 Mock、身份、共享、隔离和泄漏 Gate，再执行负责人明确授权的真实模型测试。
- 管理范围包括用户、Team、Agent、Task、共享资产、服务健康、凭证和持久卷生命周期；优先复用 Tencent Panel/Knowledge 的现有入口。
- 交付可执行 SOP，覆盖启动、健康检查、Windows/Docker 客户端配置、演示步骤、管理入口、证据、停止和精确清理。

按以下顺序推进，不因发现次要问题而提前扩展范围：

1. 完成 Windows Claude Code + Docker Claude Code 的同栈共享记忆演示和日常管理。
2. 处理演示中实际出现的兼容性问题。
3. 根据已验证的使用需要增加功能。

只要第一阶段仍有未完成 Gate，新对话默认继续下一项未完成工作，不先做无关重构、泛化或功能扩展。Codex 客户端、WSL Claude、Windows 11 和 LAN 验证后置。

## 已收敛的调研约束

以下内容约束企业落地研究和新文档，不等同于当前本机 Tencent POC 的运行状态：

1. 企业落地路线：Git 记忆文件（PR 评审治理）→ 异步自动提炼（以 PR 合入）→ 规模化后才上记忆平台。
2. 写入治理重于提取能力：Memory Firewall、标失效不删除、provenance 和生命周期管理。
3. 引用基准数字时优先非利益相关方来源；厂商自报与独立评测可相差 ±15–19 个百分点。
4. 未找到可靠来源的内容显式标记“待验证”，不得写成无来源断言。

## TencentDB submodule 与复用边界

当前只有 TencentDB Agent Memory 登记为 submodule。克隆本仓库后初始化：

```bash
git submodule update --init submodules/TencentDB-Agent-Memory
```

- `origin`：`https://github.com/psiQAQ/TencentDB-Agent-Memory.git`，用于个人 fork 的开发分支和推送。
- `upstream`：`https://github.com/TencentCloud/TencentDB-Agent-Memory.git`，本地添加后只用于同步和 PR 对照。
- 其他 7 个项目只在 `.gitmodules` 保留地址，未登记 gitlink；保留 `docs/reference/` 分析，不为调研目的下载源码。
- 实现或测试前，先检查 Tencent submodule 的源码、部署脚本、Dockerfile、配置、测试和文档。
- Tencent 仓库已有的能力直接调用、配置或做薄封装，不在根仓库复制实现，也不另造同类工具。
- 根仓库只保留跨仓库编排、Windows/Docker 双客户端拓扑、证据 Gate、SOP 和企业评估等集成职责。
- Docker 构建与服务级测试优先复用 fork 中的 Dockerfile、启动脚本和测试。只有跨宿主网络、双客户端编排或上游确实缺失的验证，才放在根仓库 `tests/integration/`。
- 复用遇到问题时，先判断是配置/使用错误、版本差异还是上游缺失。只有确认 Tencent 仓库没有该能力，或现有实现存在可复现缺陷时，才开发修复或新增功能。

## Tencent fork 开发流程

- 适配修复和新增功能都在 `submodules/TencentDB-Agent-Memory` 对应的个人 fork 中开发，不把产品源码补丁塞进根仓库。
- 开发前检查 fork、upstream、gitlink 和工作树状态；从个人 fork 创建独立 feature branch，并使用独立 Git worktree。不得在 detached HEAD 或共享脏工作树中开发。
- 每个问题先写可复现测试，再做最小修复；在 fork 中完成单元测试、类型检查、构建和必要的 Docker 验证。
- fork 变更按独立逻辑提交。根仓库只在 fork 结果通过后更新 gitlink、集成测试、ADR、运行记录和 SOP。
- 变更达到 PR-ready 后记录目标仓库、base、head SHA、验证结果和已知限制。只有负责人明确授权时才 push 或创建 PR；不得修改 remote 来绕过权限或流程。
- fork 代码保持可独立使用，不依赖根仓库的私有路径、secret、运行证据或本机状态。

## 凭证与客户端配置

### 临时模型凭证

- 不在聊天、提交、日志、测试快照或稳定 fingerprint 中记录 API key。
- 默认使用工作区外 secret 文件和真实 Paid Gate。
- 为本机短期演示，负责人可明确授权复用 Tencent 原生的 `submodules/TencentDB-Agent-Memory/deploy/global-images/.env`，分别填写 `PROXY_UPSTREAM_API_KEY` 和 `MEMORY_LLM_API_KEY`。
- 该 `.env` 仅是 Local-only Quick Test 输入：它虽被 Git 忽略，仍是宿主明文文件。根栈需要读取时优先通过 `--env-file` 和 Compose secrets 使用，不复制到新的根目录配置，不把值传给客户端。
- 测试完成并归档脱敏证据后，由负责人删除临时 `.env` 并轮换或撤销临时 key。未完成清理前，不得把结果标为企业部署可用。

### Claude Code 专用约束

- 只跟踪 `.claude/settings.template.json`。
- 不读取、复制或提交本地 settings、Claude home、secret、运行期日志或 `.runtime/` 证据。
- 模板中的 URL 必须是 MemoryProxy 占位符，客户端不得持有 DeepSeek key。

### OpenAI Codex 专用约束

- 仓库级 `.codex/config.toml` 只负责将 `CLAUDE.md` 配置为项目指令 fallback；不要在其中复制项目规则正文。
- 修改 fallback 文件名时必须同步检查根目录不存在会抢先匹配的 `AGENTS.md`。

## 实验、证据与文档纪律

- 每个新的架构或安全决策新增一份 ADR；不得覆写旧 ADR 来伪装决策从未变化。
- 每次实验开始、失败、阻塞或完成时，都新增一份 `docs/reproduction/<run-id>.md`；同一 commit 同步更新企业评估主状态。
- 若工作将在另一个对话继续，先把当前阶段写成明确的 `Blocked` 运行记录，包含已完成证据、阻塞原因和安全恢复入口，避免只依赖聊天上下文。
- README 沿用既有版本化交互记录方式：只记录会影响版本或方案的用户需求原文，不转录完整聊天历史；保持前后一致，减少结构碎片。
- Docker-first 文档或配置变更与对应实现 commit 必须同步更新规格、ADR、企业评估状态矩阵和 README 主入口。未运行项明确标为 `Static`、`Not Run` 或 `Blocked`，不得用 health check 声称业务流通过。
- `docs/superpowers/plans/2026-08-07-tencentdb-memory-retrofit.md` 是基于当时 `fe3230f` 的早期需求草案，含已经失效的 `services/*`、`packages/*` 路径。完成复现并按当前 gitlink 重新定位源码后，才能执行或重写。

## Git 与授权边界

- 操作前检查根仓库与 submodule 各自的分支和状态，保留与当前任务无关的用户修改。
- 每个完整逻辑阶段独立提交；当前任务若明确禁止 commit，则以当前任务要求为准。
- destructive cleanup、真实付费调用、push 或创建 PR 必须由负责人明确授权。
- 不使用修改 remote、全局 prune、模糊 project 名或其他绕过方式规避授权与精确清理边界。

## 新对话启动检查

1. 读取本文件，从 `docs/README.md` 定位 `docs/enterprise-memory-system-evaluation.md` 和与任务相关的最新 reproduction report。
2. 需要执行 Windows/Docker 操作时，再读取 `tests/integration/README.md` 的对应章节和相关最新 ADR。
3. 检查根仓库、submodule、相关 worktree、Docker project 和宿主端口的当前状态。
4. 找出第一目标的下一项未完成 Gate，并先推进它。
5. 区分 `Static`、`Runtime Passed`、`User Confirmed`、`Failed`、`Blocked` 和 `Not Run`；不把历史成功或 health check 扩写成当前业务证明。
6. 遵守本文件的凭证、Git、付费调用和 destructive cleanup 授权边界。
