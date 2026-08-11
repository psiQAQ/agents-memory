# refine-memory：企业智能体记忆管理调研与实验

本仓库保存企业智能体记忆的调研、设计、跨宿主集成契约和运行证据。`submodules/TencentDB-Agent-Memory` 是独立源码仓库的 gitlink；根仓库不复制产品实现。

## 当前目标

当前 active 路线是四个独立 Docker CLI 连接同一 MemoryProxy/MemoryCore 的共享记忆实验：

| 阶段 | 客户端 | 协议与状态 |
| --- | --- | --- |
| Stage 1 | Claude Code `2.1.226`、OpenCode `1.18.16`、Pi `0.84.1` | `opentitle-4f056ee6` step 9 Blocked/cleaned；OpenCode typed diagnostic `89398d1d` Passed/cleaned；normal headless fixed-phase diagnostic next；TUI/real Not Run |
| Stage 2 | Codex `0.147.0` | 原生身份，经 `/codex/<space>/v1/responses`；Not Run |

**Fact**：upstream base 锁定 `feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1`；active fork/gitlink 为 reviewed auth service-token fix `codex/four-agent-memory-upstream@9e456a5b7bb47ae40596237d0f0b87c1edfc098f`。产品 focused `3/3`、fresh full `38/38` suites / `276/276` tests、exact six baseline typecheck errors与最终 review `CLEAN`；replacement Proxy build/assets 已 Passed。该 gitlink 仍是 local-only：`origin/codex/four-agent-memory-upstream` 停在 `38ced16f46fed640bcb7360fb1ca45f9f9918628`，未经单独授权不得 push，fresh clone 暂不可取得 `9e456a5...`。Claude Code、OpenCode、Pi 的三条 literal Messages 与 `count_tokens` route 已通过真实 handler tests；unknown/unbound/conflict/missing/invalid source/session 在副作用前 fail closed，平台 source 保留到 session/Core record。每个 CLI 使用不同的 user、Agent、Session、user key、home、workspace 和 evidence；仅显式 team-visible memory 可在同一 Team/Task 中共享。

**Boundary**：Task 5 Proxy `9e456a5/sha256:55fedae3...`、tools `sha256:8ca1a2a8...`、Claude `sha256:261a9173...` 与 OpenCode fixed-title `sha256:263a6d0e...` 均为 **Ready（build/assets only）**。历史 Blocked records 保持 append-only；[`opentitle-4f056ee6`](docs/reproduction/2026-08-12-task5-mock-20260812-opentitle-4f056ee6-opencode-write-blocked.md) 的单次 launcher 在 fixed step 9 fail-stop，唯一脱敏 aggregate probe 只证明 OpenCode main request 精确一次到达 Mock，未定位具体失败项；随后已完成 [exact cleanup](docs/reproduction/2026-08-12-task5-mock-20260812-opentitle-4f056ee6-exact-cleanup-passed.md)。OpenCode typed diagnostic 的 [`89398d1d` Ready](docs/reproduction/2026-08-12-task5-diag-opencode-20260812-89398d1d-ready.md) 后续单次运行已 [Passed](docs/reproduction/2026-08-12-task5-diag-opencode-20260812-89398d1d-passed.md) 并完成 [exact cleanup](docs/reproduction/2026-08-12-task5-diag-opencode-20260812-89398d1d-exact-cleanup-passed.md)：render/spawn/capture/CLI code0、预期 operation/main 精确一次且无 unexpected/leak/drop/truncation。它仍不证明普通 headless exact verifier/evidence publish，当前业务 Gate 为 **Blocked**，下一 Gate 是 TDD normal headless fixed-phase diagnostic。完整三写六读、final、TUI、真实模型与 Codex Stage 2 均为 **Not Run**。旧 Windows + Claude 方案及其运行记录均归档为 **Legacy**。

## 起点

1. 阅读 [项目指令](CLAUDE.md)、[文档索引](docs/README.md) 和 [当前评估](docs/enterprise-memory-system-evaluation.md)。
2. 阅读 [四 Docker CLI 实施计划](docs/superpowers/plans/2026-08-10-four-docker-cli-memory.md)、[架构 ADR](docs/decisions/2026-08-10-four-docker-cli-baseline.md)、[Task 5 privacy/build Passed](docs/reproduction/2026-08-11-task5-proxy-privacy-build-passed.md)、[pre-runtime round 1 erratum](docs/reproduction/2026-08-11-task5-pre-runtime-review-round1-erratum.md)、[root static Passed](docs/reproduction/2026-08-11-task5-pre-runtime-review-round1-root-static-passed.md)、[OpenCode replacement Passed](docs/reproduction/2026-08-12-task5-opencode-title-replacement-image-passed.md)、[opentitle OpenCode write Blocked](docs/reproduction/2026-08-12-task5-mock-20260812-opentitle-4f056ee6-opencode-write-blocked.md)、[opentitle exact cleanup](docs/reproduction/2026-08-12-task5-mock-20260812-opentitle-4f056ee6-exact-cleanup-passed.md)、[OpenCode typed diagnostic Passed](docs/reproduction/2026-08-12-task5-diag-opencode-20260812-89398d1d-passed.md) 与 [exact cleanup](docs/reproduction/2026-08-12-task5-diag-opencode-20260812-89398d1d-exact-cleanup-passed.md)。
3. 只有要执行实验时，才按 [集成实验 SOP](tests/integration/README.md) 的 active `compose.four-cli*.yaml` 入口继续，并先检查当前 Git/worktree/Docker 状态。

## 历史与研究资料

负责人方案思想在 [comment.md](docs/repo-author-comment/comment.md)。调研、设计和参考项目仍保留在 `docs/`，它们描述企业方向而非运行证明。历史规格、计划、ADR 和 reproduction 是 append-only 证据；active 路线不会改写其中的 Windows + Claude 结论。

历史 legacy 修复 ref `codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 仅存在于当前本地对象库，尚未 push；fresh clone 不可取得，未经授权不得 push。若需要跨 clone 可重建保全，必须获得 push 或外部归档授权；在此之前该项仍未完成。不批量迁移其提交；出现新基线阻塞时，先在 upstream 基线上复现，再在正确的 fork worktree 作最小 RED→GREEN 修复。

## 安全与授权

客户端不得持有模型 key；DeepSeek Pro 仅由 Proxy 持有，DeepSeek Flash 仅由 Core/Hub 持有。不要读取或提交 Tencent ignored `.env`、本地 settings、secret、home、`.runtime/` 或原始证据。未经负责人明确授权，不执行 Docker workload、真实 API、push、PR、remote 修改或破坏性清理。
