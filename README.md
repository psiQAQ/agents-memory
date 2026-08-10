# refine-memory：企业智能体记忆管理调研与实验

本仓库保存企业智能体记忆的调研、设计、跨宿主集成契约和运行证据。`submodules/TencentDB-Agent-Memory` 是独立源码仓库的 gitlink；根仓库不复制产品实现。

## 当前目标

当前 active 路线是四个独立 Docker CLI 连接同一 MemoryProxy/MemoryCore 的共享记忆实验：

| 阶段 | 客户端 | 协议与状态 |
| --- | --- | --- |
| Stage 1 | Claude Code `2.1.226`、OpenCode `1.18.16`、Pi `0.84.1` | 原生 Anthropic handler/route tests Passed；服务与客户端业务流 Not Run |
| Stage 2 | Codex `0.147.0` | 原生身份，经 `/codex/<space>/v1/responses`；Not Run |

**Fact**：upstream base 锁定 `feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1`；active fork/gitlink 为 Task 3 review-fix 产品提交 `0bba4d798ce452d97dbce3c6fa1b7a3eccd881a2`。Claude Code、OpenCode、Pi 的三条 literal Messages 与 `count_tokens` route 已通过真实 handler tests；unknown/unbound/conflict/missing/invalid source/session 在副作用前 fail closed，平台 source 保留到 session/Core record。OpenCode/Pi 的 Anthropic session context 位于顶层 `system`，不会伪造 Claude Code 或把 `role=system` 塞入 Messages。每个 CLI 使用不同的 user、Agent、Session、user key、home、workspace 和 evidence；仅显式 team-visible memory 可在同一 Team/Task 中共享。

**Boundary**：Task 3 review-fix Proxy `sha256:88a350e4...` 已从 official public context 单次构建，31/31 handler/route tests、选定共享 recovery/capability console privacy、native/runtime assets 与 UID 10001 Passed。JSONL、ClickHouse、Opik、Langfuse、upstream headers 和 Claude 专用历史状态机的 comprehensive leak Gate 留到 Task 5，当前 Not Run。Core/Hub 延用 Task 2 固定镜像；服务健康、Mock、真实模型请求、TUI 和跨客户端业务流仍为 Not Run。旧 Windows + Claude 方案及其运行记录均归档为 **Legacy**，它们不能证明四 CLI 路线已经通过。

## 起点

1. 阅读 [项目指令](CLAUDE.md)、[文档索引](docs/README.md) 和 [当前评估](docs/enterprise-memory-system-evaluation.md)。
2. 阅读 [四 Docker CLI 实施计划](docs/superpowers/plans/2026-08-10-four-docker-cli-memory.md)、[架构 ADR](docs/decisions/2026-08-10-four-docker-cli-baseline.md) 与 [baseline reproduction](docs/reproduction/2026-08-10-four-docker-cli-baseline.md)。
3. 只有要执行实验时，才按 [集成实验 SOP](tests/integration/README.md) 继续，并先检查当前 Git/worktree/Docker 状态。

## 历史与研究资料

负责人方案思想在 [comment.md](docs/repo-author-comment/comment.md)。调研、设计和参考项目仍保留在 `docs/`，它们描述企业方向而非运行证明。历史规格、计划、ADR 和 reproduction 是 append-only 证据；active 路线不会改写其中的 Windows + Claude 结论。

历史 legacy 修复 ref `codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 仅存在于当前本地对象库，尚未 push；fresh clone 不可取得，未经授权不得 push。若需要跨 clone 可重建保全，必须获得 push 或外部归档授权；在此之前该项仍未完成。不批量迁移其提交；出现新基线阻塞时，先在 upstream 基线上复现，再在正确的 fork worktree 作最小 RED→GREEN 修复。

## 安全与授权

客户端不得持有模型 key；DeepSeek Pro 仅由 Proxy 持有，DeepSeek Flash 仅由 Core/Hub 持有。不要读取或提交 Tencent ignored `.env`、本地 settings、secret、home、`.runtime/` 或原始证据。未经负责人明确授权，不执行 Docker workload、真实 API、push、PR、remote 修改或破坏性清理。
