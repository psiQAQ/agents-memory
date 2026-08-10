# 四 Docker CLI 集成实验 SOP

本目录是根仓库的跨仓库集成层；Tencent 产品源码、构建修复与产品测试在 `submodules/TencentDB-Agent-Memory` 的独立 worktree 完成。

## 当前边界

**Fact**：active 基线锁定 `feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1`，Stage 1 是 Claude Code `2.1.226`、OpenCode `1.18.16`、Pi `0.84.1`，Stage 2 是 Codex `0.147.0`。

**Fact**：本轮没有执行任何 Docker workload、Mock、真实 API、TUI 或端口探针；它们均为 Not Run。既有 Windows + Claude 命令、Compose 路径和运行证据是 Legacy，不能直接复用到四 CLI 路线。

**Constraint**：不得读取/复制/输出 Tencent `.env`、settings、secret、home、`.runtime/` 或原始 evidence。未经明确授权，不运行 Docker workload、真实 API、push、PR、remote 修改、`down -v` 或 prune。

## 静态验证

在根仓库执行 legacy Node suite。它只验证当前根集成契约，不能证明 active Docker 业务流：

```powershell
node --test tests/integration/test/*.test.mjs
```

本轮文档完成前还应检查 Markdown 相对链接、UTF-8 无 BOM/LF、secret shape、gitlink 和两个 Tencent worktree 状态。检查不得读取任何 secret 内容。

## 后续受控顺序

1. **Task 2**：从固定 SHA 分别 source-build Core、Proxy、Hub，记录 RED/Passed、image ID/digest 与 runtime asset；不使用浮动产品镜像。
2. **Task 3**：先为 Claude Code、OpenCode、Pi 写原生 source/session/route RED 测试，再实现最小 Stage 1 Messages 路由；未知、非法和未绑定 source 必须 fail closed。
3. **Task 4–5**：创建独立 client home/workspace/identity/evidence，完成 deterministic Mock 下的身份、共享、隔离、泄漏和管理 Gate；headless 通过后才进行用户 TUI 确认。
4. **Task 6**：完整 Mock Gate 后且负责人明确授权，才可使用 host-only 双 key 与预算限制做真实 Stage 1。
5. **Task 7–8**：在 Stage 1 后实现/验证 Codex Responses 与四客户端 binding 上限。

每次运行使用唯一 run、Compose project 与 evidence 路径。失败项目保留诊断；只有脱敏证据已归档且负责人明确要求销毁该精确项目时，才可精确清理。

## Legacy archive

旧 Windows + Claude SOP 和记录均未删除。需要审计历史时，使用 [旧 Docker runtime report](../../docs/reproduction/2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)、[旧 Windows runtime report](../../docs/reproduction/windows-mock-20260810-111850-93778ced-windows-claude-mock-passed.md) 与旧 ADR；不得把其中的 Runtime Passed 复制到当前 Stage 1/2。

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
