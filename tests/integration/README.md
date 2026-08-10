# 四 Docker CLI 集成实验 SOP

本目录是根仓库的跨仓库集成层；Tencent 产品源码、构建修复与产品测试在 `submodules/TencentDB-Agent-Memory` 的独立 worktree 完成。

## 当前边界

**Fact**：Task 2 upstream base 锁定 `feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1`，active fork/gitlink 为两笔 TDD 最小修复后的 `3db2b7d60a3b6162118cad1090d1872f1410835a`。Stage 1 是 Claude Code `2.1.226`、OpenCode `1.18.16`、Pi `0.84.1`，Stage 2 是 Codex `0.147.0`。

**Fact**：Task 2 已执行本地 Docker source-build 与 `--network none` runtime asset 检查；Core、Proxy、Hub 为 Runtime Passed（build/assets only）。服务启动、Mock、真实 API、TUI 与端口探针仍为 Not Run。既有 Windows + Claude 命令、Compose 路径和运行证据是 Legacy，不能直接复用到四 CLI 路线。

**Fact**：legacy ref `codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 是 local-only、未 push；fresh clone 不可取得，未经授权不得 push。跨 clone 可重建保全需要 push 或外部归档授权，在此之前仍未完成。

**Constraint**：不得读取/复制/输出 Tencent `.env`、settings、secret、home、`.runtime/` 或原始 evidence。未经明确授权，不运行 Docker workload、真实 API、push、PR、remote 修改、`down -v` 或 prune。

## 静态验证

在根仓库执行 legacy Node suite。它只验证当前根集成契约，不能证明 active Docker 业务流：

```powershell
node --test tests/integration/test/*.test.mjs
```

本轮文档完成前还应检查 Markdown 相对链接、UTF-8 无 BOM/LF、secret shape、gitlink 和两个 Tencent worktree 状态。检查不得读取任何 secret 内容。

## Task 2 source-build 结果

| 组件 | 固定镜像 | 结果边界 |
| --- | --- | --- |
| Core | `local/refine-memory-core:0a568c3-task2` | source-build、`node:sqlite`、`sqlite-vec`、jieba Passed |
| Proxy | `local/refine-memory-proxy:3db2b7d-task2` | public context、`better-sqlite3`、`node-pty`、stub fallback Passed |
| Hub | `local/refine-memory-hub:0a568c3-task2` | combined context、Knowledge SQLite、Panel/Knowledge runtime assets Passed |

完整 RED→GREEN、image ID/digest、warning 与限制见 [Task 2 reproduction 索引](../../docs/README.md)。这些镜像不能当作服务健康或业务流通过证明；后续任务不得覆盖本轮失败 context 或用浮动 tag 替换固定证据。

## 后续受控顺序

1. **Task 2（Passed，build/assets only）**：固定 image ID/digest 与不可变 RED→GREEN 已归档；不扩写为服务或业务通过。
2. **Task 3（下一 Gate）**：先为 Claude Code、OpenCode、Pi 写原生 source/session/route RED 测试，再实现最小 Stage 1 Messages 路由；未知、非法和未绑定 source 必须 fail closed。
3. **Task 4–5**：创建独立 client home/workspace/identity/evidence，完成 deterministic Mock 下的身份、共享、隔离、泄漏和管理 Gate；headless 通过后才进行用户 TUI 确认。
4. **Task 6**：完整 Mock Gate 后且负责人明确授权，才可使用 host-only 双 key 与预算限制做真实 Stage 1。
5. **Task 7–8**：在 Stage 1 后实现/验证 Codex Responses 与四客户端 binding 上限。

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
