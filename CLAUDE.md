# refine-memory 项目指令

本文件是仓库唯一的项目级指令源。Claude Code 直接读取它；Codex 通过 `.codex/config.toml` 的 fallback 读取它。不要新建根目录 `AGENTS.md` 或第二份项目规则。

## Goal

当前目标是可重复的 **四 Docker CLI 共享记忆实验**。根仓库只负责跨仓库 Compose 编排、客户端容器、身份 bootstrap、证据 Gate、SOP 和评估；产品源码只在 `submodules/TencentDB-Agent-Memory` 的独立 fork/worktree 中修改。

Stage 1 依次支持 Claude Code、OpenCode、Pi 的 Anthropic Messages 路由；Stage 2 才为 Codex 增加 `/codex/<space>/v1/responses`。四个客户端必须有不同的 Memory user、Agent、Session、user key、home、workspace 和 evidence，且只通过显式 team-visible memory 共享同一 Team/Task。

## Current baseline

- **Fact**：Tencent upstream base 固定为 default `feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1`；active fork/gitlink 为 reviewed Task 5 auth service-token fix `codex/four-agent-memory-upstream@9e456a5b7bb47ae40596237d0f0b87c1edfc098f`。`origin/codex/four-agent-memory-upstream` 仍为 `38ced16f46fed640bcb7360fb1ca45f9f9918628`，所以 active gitlink 是 local-only、fresh clone 暂不可取得；未经单独授权不得 push。upstream 前移时仍须先审查增量，不能静默更新。
- **Fact**：历史修复 ref `codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 仅存在于当前本地对象库，尚未 push；fresh clone 不可取得，未经授权不得 push。若需要跨 clone 可重建保全，必须获得 push 或外部归档授权；在此之前该项仍未完成。
- **Fact**：版本基线为 Claude Code `2.1.226`、Codex `0.147.0`、OpenCode `1.18.16`、Pi `0.84.1`。
- **Fact**：Task 2 fix round 2 已使 tracked-shell producer 部分输出后 nonzero 必须整体失败；正常 Git Bash、WSL native 与 `git.exe` fallback 均保持 23/23。该轮只改 Gate/test/EOL attribute，不改镜像输入，因此 round 1 的 Core/Proxy image IDs 继续有效，Hub 保持原 Passed 镜像。该 Gate 为 **Runtime Passed（build/assets only）**。Core 与 Hub 是 root-default，Proxy UID 10001；本轮只记录权限元数据。服务健康、Mock、真实 API、TUI 与跨客户端业务流仍为 **Not Run**。
- **Fact**：Task 4 已新增 active `compose.four-cli*.yaml`、无 secret 三客户端清单、动态三 owner bootstrap、独立 outsider、六条 cross-owner binding、私有 bundle/config renderer，以及三个 UID 10001 的固定 CLI image。formal review fix 已补齐 owner/outsider cardinality、binding post-set 全字段验证，以及 bundle 固定 home 路径和 parent no-follow；先前的 Mock runtime config/healthy 依赖、config-dir no-follow 与 Node base digest pin 保持。root Node 86/86、Compose config matrix、三镜像 build/version/help/UID Passed；状态仅是 **Runtime Passed（client build/config assets only）**，服务、Mock 业务、真实 API、TUI 与跨客户端读写仍为 **Not Run**。
- **Fact**：Task 5 auth service-token fix 已在 `9e456a5...` 通过 focused `3/3`、fresh full `38/38` suites / `276/276` tests、exact six baseline typecheck errors与最终 review `CLEAN`；replacement Proxy、tools fixture image `sha256:8ca1a2a8...` 与 OpenCode fixed-title image `sha256:263a6d0e...` 均为 **Ready（build/assets only）**。历史 Blocked records 均 append-only；`stepfix-2df660d8` 单次 full Mock 在固定 step 9 fail-stop、steps 1–8 exit `0`，随后 exact cleanup。fixed-title TDD/build/assets 已 Passed；当前为 **Ready for fresh tuple / full Mock Not Run**。完整三写六读、final、TUI 与真实模型仍为 **Not Run**。
- **Recommendation**：从 `docs/enterprise-memory-system-evaluation.md` 确认下一 Gate；执行 Windows/Docker 操作前，再读 `tests/integration/README.md` 与最新 ADR/reproduction。

## Constraints

- 保留 `docs/specs/`、`docs/superpowers/` 中旧 specs/plans、`docs/decisions/` ADR 与 `docs/reproduction/` 的原文。它们是不可变历史；active 入口应将旧 Windows + Claude 路线标为 Legacy，而不是改写其结论。
- 不批量迁移 legacy `69fd8b3` 的提交。新基线上的可复现阻塞必须先 RED→GREEN，再在正确的 fork worktree 作最小修复。
- 不允许 OpenCode、Pi 或 Codex 冒充 `claude-code`、`openai` 或其他平台身份。Stage 1 的路径是 `/claude-code/<space>/v1/messages`、`/opencode/<space>/v1/messages`、`/pi/<space>/v1/messages`；Stage 2 才使用 Codex Responses 路由。
- 模型凭证只留在服务端：Proxy 持有 DeepSeek Pro，Core/Hub 持有 DeepSeek Flash；客户端只持有自己的 Memory user key。不得读取、复制、输出、提交或稳定派生 Tencent ignored `.env`、本地 settings、home、secret、`.runtime/` 或原始运行日志。
- Mock identity/share/isolation/leak Gate 全部通过且负责人明确授权后，才可做真实 API 调用；任何真实调用要遵守计划中的预算与次数上限。
- 未获授权不得 push、建 PR、修改 remote、执行 Docker workload、真实 API、`down -v`、prune 或其他破坏性清理。

## Workflow

1. 先读 `docs/README.md`、当前评估、相关 ADR/reproduction，并实时检查根仓库、submodule、worktree 与端口状态。
2. 新架构或安全决策新增 ADR；每次实验的开始、失败、阻塞或完成新增 append-only reproduction，同时更新评估。`Static`、`Runtime Passed`、`User Confirmed`、`Failed`、`Blocked` 和 `Not Run` 必须严格区分。
3. Tencent 产品修复必须在个人 fork 的独立 feature branch/worktree 内，先写复现测试，再执行最小修复和其仓库内验证；根仓库只在通过后更新 gitlink、集成契约、SOP 与证据。
4. 运行前使用唯一 run/project/evidence 路径；失败的项目保留供诊断。只有证据已脱敏归档且负责人明确要求销毁该精确项目时，才可精确清理。

## Project knowledge

负责人思想位于 `docs/repo-author-comment/comment.md`，是高优先级约束：记忆按身份颗粒度管理、按项目上下游披露、价值由 AI 初筛后由查询人决定、通过 MCP 做身份与项目认证。变更这些基本思想前须取得负责人确认。

调研层面的路线仍是 Git 记忆文件与 PR 治理 → 异步自动提炼 → 规模化后记忆平台；写入治理、provenance、生命周期和检索前 ACL 过滤优先于提取能力。它们不等于本机运行状态。

## Git and validation

操作前检查根仓库和 submodule 的分支/状态，保留无关用户修改。每个完整逻辑阶段单独 commit；除非得到明确授权，不 push 或创建 PR。文档和脚本使用 UTF-8（无 BOM）与 LF。完成前至少执行本任务相关的测试、链接、编码/EOL、secret-shape、gitlink 和 worktree 检查，且不得把 health check 或静态测试扩写为业务通过。
