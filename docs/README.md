# 文档知识库索引

本页是 `docs/` 的 active 导航。它不替代当前 Git、源码、测试或运行状态检查；每份历史文件只证明其形成时的范围。

## Active：四 Docker CLI 基线

| 入口 | 用途 | 当前状态 |
| --- | --- | --- |
| [企业智能体记忆系统评估](enterprise-memory-system-evaluation.md) | 当前范围、风险、下一 Gate | EROFS/tmpfs fix + image Ready；`113ca669` diagnostic Ready/Not Run；TUI/real Not Run |
| [四 Docker CLI 实施计划](superpowers/plans/2026-08-10-four-docker-cli-memory.md) | 任务顺序与验收边界 | 计划，不是运行证据 |
| [架构 ADR](decisions/2026-08-10-four-docker-cli-baseline.md) | 四 CLI 分阶段与身份隔离决策 | Accepted；runtime Not Run |
| [baseline reproduction](reproduction/2026-08-10-four-docker-cli-baseline.md) | 固定版本、gitlink 与本轮未运行边界 | Append-only；Static baseline |
| [Task 2 Core source-build](reproduction/2026-08-10-task2-core-pristine-source-build-passed.md) | 固定 upstream Core 构建与 SQLite/native asset | Runtime Passed（build/assets only）；Proxy/Hub Not Run |
| [Task 2 Proxy source-build RED](reproduction/2026-08-10-task2-proxy-pristine-source-build-red.md) | 固定 upstream Proxy pristine build 失败 | Failed / Blocked；缺失 cost-guard build-context 文件 |
| [Task 2 Proxy Windows LF RED](reproduction/2026-08-10-task2-proxy-public-context-windows-lf-red.md) | upstream public-context script 的 Windows checkout 失败 | Failed / Blocked；Bash script 被 checkout 为 CRLF |
| [Task 2 Proxy runtime fallback RED](reproduction/2026-08-10-task2-proxy-public-context-runtime-red.md) | public context build/native assets 与 stub fallback | Build Passed；stub 被误判 available，Gate Failed |
| [Task 2 Proxy source-build Passed](reproduction/2026-08-10-task2-proxy-source-build-passed.md) | TDD 修复后的 public context/native assets/fallback | Runtime Passed（build/assets only）；Hub Not Run |
| [Task 2 Hub recipe-context RED](reproduction/2026-08-10-task2-hub-pristine-context-red.md) | 固定 upstream Hub Dockerfile 的直接 context 失败 | Failed / Blocked；需要 combined Panel/Knowledge context |
| [Task 2 Hub source-build Passed](reproduction/2026-08-10-task2-hub-source-build-passed.md) | upstream combined context、native SQLite 与 runtime assets | Runtime Passed（build/assets only） |
| [Task 2 Shell Gate fix round 1 RED/erratum](reproduction/2026-08-11-task2-shell-assets-fix-round1-red-erratum.md) | 动态枚举全部 tracked shell 与旧镜像遗漏、权限元数据勘误 | Failed / Superseded evidence；旧 Core/Proxy 镜像被替代 |
| [Task 2 Shell Gate fix round 1 Passed](reproduction/2026-08-11-task2-shell-assets-fix-round1-passed.md) | 全部 shell LF/syntax、新 Core/Proxy 串行重建与 runtime assets | Runtime Passed（build/assets only） |
| [Task 2 Shell Gate fix round 2](reproduction/2026-08-11-task2-shell-gate-producer-status-round2-passed.md) | partial NUL output 后 producer nonzero 的 fail-closed 回归 | Passed；镜像输入未变，无需重建 |
| [Task 3 Anthropic platform routes RED](reproduction/2026-08-11-task3-anthropic-platform-routes-red.md) | OpenCode/Pi route、source/session fail-closed 与 privacy 复现 | Failed / Reproduced；修复前不可变证据 |
| [Task 3 Anthropic platform routes Passed](reproduction/2026-08-11-task3-anthropic-platform-routes-passed.md) | 三平台 literal route、source 保真、session/privacy 与原 Task 3 Proxy image | 原范围部分被 review erratum 收窄；保留不可变证据 |
| [Task 3 review fix round 1 RED/erratum](reproduction/2026-08-11-task3-review-fix-round1-erratum.md) | Anthropic session body、count_tokens 与共享 console privacy 独立复现 | Failed / Reproduced；原 Passed 范围勘误 |
| [Task 3 review fix round 1 Passed](reproduction/2026-08-11-task3-review-fix-round1-passed.md) | 三项 Important 修复、31 tests 与新 Proxy image | Runtime Passed（handler/route + build/assets only） |
| [Task 4 三客户端 Compose/bootstrap](reproduction/2026-08-11-task4-three-client-compose-bootstrap-passed.md) | active Compose、三 owner/outsider、严格 binding/bundle 边界、CLI image 与 Pi RED 链 | Runtime Passed（client build/config assets only） |
| [Task 5 Proxy privacy hardening RED](reproduction/2026-08-11-task5-proxy-privacy-hardening-red.md) | upstream header/credential、telemetry sink 与 active diagnostics 产品缺陷 | Failed / Reproduced；修复前不可变证据 |
| [Task 5 Proxy privacy/build Passed](reproduction/2026-08-11-task5-proxy-privacy-build-passed.md) | 产品 113 tests、独立 review、唯一 Proxy build/assets 与 root harness | Runtime Passed（product tests + build/assets only）/ Static contract Passed；business Not Run |
| [Task 5 pre-runtime round 1 erratum/RED](reproduction/2026-08-11-task5-pre-runtime-review-round1-erratum.md) | 七项 root contract 缺口与跨 identity terminal L1 风险 | Failed / Reproduced；收窄旧 harness 证明范围 |
| [Task 5 pre-runtime root static Passed + round 2 erratum](reproduction/2026-08-11-task5-pre-runtime-review-round1-root-static-passed.md) | epoch/oracle/outsider 与 project freshness/evidence ownership 合同；149 tests | Static/contract Passed；产品修复/rebuild/scoped re-review 与 business runtime Pending |
| [Task 5 session-identity root integration/build Passed](reproduction/2026-08-11-task5-session-identity-root-integration-build-passed.md) | reviewed product fix、exact gitlink/Proxy pin、launcher key 与四镜像 rebuild | Product/root tests + build/assets Passed；business runtime Not Run；gitlink local-only |
| [Task 5 deterministic Mock preflight-7c1a9e2b Blocked](reproduction/2026-08-11-task5-mock-20260811-preflight-7c1a9e2b-blocked.md) | 固定 17 步 launcher、失败后的精确 project 状态与保留现场 | Blocked；launcher step 未披露；无 evidence 文件；TUI/real Not Run |
| [Task 5 deterministic Mock fixed-8d4802d5 protocol/leak Blocked](reproduction/2026-08-11-task5-mock-20260811-fixed-8d4802d5-protocol-leak-blocked.md) | 第 6 步的 401 脱敏诊断与静态 auth root cause | Blocked；24 cases/management/headless/final 未验证；TUI/real Not Run |
| [Task 5 auth service-token replacement image Passed](reproduction/2026-08-11-task5-auth-service-token-replacement-image-passed.md) | 产品 TDD/review、唯一 replacement Proxy build、离线 image/full tests 与 active root pin | Replacement image Ready；deterministic Mock rerun Not Run |
| [Task 5 deterministic Mock authfix-2eae9df1 tool fixture Blocked](reproduction/2026-08-11-task5-mock-20260811-authfix-2eae9df1-tool-fixture-blocked.md) | step 6 的 tool fixture 脱敏观测与静态 root cause | Blocked；24-case protocol/leak Failed；management/headless/final/TUI/real Not Run |
| [Task 5 tools fixture replacement build/assets Passed](reproduction/2026-08-11-task5-tools-fixture-replacement-build-passed.md) | Mock fixture TDD/review、唯一 tools build 与 image contract | Replacement Ready；全新 deterministic Mock rerun Not Run |
| [Task 5 deterministic Mock toolsfix-7e1031af Claude write Blocked](reproduction/2026-08-11-task5-mock-20260811-toolsfix-7e1031af-claude-write-blocked.md) | formal run 的 step 8 fail-stop 与 Claude 路径脱敏边界 | Blocked；protocol 24/24、management ok；后续写/读/final/TUI/real Not Run |
| [Task 5 Claude -p diagnostic 6d6e9f6a Ready](reproduction/2026-08-11-task5-diag-claude-p-20260811-6d6e9f6a-ready.md) | 单次、脱敏、最小 Claude write 诊断的固定 preflight | Ready；diagnostic write/runtime/TUI/real Not Run |
| [Task 5 Claude -p diagnostic 6d6e9f6a Blocked](reproduction/2026-08-11-task5-diag-claude-p-20260811-6d6e9f6a-blocked.md) | JSON schema 已验证但 classification forwarding 不可恢复 | Blocked；新 tuple/direct parser 诊断待执行；TUI/real Not Run |
| [Task 5 Claude -p diagnostic 08c403c6 Ready](reproduction/2026-08-11-task5-diag-claude-p-20260811-08c403c6-ready.md) | 新 tuple、direct structured JSON parser 的固定 preflight | Ready；diagnostic write/runtime/TUI/real Not Run |
| [Task 5 Claude -p diagnostic 08c403c6 Blocked during Compose up](reproduction/2026-08-11-task5-diag-claude-p-20260811-08c403c6-host-timeout-during-up-blocked.md) | 首个 workload attempt 的宿主 1 秒 timeout 与精确盘点 | Blocked；bootstrap/config/headless 未执行；新 tuple 待执行 |
| [Task 5 Claude -p diagnostic a72ae725 Ready](reproduction/2026-08-11-task5-diag-claude-p-20260811-a72ae725-ready.md) | 新唯一 tuple 的 freshness 与 diagnostic overlay preflight | Ready/Not Run；仅一次 long-lived async/direct-parser diagnostic 待授权 |
| [Task 5 Claude -p diagnostic a72ae725 Blocked during Compose up](reproduction/2026-08-11-task5-diag-claude-p-20260811-a72ae725-host-native-stderr-during-up-blocked.md) | 单次 workload attempt 的 host native-stderr 中止与精确盘点 | Blocked；bootstrap/config/headless/JSON/classification 未执行；新 tuple 待 TDD |
| [Task 5 Claude -p diagnostic 7186820a Ready](reproduction/2026-08-12-task5-diag-claude-p-20260812-7186820a-ready.md) | 新 tuple、tracked coordinator TDD/review 与 freshness/overlay preflight | Ready/Not Run；仅一次 fixed runtime/canonical JSON diagnostic 待授权 |
| [Task 5 Claude -p diagnostic 7186820a Blocked before Mock](reproduction/2026-08-12-task5-diag-claude-p-20260812-7186820a-claude-cli-nonzero-before-mock-blocked.md) | canonical result 的 Claude child pre-Mock nonzero 边界 | Blocked；不区分 settings/CLI/auth/onboarding/capture/Proxy-before-Mock；新 tuple 待 TDD |
| [Task 5 Claude -p diagnostic 7186820a exact cleanup Passed](reproduction/2026-08-12-task5-diag-claude-p-20260812-7186820a-exact-cleanup-passed.md) | 仅清理该 project 的 containers/network/volumes，保留 host evidence/images | Runtime Cleanup Passed；业务 Gate 仍 Blocked；bounded classifier 已 TDD、待复审/新 tuple |
| [Task 5 Claude classifier replacement image Passed](reproduction/2026-08-12-task5-claude-classifier-image-build-passed.md) | timeout/官方错误分类 TDD、单次 Claude build、离线 assets 与 exact digest pin | Build/Assets Passed；follow-up 独立复审受额度限制；新 diagnostic tuple Not Run |
| [Task 5 Claude -p diagnostic 92204e33 Ready](reproduction/2026-08-12-task5-diag-claude-p-20260812-92204e33-ready.md) | replacement classifier image 后的新唯一 tuple 与 freshness/overlay/coordinator preflight | Ready/Not Run；仅一次 canonical 18-key diagnostic 待执行 |
| [Task 5 Claude -p diagnostic 92204e33 CLI unknown before Mock](reproduction/2026-08-12-task5-diag-claude-p-20260812-92204e33-cli-unknown-before-mock-blocked.md) | canonical 18-key 的 child nonzero、bounded output、Proxy DNS/TCP 与 zero Mock delta | Blocked；category unknown；禁止 raw-log 推断或复用 tuple |
| [Task 5 Claude -p diagnostic 92204e33 exact cleanup Passed](reproduction/2026-08-12-task5-diag-claude-p-20260812-92204e33-exact-cleanup-passed.md) | exact project profiles cleanup 与独立资源复查 | Runtime Cleanup Passed；5/1/9 → 0/0/0；active images retained |
| [Task 5 Claude EROFS classifier/tmpfs fix Passed](reproduction/2026-08-12-task5-claude-erofs-tmpfs-fix-passed.md) | binary/source root cause、RED→GREEN、单次 image build、exact pin 与 hardened tmpfs runtime probe | TDD/Build/Runtime Asset Passed；business diagnostic Not Run |
| [Task 5 Claude -p diagnostic 113ca669 Ready](reproduction/2026-08-12-task5-diag-claude-p-20260812-113ca669-ready.md) | EROFS/tmpfs fix 后的新 tuple freshness、image/tmpfs/overlay/coordinator preflight | Ready/Not Run；仅一次 canonical diagnostic 待执行 |
| [Legacy Docker 运行资源精确清理](reproduction/2026-08-10-legacy-docker-resources-cleanup.md) | 旧 Compose projects、容器、网络、卷和镜像的不可恢复清理审计 | Runtime Cleanup Passed；不改变四 CLI 业务 Gate |
| [集成实验 SOP](../tests/integration/README.md) | 后续静态验证与受控运行入口 | EROFS/tmpfs fix + image Ready；113ca669 diagnostic Ready/Not Run |

建议阅读顺序：先读 [负责人思想](repo-author-comment/comment.md)，再读当前评估和本轮 ADR/reproduction；需要执行实验时才读 SOP 及相应产品源码/测试。负责人思想与企业设计草案分别位于 `repo-author-comment/` 和 [design/2026-08-06-enterprise-memory-design.md](design/2026-08-06-enterprise-memory-design.md)，不能当作本机运行证明。

## Legacy：Windows + Claude 路线

`specs/`、早期 `superpowers/` 计划、既有 `decisions/` 与 `reproduction/` 完整保留为 Legacy 历史。特别是 2026-08-09 至 2026-08-10 的 Docker/Windows Claude 记录只能说明其各自的旧 run，不能升级为 Claude/OpenCode/Pi/Codex 四 CLI 的通过证据。需要追溯时，从 [旧 standalone Gate ADR](decisions/2026-08-09-standalone-memory-gate.md) 和 [旧 Docker 运行记录](reproduction/2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md) 开始，并保持其原文结论。

2026-08-10 经负责人明确授权，旧路线的 3 个 Compose project、20 个容器、4 个网络、27 个卷和旧镜像候选已完成[精确清理](reproduction/2026-08-10-legacy-docker-resources-cleanup.md)。历史文档和 Git ref 仍可追溯，但旧 `main` 的 `fork-69fd8b` 栈不能再依赖原有 runtime resources 原样启动。

历史 public fork 修复 ref 为 `codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c`；它仅存在于当前本地对象库，尚未 push，fresh clone 不可取得，未经授权不得 push。跨 clone 可重建保全需要 push 或外部归档授权，在此之前仍未完成；它不是 active upstream 基线。

## 其他资料

| 目录 | 内容 | 使用边界 |
| --- | --- | --- |
| `reference/` | 参考项目架构分析 | 调研输入，非当前产品行为 |
| `exa-results/`、`firecrawl-results/`、`GPT/`、`kaer-AI-wozi/` | 外部调研与评审 | 引用前重新核验时效性与来源 |
| `design/` | 企业方案设计草案 | 受负责人思想约束，待评审 |
| `specs/`、`superpowers/specs/` | 规格与验收合同 | 旧状态可能是历史快照 |
| `superpowers/plans/` | 实施计划 | 计划不等于完成；本轮只以 2026-08-10 四 CLI 计划为 active |
| `decisions/` | ADR 决策史 | append-only；不覆写旧决策 |
| `reproduction/` | 运行与静态证据 | append-only；后续成功不覆盖早期失败 |
