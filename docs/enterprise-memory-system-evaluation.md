# 企业智能体记忆系统评估

## 结论

当前 active 目标是四 Docker CLI 共享记忆实验。Task 5 的 Proxy→Core auth service-token、Mock fixture 与 Claude EROFS/tmpfs 缺口均已完成 TDD、固定 replacement images 与 scoped review。全新 `113ca669` 单次 diagnostic 已 Runtime Passed：Claude exit0、Proxy DNS/TCP true、Mock 精确一个 expected main request、operation/path/marker 有效，且无额外请求、泄漏、丢弃或截断；该 project 已 exact cleanup 5/1/9 → `0/0/0`。当前下一 Gate 为 **完整 deterministic Mock Ready / Not Run**。三写六读、final、三个正式 headless、TUI 与真实 API/模型仍为 **Not Run**。

旧 Windows 原生 Claude + Docker Claude 证据一律是 **Legacy**：保留原文供追溯，但不用于推断新的四 CLI 架构已通过。

2026-08-10 经负责人明确授权，Legacy 路线的 3 个 Compose project、20 个容器、4 个网络、27 个卷和 6 个旧镜像候选已完成精确清理。旧 runtime resources 与卷内容不可恢复；Git ref、ADR 和 reproduction 仍保留历史可追溯性。该清理不改变四 CLI 服务、Mock、真实 API、TUI 和跨客户端业务流的 `Not Run` 状态。

## 固定事实

| 项目 | 值 | 证据边界 |
| --- | --- | --- |
| Tencent upstream base | default `feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1` | Task 2 的 pristine RED/基线；upstream 前移前必须审查 |
| Tencent committed source | `codex/four-agent-memory-upstream@9e456a5b7bb47ae40596237d0f0b87c1edfc098f` | 当前根 gitlink；auth service-token fix review CLEAN；local-only，origin 仍为 `38ced16...`，fresh clone 暂不可取得 |
| Fixed images | Core `sha256:fded9d48...`；Proxy `sha256:55fedae3...`；Hub `sha256:a6037724...`；tools `sha256:8ca1a2a8...` | replacement Proxy/tools images Ready；formal run 已到 step 8 后 Blocked，后续业务 Not Run |
| Container user metadata | Core/Hub root-default（UID 0）；Proxy `app`（UID 10001） | source-build evidence；本轮不扩大为权限改造 |
| Legacy preservation | `codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c` | local-only、未 push；fresh clone 不可取得，未经授权不得 push；跨 clone 可重建保全仍未完成 |
| Legacy runtime lifecycle | 3 projects / 20 containers / 4 networks / 27 volumes / 6 image candidates absent | 2026-08-10 Runtime Cleanup Passed；旧栈需从 Git 历史重新构建并创建新资源 |
| Claude Code | `2.1.226` / image `sha256:261a917376f791d9b5e092040c2f488f23588b7103a27606226426f273b040dd` | EROFS classifier、version/help、UID10001、host/image hash/export、64MiB hardened tmpfs runtime probe Passed；diagnostic/TUI Not Run |
| OpenCode | `1.18.16` / image `sha256:42bc38ead4c3de8ecd75152eeffe23f10f81c580d00e8a816e7b657cf7c57e9b` | rebuild、version/help、UID 10001、evidence ownership/writability、headless assets Passed；prompt/TUI Not Run |
| Pi | `0.84.1` / image `sha256:56582fd216db259342f4414ebdc6c9c9188229678d77eb2f360959c9af2e4538` | rebuild、version/help、UID 10001、evidence ownership/writability、headless assets Passed；prompt/TUI Not Run |
| Codex | `0.147.0` | 固定版本；Not Run |

## 架构与阶段

```mermaid
flowchart LR
  subgraph DP["Client data plane"]
    C["Claude Code"] --> P["MemoryProxy"]
    O["OpenCode"] --> P
    I["Pi"] --> P
    X["Codex - Stage 2"] --> P
  end
  P --> K["MemoryCore"]
  subgraph MP["Management plane"]
    H["Memory Hub (Panel / Knowledge)"]
  end
  H --> K
  K --> T["Explicit team-visible memory"]
```

- **Fact**：Stage 1 使用 Claude Code、OpenCode、Pi；它们分别经 `/claude-code/<space>/v1/messages`、`/opencode/<space>/v1/messages`、`/pi/<space>/v1/messages` 接入，不能伪造平台身份。
- **Fact**：Stage 2 才增加 Codex 的 `/codex/<space>/v1/responses` 契约。
- **Fact**：每个客户端的 Memory user、Agent、Session、user key、home、workspace 和 evidence 必须彼此独立；共享只限相同 Team/Task 内显式 team-visible memory。
- **Recommendation**：先在 deterministic Mock 下验证真实 source、身份、共享、隔离、header/credential hygiene 和客户端卷隔离，再考虑真实模型。

## 状态矩阵

| Gate | 状态 | 说明 |
| --- | --- | --- |
| Task 1 历史保全、active docs、gitlink | Static baseline | 本轮文档/指针工作；不是服务运行 |
| Stage 1 upstream source-build | Runtime Passed | 全部 tracked/image shell、Core/Proxy 新构建与必要 runtime assets Passed；Hub 保持原 Passed 镜像；不等于服务/业务 Runtime Passed |
| Stage 1 Claude/OpenCode/Pi 原生路由 | Runtime Passed | Task 3 route 证据保持；active product auth fix 的 fresh full 为 38/38 suites / 276/276 tests，仍不等于服务/客户端业务流 Passed |
| Stage 1 client Compose/bootstrap/config/images | Runtime Passed | tools 与三 client 串行各 build 一次；version/help、UID 10001、evidence ownership/writability、headless assets；仅 client build/config assets |
| Stage 1 Task 5 root harness | Static/contract Passed | root Node 152/152 与 Compose config 7/7；fixture array text-block 识别的 RED→GREEN、固定 epoch/path、strict fixture、逐 operation oracle、outsider、exact project freshness、run/build/evidence 与 request-local credential 合同，不是业务运行 |
| Stage 1 Proxy privacy/build | Runtime Passed | reviewed `9e456a5` auth service-token fix、38/38 suites / 276/276 tests、exact six baseline typecheck errors、Proxy `sha256:55fedae3...`；replacement image Ready，product tests + build/assets only |
| Stage 1 Mock identity/share/isolation/leak | Ready / full Mock Not Run | `113ca669` single Claude diagnostic Passed 并 exact cleanup；Claude write main delta1、operation/path/marker valid、unsafe/dropped/truncated false。完整 17-step Mock 尚未运行 |
| Stage 1 TUI | Not Run | 仅在 headless Gate 通过后由用户确认 |
| Stage 1 真实模型 | Not Run | 需完整 Mock Gate 与明确授权 |
| Stage 2 Codex Responses | Not Run | 在 Stage 1 后执行 |
| Legacy Windows + Claude runs | Legacy | 历史证据，不进入本矩阵的通过计数 |

## 风险与控制

| 风险 | 控制 |
| --- | --- |
| 将 legacy 运行扩大为新架构通过 | active 入口、ADR 与 reproduction 显式标为 Legacy / Not Run |
| 清理后误认为旧栈仍可原样复现 | 精确清理记录固定销毁范围；历史可追溯不等于 runtime resources 可恢复 |
| 平台身份伪造或跨客户端泄漏 | literal route-bound source；unknown/unbound/conflict/missing/invalid fail closed；独立 identity/key/home/workspace/evidence |
| 凭证扩散 | 模型 key 只在服务端；不读取/记录 `.env`、settings、secret、home 或 runtime 原文 |
| 上游 SHA 或修复边界漂移 | upstream base 固定 `0a568c3`，active gitlink 固定 `9e456a5`；该提交 local-only 且 origin 仍为 `38ced16`，前移/发布必须单独授权 |
| privacy 结论越过已测范围 | header allowlist、credential origin/redirect、结构化 sink 与 active/auxiliary/injection diagnostics 已有产品测试；live Proxy→Mock、真实 CLI 与脱敏 evidence chain 仍 Not Run，不能扩写为端到端通过 |
| terminal session cache 跨 identity 复用 | reviewed full-identity key/validation 修复与替代 Proxy 已通过限定 product/build Gate；root launcher 从私有 bundle 覆盖 request-local key；live forged outsider oracle 仍必须在 Mock runtime 复验 |
| Windows EOL 或硬编码 Shell Gate 漏检 runtime asset | 动态枚举全部 tracked `*.sh`，并递归验证镜像内全部 `*.sh` 无 CR 且 `bash -n` Passed |
| producer 部分输出后 nonzero 被误判完整枚举 | 先写临时 NUL manifest 并显式检查 producer 成功，再由主 shell 读取；失败输出固定且不消费 partial manifest |
| Core/Hub root-default 扩大权限面 | 当前只如实记录 UID 0；后续权限改造必须另立设计与行为 Gate，不能混入 source-build 证明 |
| 付费或破坏性操作越权 | 未经明确授权不得做真实 API、push、PR、remote 修改、prune 或 `down -v` |

## 下一 Gate

[113ca669 diagnostic Passed](reproduction/2026-08-12-task5-diag-claude-p-20260812-113ca669-passed.md) 与 [exact cleanup](reproduction/2026-08-12-task5-diag-claude-p-20260812-113ca669-exact-cleanup-passed.md) 已归档。下一 Gate 是全新唯一 tuple 的 tracked 17-step deterministic Mock launcher：protocol/leak 24 cases → management/outsider → 三次 write → 六次 ordered cross-owner read → final oracle。不得复用 diagnostic project，不 build、retry、TUI 或真实模型；失败必须 fail-stop 并另增 reproduction，成功 project 则保留到 scoped review 与用户 TUI 决策。真实 API、TUI 与 Codex Stage 2 仍为 Not Run。active gitlink 在获得独立 push/归档授权前仍无法由 fresh clone 获取。
