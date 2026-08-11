# refine-memory：企业智能体记忆管理调研与实验

本仓库保存企业智能体记忆的调研、设计、跨宿主集成契约和运行证据。`submodules/TencentDB-Agent-Memory` 是独立源码仓库的 gitlink；根仓库不复制产品实现。

## 当前目标

当前 active 路线是四个独立 Docker CLI 连接同一 MemoryProxy/MemoryCore 的共享记忆实验：

| 阶段 | 客户端 | 协议与状态 |
| --- | --- | --- |
| Stage 1 | Claude Code `2.1.226`、OpenCode `1.18.16`、Pi `0.84.1` | 原生 route、产品 session fix/review、root integration 与四镜像 build/assets Passed；Docker 业务运行 Not Run |
| Stage 2 | Codex `0.147.0` | 原生身份，经 `/codex/<space>/v1/responses`；Not Run |

**Fact**：upstream base 锁定 `feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1`；active fork/gitlink 为 reviewed session-identity fix `codex/four-agent-memory-upstream@2de58c2f656978cfe310e3ac3ade085d8096f83b`。产品 19 files / 298 tests、formal review 与固定 Proxy build/assets 已 Passed。该 gitlink 仍是 local-only：`origin/codex/four-agent-memory-upstream` 停在 `38ced16f46fed640bcb7360fb1ca45f9f9918628`，未经单独授权不得 push，fresh clone 暂不可取得 `2de58c2...`。Claude Code、OpenCode、Pi 的三条 literal Messages 与 `count_tokens` route 已通过真实 handler tests；unknown/unbound/conflict/missing/invalid source/session 在副作用前 fail closed，平台 source 保留到 session/Core record。每个 CLI 使用不同的 user、Agent、Session、user key、home、workspace 和 evidence；仅显式 team-visible memory 可在同一 Team/Task 中共享。

**Boundary**：Task 5 root 150/150 Node tests 与 base + 六 overlays 的 7/7 Compose config 证明静态合同；`TDAI_MEMORY_USER_KEY` 由私有 bundle 的同一 per-client key 覆盖继承值。Proxy 固定为 `sha256:be847074...`；tools 与三个 client 已串行各 build 一次，version/help、UID 10001、`/client-evidence` ownership/writability 与 headless assets Passed。这些仍只是 product tests、root contracts 与 image build/assets 证据；服务健康、Proxy→Mock、真实 CLI headless、三写六读、outsider/management live oracle、final oracle、TUI、真实模型与 Codex Stage 2 均为 **Not Run**。旧 Windows + Claude 方案及其运行记录均归档为 **Legacy**。

## 起点

1. 阅读 [项目指令](CLAUDE.md)、[文档索引](docs/README.md) 和 [当前评估](docs/enterprise-memory-system-evaluation.md)。
2. 阅读 [四 Docker CLI 实施计划](docs/superpowers/plans/2026-08-10-four-docker-cli-memory.md)、[架构 ADR](docs/decisions/2026-08-10-four-docker-cli-baseline.md)、[Task 5 privacy/build Passed](docs/reproduction/2026-08-11-task5-proxy-privacy-build-passed.md)、[pre-runtime round 1 erratum](docs/reproduction/2026-08-11-task5-pre-runtime-review-round1-erratum.md)、[root static Passed](docs/reproduction/2026-08-11-task5-pre-runtime-review-round1-root-static-passed.md) 与 [session-identity root integration/build Passed](docs/reproduction/2026-08-11-task5-session-identity-root-integration-build-passed.md)。
3. 只有要执行实验时，才按 [集成实验 SOP](tests/integration/README.md) 的 active `compose.four-cli*.yaml` 入口继续，并先检查当前 Git/worktree/Docker 状态。

## 历史与研究资料

负责人方案思想在 [comment.md](docs/repo-author-comment/comment.md)。调研、设计和参考项目仍保留在 `docs/`，它们描述企业方向而非运行证明。历史规格、计划、ADR 和 reproduction 是 append-only 证据；active 路线不会改写其中的 Windows + Claude 结论。

历史 legacy 修复 ref `codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 仅存在于当前本地对象库，尚未 push；fresh clone 不可取得，未经授权不得 push。若需要跨 clone 可重建保全，必须获得 push 或外部归档授权；在此之前该项仍未完成。不批量迁移其提交；出现新基线阻塞时，先在 upstream 基线上复现，再在正确的 fork worktree 作最小 RED→GREEN 修复。

## 安全与授权

客户端不得持有模型 key；DeepSeek Pro 仅由 Proxy 持有，DeepSeek Flash 仅由 Core/Hub 持有。不要读取或提交 Tencent ignored `.env`、本地 settings、secret、home、`.runtime/` 或原始证据。未经负责人明确授权，不执行 Docker workload、真实 API、push、PR、remote 修改或破坏性清理。
