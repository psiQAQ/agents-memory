# 四 Docker CLI 集成实验 SOP

本目录是根仓库的跨仓库集成层；Tencent 产品源码、构建修复与产品测试在 `submodules/TencentDB-Agent-Memory` 的独立 worktree 完成。

## 当前边界

**Fact**：upstream base 锁定 `feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1`，active fork/gitlink 为 reviewed Task 5 auth service-token fix `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`。该 commit 是 local-only；`origin/codex/four-agent-memory-upstream` 仍为 `38ced16f46fed640bcb7360fb1ca45f9f9918628`，未经单独授权不得 push，fresh clone 暂不可取得。Stage 1 是 Claude Code `2.1.226`、OpenCode `1.18.16`、Pi `0.84.1`，Stage 2 是 Codex `0.147.0`。

**Fact**：Task 5 auth service-token fix、root `bfb3839a` tools fixture fix 与 Proxy/tools replacement images 均为 Ready（build/assets only）。历史 [preflight Blocked](../../docs/reproduction/2026-08-11-task5-mock-20260811-preflight-7c1a9e2b-blocked.md)、[protocol/leak Blocked](../../docs/reproduction/2026-08-11-task5-mock-20260811-fixed-8d4802d5-protocol-leak-blocked.md)、[authfix fixture Blocked](../../docs/reproduction/2026-08-11-task5-mock-20260811-authfix-2eae9df1-tool-fixture-blocked.md)、[toolsfix Claude write Blocked](../../docs/reproduction/2026-08-11-task5-mock-20260811-toolsfix-7e1031af-claude-write-blocked.md) 与 [Claude diagnostic forwarding-filter Blocked](../../docs/reproduction/2026-08-11-task5-diag-claude-p-20260811-6d6e9f6a-blocked.md) 继续 append-only。最后一个 diagnostic 的 JSON keys/types/enums 已验证，但 classification values 被错误转义的 outer allowlist regex 过滤，进程结束后不可恢复；状态为 **Blocked / classification-forwarding-filter**，不得声明 exit/throw/root cause。下一步是新 tuple/direct structured JSON parser；后续两写、六读、final、真实 headless、TUI 与真实/Paid 模型均为 Not Run。既有 Windows + Claude 命令、Compose 路径和运行证据是 Legacy，不能直接复用到四 CLI 路线。

**Fact**：legacy ref `codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 是 local-only、未 push；fresh clone 不可取得，未经授权不得 push。跨 clone 可重建保全需要 push 或外部归档授权，在此之前仍未完成。

**Constraint**：不得读取/复制/输出 Tencent `.env`、settings、secret、home、`.runtime/` 或原始 evidence。未经明确授权，不运行 Docker workload、真实 API、push、PR、remote 修改、`down -v` 或 prune。

## 静态验证

在根仓库执行完整 Node suite；当前预期为 151/151。它只验证当前根集成契约，不能证明 active Docker 业务流：

```powershell
node --test tests/integration/test/*.test.mjs
```

本轮文档完成前还应检查 Markdown 相对链接、UTF-8 无 BOM/LF、secret shape、gitlink 和两个 Tencent worktree 状态。检查不得读取任何 secret 内容。

active Compose 静态入口固定为 `compose.four-cli.yaml` 加所需 overlay；旧 `compose.yaml` 只作为 Legacy Node fixture。Task 4 的完整 profile matrix 可用以下只读命令复验：

```powershell
$base = 'tests/integration/compose.four-cli.yaml'
$env:MEMORY_CORE_GATEWAY_API_KEY = 'task4-static-gateway-key'
$env:RUN_ID = 'task5-static'
$env:COMPOSE_PROJECT_NAME = 'refine-memory-task5-static'
$env:EVIDENCE_DIR = [System.IO.Path]::GetFullPath((Join-Path $PWD '.runtime\static\task5-static'))
try {
  docker compose -f $base config --format json | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Compose config failed: base' }
  foreach ($profile in @('mock', 'real', 'claude', 'opencode', 'pi', 'management')) {
    docker compose --profile $profile -f $base `
      -f "tests/integration/compose.four-cli.$profile.yaml" config --format json | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Compose config failed: $profile" }
  }
} finally {
  Remove-Item Env:MEMORY_CORE_GATEWAY_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_ID -ErrorAction SilentlyContinue
  Remove-Item Env:COMPOSE_PROJECT_NAME -ErrorAction SilentlyContinue
  Remove-Item Env:EVIDENCE_DIR -ErrorAction SilentlyContinue
}
```

`task4-static-gateway-key` 只是 Compose config/Mock 的 disposable non-LLM gateway 值，不是模型 key，不得在 Paid Gate 中复用。

## Task 2 source-build 结果

| 组件 | 固定镜像 | 结果边界 |
| --- | --- | --- |
| Core | `local/refine-memory-core:49c4536-fix1@sha256:fded9d48d76bf71d0652023be0e9aa5553d46c039cc04ace0ec7c1e370f95d44` | 新唯一 tracked-only context；4 个 runtime shell、`node:sqlite`、`sqlite-vec`、jieba Passed；root-default |
| Proxy | `local/refine-memory-proxy:49c4536-fix1@sha256:14acf3c7d04b1b701159193b79e9989656f83d0ad24018cafcb37c1c171468aa` | 新唯一 official public context；6 个 runtime shell、`better-sqlite3`、`node-pty`、stub fallback Passed；UID 10001 |
| Hub | `local/refine-memory-hub:0a568c3-task2@sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4` | 本轮未重建；combined context、Knowledge SQLite、Panel/Knowledge runtime assets Passed；root-default |

完整 RED→GREEN、image ID/digest、warning 与限制见 [Task 2 reproduction 索引](../../docs/README.md)。Shell Gate 必须动态枚举产品全部 tracked `*.sh`，producer 必须在完整 NUL manifest 写入并成功后才允许主 shell 读取；随后递归验证镜像内全部 `*.sh` 无 CR 且 `bash -n` Passed。不得退回 process substitution 或硬编码脚本清单。旧 Core `sha256:063e247...` 与旧 Proxy `sha256:394101...` 已 supersede。round 2 不改镜像输入，表中的 round 1 IDs 继续有效。这些镜像不能当作服务健康或业务流通过证明；后续任务不得覆盖本轮失败 context 或用浮动 tag 替换固定证据。

## Task 3 原生 Anthropic route 结果

| 平台 | 固定 route | 已验证边界 |
| --- | --- | --- |
| Claude Code | `/claude-code/<space>/v1/messages`<br>`/claude-code/<space>/v1/messages/count_tokens` | literal `claude-code` binding；UUID session 正例；agent upstream URL/key |
| OpenCode | `/opencode/<space>/v1/messages`<br>`/opencode/<space>/v1/messages/count_tokens` | literal `opencode` binding；`ses_*` 正例；session/Core source 保真；agent upstream URL/key |
| Pi | `/pi/<space>/v1/messages`<br>`/pi/<space>/v1/messages/count_tokens` | literal `pi` binding；`urn:uuid:a:b` 正例；session/Core source 保真；agent upstream URL/key |

Messages 的 unknown/unbound/path-source conflict、缺失 session、非法字符、`..` 与超过 256 字符均必须在 auth、body parse、Core/store/upstream 前拒绝；`count_tokens` 的 unknown/unbound/conflict 必须在 auth、body、upstream、credit 前拒绝。不得新增 source header，不得把 OpenCode/Pi 映射为 Claude Code，也不得让最终 OpenAI `POST /*` catch-all 接走 unknown Anthropic-style route。OpenCode/Pi session-init 在 Anthropic protocol 下只把 context 追加到顶层 `system`，不得产生 `messages[].role=system`；OpenAI CodeBuddy 行为保持。

Task 3 review-fix 固定 Proxy 为 `local/refine-memory-proxy:0bba4d7-task3-fix1@sha256:88a350e44c0e04bec0632034a4dfb437904dc4da6471fa9957ebb9dbaa86f66c`；official public context、31/31 tests、privacy focused、6 个 runtime shell、SQLite 3.49.2、node-pty、stub fallback 与 UID 10001 Passed。完整证据见 [review RED/erratum](../../docs/reproduction/2026-08-11-task3-review-fix-round1-erratum.md) 与 [review fix Passed](../../docs/reproduction/2026-08-11-task3-review-fix-round1-passed.md)。选定共享 SessionStore/recovery/capability console 已通过 sentinel Gate；当时后置的结构化 sinks、upstream headers 与 active diagnostics 已由下方 Task 5 产品级 Gate 覆盖，但 live stack/evidence chain 仍 Not Run。deprecated `/claude-code/v1/messages` 固定 404 的 Minor 已 deferred。该结果仍不授权启动业务栈或真实 API。

## Task 4 三客户端 Compose/bootstrap 结果

tracked manifest 只定义 `claude`、`opencode`、`pi`；`ACTIVE_CLIENTS` 必须无重复、只含 allowlist，且 Task 4 Gate 要求三者齐全。bootstrap 为每位 owner 创建独立 user/Agent/Session/key，并共用一个 Team/Task；三个 owner Chat Memory 都设为 team-visible，每个 Agent 固定绑定另外两位 owner，共六条 cross-owner binding。synthetic outsider 使用独立 Team/Task，不创建 CLI，也不接收 shared binding。

client 容器只挂自己的 home/workspace，不挂 bootstrap-state、模型 key 或 Docker socket。Claude、OpenCode、Pi 分别固定 route `/claude-code/<space>`、`/opencode/<space>/v1`、`/pi/<space>`；不增加 source header。management overlay 只把 Panel `8125` 发布到 `127.0.0.1`，Knowledge `8424` 只在 internal network 暴露。

| Client | 固定 image ID | 已验证边界 |
| --- | --- | --- |
| Claude Code `2.1.226` | `sha256:8da31af44b686f44b3595e2d392d69c113ed26a35c781bfea39a276e6f271dbb` | rebuild、version/help、UID 10001、evidence ownership/writability、headless assets |
| OpenCode `1.18.16` | `sha256:42bc38ead4c3de8ecd75152eeffe23f10f81c580d00e8a816e7b657cf7c57e9b` | rebuild、version/help、UID 10001、evidence ownership/writability、headless assets |
| Pi `0.84.1` | `sha256:56582fd216db259342f4414ebdc6c9c9188229678d77eb2f360959c9af2e4538` | rebuild、version/help、UID 10001、evidence ownership/writability、headless assets |

formal review 后，bootstrap 在发布 private/public artifact 前验证三 owner 的 user/key/Agent/Session/asset cardinality、outsider 身份与 Team/Task 隔离，并逐字段验证六条新增 binding 且保留全部既有 binding。renderer/launcher 只读取对应 home 的 `.memory/agent-bundle.json`，逐级拒绝 home/`.memory` symlink、junction 或非目录，并拒绝 linked final file。先前 review 的 Mock runtime config、只读挂载、healthy 依赖、config-dir no-follow 与固定 `node:22-bookworm-slim@sha256:d649c27...` 保持。`real` overlay 在 Task 4 仍只是 profile/config 静态入口，不含 `.env`/Paid launcher，不可当作 Task 6 运行 SOP。完整 RED 链与命令见 [Task 4 reproduction](../../docs/reproduction/2026-08-11-task4-three-client-compose-bootstrap-passed.md)。这些结果不证明 CLI prompt、服务健康、Mock 共享/ACL/leak、管理 CRUD、TUI 或真实 API。

## Task 5 harness 与 Proxy privacy/build 结果

初始 harness commits `5bb2d65`、`a10e825`、`a2ed161`、`4cae880` 之后，pre-runtime round 1 以 `192f81b`、`a1e91fd`、`99a9964`、`d4894df`、`4f751df` 收紧主要 deterministic contracts；formal review 的 I6/I7 round 2 再补齐以下 project freshness 与 evidence ownership 边界：

- 三个平台各 8 类 Anthropic fixture：text、SSE stream、tool、count、400、429、500、timeout；content-type、完整 JSON/SSE 事件顺序、usage/error/tool/count shape 与内存 sensitive scan 全部固定。Mock 每次 reset 生成新 epoch，以单调 sequence、per-path count/sequence/marker 和 sticky dropped/truncated/leak flags 保存 bounded redacted aggregate。
- 三次顺序写入必须由 Core L0 后 L1 oracle 精确核对 owner/Team/Agent/Task/Session/role；六次读取按固定顺序逐 operation 核对 reader tuple，read prompt 不含目标 owner marker，模型自然语言回复不能作为证明。final 只接受同 epoch 精确三写六读 `/anthropic/v1/messages` 主请求，拒绝额外/错 path/乱序/dropped/sticky operation。
- outsider 的 accessible asset、ACL、binding mutation 与 forged Proxy identity 分别由同 epoch all-model delta 0 包围；forged 请求使用 outsider key 与完整 victim source/team/agent/task/session，只接受 403/409。合法 outsider own request 必须 all-model delta 1 且不能命中 owner marker。
- management Gate 核对 users、teams/members、agents、tasks、assets、bindings、ACL、Panel；Panel 只在 `127.0.0.1` 发布，Knowledge 不发布宿主端口。
- 三个 CLI 的非交互 argv、独立 writable home/workspace/credential/evidence volumes 和原子 0600 脱敏 evidence shape 均由测试固定，不接受 ambient command/options。headless stdout/stderr 只做 bounded in-memory scan，不继承或持久化；TUI 仍保留 interactive stdio。
- runtime Compose 不含 `build:`；build-only overlay 明确覆盖 bootstrap 与三客户端。`RUN_ID`、`COMPOSE_PROJECT_NAME`、`EVIDENCE_DIR` 必填，project 必须精确为 `refine-memory-${RUN_ID}`。host launcher 先对 container/network/volume 执行 exact Compose-project label freshness probe，再执行固定 17 步 `--no-build` 流程；任一探针或步骤失败立即停止。
- 三个 active client Dockerfile 在 `USER agent` 前创建 `/client-evidence` 并归属 10001:10001；headless 仍以 `10001:10001` 运行且三个 evidence named volume 彼此独立。三镜像已验证该目录归属与 UID10001 写入；named volume 的业务流使用仍为 Not Run。
- launcher 删除继承的所有私有 identity/key 变量，再从选定 private bundle 的同一 `memory_user_key` 设置 `MEMORY_USER_KEY` 与 product-required request-local `TDAI_MEMORY_USER_KEY`；值不进入 Compose、prompt、cache、log、evidence 或 tracked file。

Root full Node 为 152/152，base + `mock`、`real`、`claude`、`opencode`、`pi`、`management` Compose config 为 7/7。fixture fix 的 mock `8/9` RED→`9/9` GREEN、runner `43/43` 与 root 静态合同均为 **Passed**。

产品 auth service-token fix 固定为 `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`；focused `3/3`、fresh full `38/38` suites / `276/276` tests、typecheck exact six baseline errors与最终 review `CLEAN`。Compose 固定使用 `local/refine-memory-proxy:9e456a5-auth-fix@sha256:55fedae3f6a3a0a45ac8be45461d8cab23c52f11cc089c1c1e54c7d236de764b`；replacement image 已完成唯一 build、离线 tests/assets 与 root exact pin，状态为 **Ready（build/assets only）**。旧 image 只保留历史证据，不得进入新的 Task 5 runtime。

完整前置链见 [privacy/build Passed](../../docs/reproduction/2026-08-11-task5-proxy-privacy-build-passed.md)、[pre-runtime round 1 erratum/RED](../../docs/reproduction/2026-08-11-task5-pre-runtime-review-round1-erratum.md)、[root static Passed](../../docs/reproduction/2026-08-11-task5-pre-runtime-review-round1-root-static-passed.md)、[preflight Blocked](../../docs/reproduction/2026-08-11-task5-mock-20260811-preflight-7c1a9e2b-blocked.md)、[protocol/leak Blocked](../../docs/reproduction/2026-08-11-task5-mock-20260811-fixed-8d4802d5-protocol-leak-blocked.md)、[authfix fixture Blocked](../../docs/reproduction/2026-08-11-task5-mock-20260811-authfix-2eae9df1-tool-fixture-blocked.md)、[toolsfix Claude write Blocked](../../docs/reproduction/2026-08-11-task5-mock-20260811-toolsfix-7e1031af-claude-write-blocked.md)、[diagnostic forwarding-filter Blocked](../../docs/reproduction/2026-08-11-task5-diag-claude-p-20260811-6d6e9f6a-blocked.md)、[auth replacement image Passed](../../docs/reproduction/2026-08-11-task5-auth-service-token-replacement-image-passed.md) 与 [tools replacement build Passed](../../docs/reproduction/2026-08-11-task5-tools-fixture-replacement-build-passed.md)。下一 Gate 为新 tuple/direct structured JSON parser 的 Claude write diagnostic；不得从当前 diagnostic 推断 exit/throw/root cause，不重跑/TUI/real。

## Task 5 Mock runtime 启动器（diagnostic forwarding-filter Blocked）

历史固定 run `task5-mock-20260811-preflight-7c1a9e2b`、`task5-mock-20260811-fixed-8d4802d5`、`task5-mock-20260811-authfix-2eae9df1`、`task5-mock-20260811-toolsfix-7e1031af` 与 diagnostic `task5-diag-claude-p-20260811-6d6e9f6a` 均保持 append-only Blocked。最后一个 diagnostic 的 JSON keys/types/enums 已验证，但 outer allowlist regex 转义错误过滤 classification values，进程结束后不可恢复；不得将它写为 exit/throw/root cause。当前 project 按授权精确 cleanup，host evidence 保留；下一 Gate 是新 tuple/direct parser 的最小无 secret Claude write diagnostic，不重跑/TUI/real。

启动器不读取 Tencent `.env`、模型 key、settings、home 或旧 evidence；它只运行固定的 Mock 顺序，不接受任意命令，也不会执行 build、`down`、`down -v` 或 prune。以下命令保留为合同参考，不得用于覆盖或复用上述失败 tuple。

`COMPOSE_PROJECT_NAME` 必须由 launcher 验证为 `refine-memory-${RUN_ID}`，不能复用无关 project 名。创建 evidence 目录或执行首个 Compose step 前，launcher 内部实际执行以下只读探针：

```powershell
docker container ls --all --quiet --filter "label=com.docker.compose.project=$env:COMPOSE_PROJECT_NAME"
docker network ls --quiet --filter "label=com.docker.compose.project=$env:COMPOSE_PROJECT_NAME"
docker volume ls --quiet --filter "label=com.docker.compose.project=$env:COMPOSE_PROJECT_NAME"
```

任一命令非零或输出非空都必须停止；launcher 不输出资源 ID/name，也不创建 evidence 目录或进入 17 个 business steps。碰撞资源保留供诊断，不得据此执行 cleanup；应先审计其归属，再选择全新的 run/project/evidence tuple。

```powershell
$runId = "task5-mock-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$evidenceParent = [System.IO.Path]::GetFullPath((Join-Path $PWD '.runtime\runs'))
New-Item -ItemType Directory -Force -Path $evidenceParent | Out-Null

$env:RUN_ID = $runId
$env:COMPOSE_PROJECT_NAME = "refine-memory-$runId"
$env:EVIDENCE_DIR = Join-Path $evidenceParent $runId
$env:MEMORY_CORE_GATEWAY_API_KEY = "task5-$([guid]::NewGuid().ToString('N'))"

if (Test-Path -LiteralPath $env:EVIDENCE_DIR) {
  throw "EVIDENCE_DIR must be a new path: $env:EVIDENCE_DIR"
}

try {
  node tests/integration/tools/run-task5-mock.mjs
  if ($LASTEXITCODE -ne 0) { throw 'Task 5 Mock launcher failed' }
} finally {
  Remove-Item Env:MEMORY_CORE_GATEWAY_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:RUN_ID -ErrorAction SilentlyContinue
  Remove-Item Env:COMPOSE_PROJECT_NAME -ErrorAction SilentlyContinue
  Remove-Item Env:EVIDENCE_DIR -ErrorAction SilentlyContinue
}
```

启动器固定执行 long-running services → bootstrap → 三个 client config → protocol/leak → management/outsider → 三写 → 六读 → final oracle。任一步失败都会立即停止后续命令；精确 Compose project、volumes 与 evidence 目录必须保留诊断，不得自动清理。成功也只代表该唯一 Mock run，通过 review 和归档前同样不做破坏性清理。TUI 与真实模型均不在此启动器范围内。

## 后续受控顺序

1. **Task 2（Passed，build/assets only）**：固定 image ID/digest 与不可变 RED→GREEN 已归档；不扩写为服务或业务通过。
2. **Task 3（Passed，handler/route + build/assets only）**：三平台 literal Messages/`count_tokens` route、source/session fail-closed、Anthropic system context 与选定 console privacy 已固定；不扩写为服务业务或 comprehensive leak Gate 通过。
3. **Task 4（Passed，client build/config assets only）**：active Compose、三客户端身份/config/image 已固定；不扩写为服务或业务流通过。
4. **Task 5（diagnostic forwarding-filter Blocked）**：四次 deterministic Mock failures 与一次 diagnostic 均保持 append-only；auth/fixture fixes 与 replacement images 仍为 Ready（build/assets only）。diagnostic schema 已验证但 classification values 不可恢复；新 tuple/direct parser 诊断、后续两写、六读、outsider、final oracle 与真实 headless 未运行，不得提前进入 TUI/real。
5. **Task 6**：完整 Mock Gate 后且负责人明确授权，才可使用 host-only 双 key 与预算限制做真实 Stage 1。
6. **Task 7–8**：在 Stage 1 后实现/验证 Codex Responses 与四客户端 binding 上限。

每次运行使用唯一 run、Compose project 与 evidence 路径。失败项目保留诊断；只有脱敏证据已归档且负责人明确要求销毁该精确项目时，才可精确清理。

## Task 2–6 继续适用的安全决策

四 CLI 拓扑变更不会取消以下安全边界；实现时必须先核对并按新架构补充测试，不能用 Legacy fixture 代替：

- [宿主路径根绑定与持久目录 no-follow ADR](../../docs/decisions/2026-08-09-host-path-and-no-follow-hardening.md)：canonical host path、仓库外配置目录和 link/junction fail-closed。
- [Attestation 信任边界](../../docs/decisions/2026-08-09-attestation-trust-boundary.md)：attestation 防误配置和过期复用，不保护可同时改写宿主环境与记录的操作者。
- [凭证 fan-out 与 Paid Gate ADR](../../docs/decisions/2026-08-09-credential-fanout-and-paid-attestation.md)：客户端只读自己的凭证；真实运行先做 host attestation，再由容器复核。
- [Standalone memory static contract](../../docs/reproduction/2026-08-09-standalone-memory-static-contract.md)：证据归档前保留精确 run 的卷和目录；敏感卷不因普通停止或删除宿主 secret 而失效，禁止全局 prune。

## Legacy archive

旧 specs/ADR/reproduction 原文未改；旧 active SOP 已退出 HEAD，可从根基线 commit `a949ca305550693c30abb3f2a3f84ab76d4e101c` 追溯。需要审计历史时，使用 [旧 Docker runtime report](../../docs/reproduction/2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)、[旧 Windows runtime report](../../docs/reproduction/windows-mock-20260810-111850-93778ced-windows-claude-mock-passed.md) 与旧 ADR；不得把其中的 Runtime Passed 复制到当前 Stage 1/2。

## 2. Legacy Node-contract fixture（不是 active SOP）

下列最小快照只保留现有 Node 契约测试所验证的 one-shot 防重放规则。它不授权执行 Docker，也不说明 legacy 运行结果适用于四 CLI 基线。

```powershell
& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  up -d --build mock-llm config-init memory-core memory-proxy bootstrap

$deadline = (Get-Date).AddMinutes(2)
$ready = $false
do {
  $entries = @(& $dockerCli compose `
    --profile tools `
    -f tests/integration/compose.yaml `
    ps --all --format json | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0) { throw 'Compose readiness status query failed' }
  $byContainer = @{}
  foreach ($entry in $entries) { $byContainer[$entry.Name] = $entry }

  $oneShotsReady = $true
  foreach ($service in @('config-init', 'bootstrap')) {
    $containerName = "$env:COMPOSE_PROJECT_NAME-$service-1"
    $entry = $byContainer[$containerName]
    if ($null -eq $entry) { $oneShotsReady = $false; continue }
    if ($entry.State -eq 'exited' -and [int]$entry.ExitCode -ne 0) { throw "Compose one-shot failed: $service" }
    if ($entry.State -ne 'exited' -or [int]$entry.ExitCode -ne 0) { $oneShotsReady = $false }
  }

  $servicesHealthy = $true
  foreach ($service in @('mock-llm', 'memory-core', 'memory-proxy')) {
    $containerName = "$env:COMPOSE_PROJECT_NAME-$service-1"
    $entry = $byContainer[$containerName]
    if ($null -eq $entry) { $servicesHealthy = $false; continue }
    if ($entry.State -eq 'exited' -and [int]$entry.ExitCode -ne 0) { throw "Compose service failed: $service" }
    if (-not ($entry.State -eq 'running' -and $entry.Health -eq 'healthy')) { $servicesHealthy = $false }
  }

  if ($oneShotsReady -and $servicesHealthy) { $ready = $true; break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if (-not $ready) { throw 'Compose readiness timed out' }

$env:TEST_SCENARIO = 'mock-contract'
& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  run --rm --no-deps test-runner
if ($LASTEXITCODE -ne 0) { throw 'Mock contract failed' }

$env:TEST_SCENARIO = 'standalone-memory'
& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  run --rm --no-deps test-runner
if ($LASTEXITCODE -ne 0) { throw 'Standalone memory gate failed' }

& $dockerCli compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  up --no-deps agent-config-a
if ($LASTEXITCODE -ne 0) { throw 'Agent-a config preparation failed' }
```

## 3. Legacy Windows fixture（不是 active SOP）

以下同样只保留 Node contract 的回归锚点。active Stage 1/2 的任何实际命令必须由后续任务重新设计、测试和授权。

```powershell
$windowsFiles = @('-f', 'tests/integration/compose.yaml')
& $dockerCli compose --profile windows @windowsFiles `
  run --rm --no-deps windows-config-init
if ($LASTEXITCODE -ne 0) { throw 'Windows config init failed' }

& $dockerCli compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  run --rm --no-deps claude-agent-a --version

& $dockerCli compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  run --rm --no-deps claude-agent-a --interactive
```
