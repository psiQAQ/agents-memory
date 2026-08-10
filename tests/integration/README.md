# Docker 多客户端记忆实验

> **Docker Compose**：用 YAML 一次声明多个容器、网络和数据卷，再用同一组命令启动或停止实验环境。

> **Canonical path**：操作系统解析符号链接和相对片段后得到的唯一绝对路径，用来避免同一文件以不同写法绕过目录检查。

> **Gate**：真实模型或宿主配置操作前必须通过的安全检查；任一检查失败就拒绝执行。

> **Secret**：需要避免进入源码、日志和普通配置的敏感凭证，例如 DeepSeek API key。

> **Attestation**：host 检查后交给容器复核的短期记录，不是带签名的加密证明。它信任宿主账户、Compose 启动环境和实验证据目录，只防误配置、字段不一致与过期复用，不防能同时改写记录和环境变量的本地操作者。

> **Static Passed**：文件、渲染器、Gate 与 Compose 展开结果通过自动检查；不代表镜像或服务已经运行。

> **Engine Accessible（预检时）**：本轮预检曾确认 Docker client 与 engine 均为 29.6.2、Docker Desktop 为 4.85.0、context 为 `desktop-linux`，并可执行 Compose 5.3.1 命令；这项历史通过不表示故障后 engine 仍可用。

> **WSL**：Windows Subsystem for Linux，Windows 上运行 Linux 环境的系统组件；Docker Desktop 的 Linux 容器后端依赖它。

> **HCS**：Host Compute Service，Windows 用来创建和管理虚拟机及容器计算实例的系统服务。

> **Runtime Blocked**：运行已开始准备，但被宿主或基础设施故障阻断，尚未取得容器业务结果；它既不是 Passed，也不是项目功能 Failed。

> **Runtime Not Run**：尚未执行 `up`、业务探针、Claude TUI 或真实模型请求。

> **Runtime Passed（受限范围）**：列明的真实容器和业务请求已通过；不能外推到未列出的协议、客户端或故障场景。

> **User Confirmed**：用户直接观察并确认界面结果；这是人工验收证据，但不能替代消息请求或服务端观察。

> **Static Integrated**：目标变更已写入当前仓库受跟踪的源码或 Compose，并通过相关静态契约测试；不代表镜像、服务或业务流已经运行。

> **Public fork Static Integrated**：在通用 Static Integrated 条件之外，public fork 的精确 SHA 还必须写入根 gitlink、镜像标签和对应静态测试。

> **Loopback Gateway**：只在本机 `127.0.0.1` 接收 TCP 连接，再把字节原样转发到 internal 网络中 MemoryProxy 的轻量容器；它不解析请求，也不保存凭证。

> **Agent bundle**：只放在单个客户端私有 home 中的 `0600` JSON 文件，把该客户端的 Memory 用户 key 与身份作为一个整体原子切换，避免更新中途出现“新 key 配旧身份”。

> **One-shot**：只应运行一次并在完成后退出的容器任务，例如 `config-init`、`bootstrap`、runner 或 agent config 生成器。

> **Data plane**：实际承载客户端请求、记忆写入和读取的服务路径；默认实验中的 data plane 是 Proxy、Core 与 Mock。

> **L0 / L1**：L0 是 Core 的原始对话层，L1 是从对话提炼出的原子记忆层；runner 直接查询两层，不用模型回答猜测是否记住。

> **Headless / 只读业务探针**：Headless 是不进入交互界面的命令行验证；只读业务探针会调用真实业务 API 但不修改业务状态，容器健康状态不能替代它。

本目录保存可重复的 Docker 实验编排。Windows 重启后 Docker Desktop 已恢复；所选完整镜像构建、默认无付费 `mock-contract`（11 项）、`standalone-memory`（12 项）、Hub health 与 Panel/Knowledge 只读业务探针、Docker Claude config precheck、`2.1.207` headless 和 TUI Mock 文本往返均已 **Runtime Passed**。Loopback Gateway 已 **Static Integrated**，但旧 Windows run 在直接发布 Proxy 的宿主 loopback 处失败；Gateway 版 Windows runtime 仍为 **Pending**。Windows config/headless/TUI、真实 DeepSeek、stream/tool/thinking、故障恢复与 LAN 仍为 Not Run。

> **Mock**：返回固定结果的模拟模型服务。它不访问真实模型，适合默认测试协议、失败和恢复路径。

> **Profile**：只有显式选择才启用的一组 Compose 服务，例如 `redis`、`claude` 或会产生真实模型流量的 `real-claude`。

## 文件分层

| 文件 | 用途 | 默认付费流量 |
| -- | -- | -- |
| `compose.yaml` | Mock-only 基线；Core、Hub、Proxy、测试工具和隔离 Agent | 无 |
| `compose.hardened.yaml` | 在基线上由 Loopback Gateway 独占发布 `127.0.0.1:8096`，Proxy 保持 internal，并持久化 Proxy data/log | 无 |
| `compose.real.yaml` | 显式 `real-claude` profile、Gate 和 DeepSeek server secret | 有，必须另行批准并满足 Gate |
| `compose.windows.yaml` | 按需为 Windows Claude agent-a 生成项目专用 settings；与 base+hardened 叠加 | 无 |

基础层的 Proxy 故意不挂持久 data volume，用来记录“容器强制重建后 session 丢失”的原始基线；hardened 和 real 层才挂 `proxy-data`。Proxy 没有到 Hub 的运行时依赖；本轮证明 Hub 可在已运行的 Proxy/Core data plane 后单独启动，但尚未验证 Hub 停止、Proxy/Core 独立重启或强制重建后的行为。

## 1. 静态验证

以下命令从仓库根目录运行。先定位 Docker CLI 的 canonical 绝对路径；这也兼容 Docker Desktop 已安装但 `docker` 尚未进入当前 PowerShell `PATH` 的情况。`MEMORY_CORE_GATEWAY_API_KEY` 是一次性实验网关 token，不是 DeepSeek key。

```powershell
$dockerCli = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $dockerCli) {
  $fallback = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
  if (Test-Path -LiteralPath $fallback) {
    $dockerCli = (Resolve-Path -LiteralPath $fallback).Path
  }
}
if (-not $dockerCli) { throw 'Docker CLI not found' }
$dockerBin = Split-Path -Parent $dockerCli
if (($env:Path -split ';') -notcontains $dockerBin) {
  $env:Path = "$dockerBin;$env:Path"
}

$env:MEMORY_CORE_GATEWAY_API_KEY = 'replace-with-a-disposable-lab-token'

node --test tests/integration/test/*.test.mjs

& $dockerCli compose `
  -f tests/integration/compose.yaml `
  config --quiet

& $dockerCli compose `
  -f tests/integration/compose.yaml `
  -f tests/integration/compose.hardened.yaml `
  config --quiet
```

real 层的语法检查只能使用工作区外 dummy 文件，不要使用真实 key，也不要保存展开后的 real config：

```powershell
$runId = 'compose-static-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
$secretFile = [IO.Path]::GetTempFileName()
$evidenceDir = Join-Path ([IO.Path]::GetTempPath()) $runId
[IO.File]::WriteAllText($secretFile, "dummy-static-key`n", [Text.UTF8Encoding]::new($false))
[IO.Directory]::CreateDirectory($evidenceDir) | Out-Null

try {
  $env:PROJECT_ROOT = (Resolve-Path -LiteralPath .).Path
  $env:DEEPSEEK_SECRET_FILE = (Resolve-Path -LiteralPath $secretFile).Path
  $env:RUN_PAID_LLM = '1'
  $env:REAL_LLM_MAX_BUDGET_USD = '0.01'
  $env:REAL_LLM_MAX_TURNS = '1'
  $env:RUN_ID = $runId
  $env:EVIDENCE_DIR = (Resolve-Path -LiteralPath $evidenceDir).Path
  $env:PAID_GATE_ATTESTATION_FILE = Join-Path $env:EVIDENCE_DIR 'paid-gate-attestation.json'

  node tests/integration/tools/paid-gate.mjs `
    --write-attestation $env:PAID_GATE_ATTESTATION_FILE
  if ($LASTEXITCODE -ne 0) { throw 'Host paid gate preflight failed' }

  & $dockerCli compose `
    --profile real-claude `
    -f tests/integration/compose.yaml `
    -f tests/integration/compose.real.yaml `
    config --quiet
} finally {
  Remove-Item -LiteralPath $secretFile -Force
  Remove-Item -LiteralPath $evidenceDir -Recurse -Force
}
```

Host preflight 必须先成功，并把 attestation 写入本次 canonical evidence 目录；容器 Gate 随后核对同一组 host path 字符串和实际挂载 secret。`REAL_LLM_MAX_BUDGET_USD` 与 `REAL_LLM_MAX_TURNS` 只是声明性审批输入，对 Claude、Proxy、Core 和 Knowledge 都不是硬性上限。

### 历史故障（重启后已恢复）：Windows 10 `HCS/0x800705aa`

> **Committed memory**：Windows 已承诺给进程使用的内存总量；它可以高于物理内存，但不能超过物理内存与分页文件共同提供的上限。

Run `docker-mock-20260810-002427` 的 version/context/Compose/`hello-world` 预检和基础镜像拉取曾通过；单独 Proxy image 也已通过构建与运行时自检。首次完整 Compose build 尚未进入项目 Dockerfile，Docker Desktop 即无法创建 `docker-desktop` WSL 虚拟机，并报告：

```text
Wsl/Service/CreateInstance/CreateVm/HCS/0x800705aa
系统资源不足，无法完成请求的服务。
```

随后出现的 `vpnkit-bridge handshake failed` / `bad magic string` 仍夹带同一条“系统资源不足”，应视为后端启动失败的下游症状。故障时宿主约有 `15.87 GB` 物理内存、`4.82 GB` 可用内存、`21.26 / 30.87 GB` Windows committed memory 和 `15 GB` 分页文件；该快照尚未达到 commit 上限，也不能证明物理内存或 commit 空间耗尽。磁盘空间充足，`.wslconfig` 为空，`docker-desktop` 与 `Ubuntu` 均为 stopped。完整历史见 [2026-08-10 WSL 资源阻塞报告](../../docs/reproduction/2026-08-10-docker-mock-20260810-002427-wsl-resource-blocked.md)。

**后续 Verified Fact：** Windows 重启后，Docker client/server、`desktop-linux`、Compose 与 `hello-world` 恢复通过；随后完整所选镜像构建和无付费业务 run 完成，见[最终通过报告](../../docs/reproduction/2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)。历史 run `docker-mock-20260810-002427` 仍保持 Blocked，不能被后续证据改写。

若该错误再次出现，安全恢复顺序为：

1. 保存其他工作并重启 Windows；不要只反复重启 Docker Desktop。
2. 登录后启动 Docker Desktop，等待界面明确显示 engine 已就绪。
3. 重新执行本节开头定位 `$dockerCli` 的代码，再运行以下无付费预检：

```powershell
& $dockerCli version
& $dockerCli context show
& $dockerCli compose version
& $dockerCli run --rm hello-world
```

4. 任一命令失败就停止，不执行 Compose build。若 `0x800705aa` 复现，先记录新的内存、分页文件、WSL 状态和 Docker Desktop 诊断报告，再单独排查宿主资源。
5. 全部通过后创建新的 run ID、Compose project 和没有目录重定向的普通证据目录；不要复用 `docker-mock-20260810-002427`。

本故障不授权修改分页文件、`.wslconfig`、Docker Desktop 配额或系统服务。需要这类系统级变更时，先依据重启后的新诊断单独评估；不要加载 `compose.real.yaml` 或任何 DeepSeek secret 来验证恢复。

## 2. Mock 数据面与两级 Gate

每次实验使用唯一 project、run ID 与 host evidence 目录，避免复用旧 bootstrap 状态。原始脱敏 JSON 直接写入忽略目录 `.runtime/runs/<run-id>/`：

```powershell
$env:RUN_ID = 'mock-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$env:COMPOSE_PROJECT_NAME = "mem-it-$env:RUN_ID"
$env:MEMORY_SPACE_ID = 'default'
$env:EVIDENCE_DIR = Join-Path (Resolve-Path -LiteralPath .).Path ".runtime\runs\$env:RUN_ID"
[IO.Directory]::CreateDirectory($env:EVIDENCE_DIR) | Out-Null

& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  up -d --build mock-llm config-init memory-core memory-proxy bootstrap
```

在运行任何 `--no-deps` one-shot 前，等待同一个 Compose project 的显式准备完成；这不是独立的快捷方式。`bootstrap` 或 `config-init` 任一非 0 会立即失败，其他未就绪状态会在超时后失败：

```powershell
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
```

第一级只验证 Mock 协议，不宣称记忆业务通过：

```powershell
$env:TEST_SCENARIO = 'mock-contract'
& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  run --rm --no-deps test-runner
if ($LASTEXITCODE -ne 0) { throw 'Mock contract failed' }
```

第二级 `standalone-memory` 使用真实 Core/Proxy API 验证 A 写入、Core L0/L1 oracle、B 显式共享、C 隔离、身份冲突和模型上游 header 脱敏。Public fork `69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 已写入根 gitlink，三个服务镜像统一标记 `fork-69fd8b`。Run `docker-mock-20260810-033636` 中本命令 exit 0，12 项业务断言通过；新的 run 仍必须独立执行，不能复用这次证据：

```powershell
$env:TEST_SCENARIO = 'standalone-memory'
& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  run --rm --no-deps test-runner
if ($LASTEXITCODE -ne 0) { throw 'Standalone memory gate failed' }
```

两个 Gate 都 exit 0 且 `$env:EVIDENCE_DIR` 内的 JSON 通过脱敏检查后，先只准备一次 agent-a，随后才进入 Windows Claude、Docker Claude headless 与 TUI：

```powershell
& $dockerCli compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  up --no-deps agent-config-a
if ($LASTEXITCODE -ne 0) { throw 'Agent-a config preparation failed' }
```

当前无付费运行链路的不可变记录为：

1. [`docker-mock-20260810-015646`](../../docs/reproduction/2026-08-10-docker-mock-20260810-015646-bootstrap-replay-blocked.md)：完整所选镜像构建 Passed，但旧 runner 命令重放 Bootstrap；lifecycle TDD 与独立复审后改用 readiness + `--no-deps`。
2. [`docker-mock-20260810-024419`](../../docs/reproduction/2026-08-10-docker-mock-20260810-024419-forged-contract-failed.md)：Gate 1 Passed；Gate 2 暴露 forged source 的 HTTP 400/401 预期差异。
3. [`docker-mock-20260810-030443`](../../docs/reproduction/2026-08-10-docker-mock-20260810-030443-session-precondition-failed.md)：Gate 1 Passed；Gate 2 越过 forged contract 后安全定位到 B session 尚未初始化。
4. [`docker-mock-20260810-033636`](../../docs/reproduction/2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)：Gate 1 的 11 项与 Gate 2 的 12 项均 Passed；A 写入、B 显式共享、C 隔离、身份负测和上游 hygiene 均有脱敏证据。
5. [`windows-mock-20260810-093140-a664249f`](../../docs/reproduction/2026-08-10-windows-mock-20260810-093140-loopback-blocked.md)：两级 Gate 与 `agent-config-a` Passed；直接从 internal Proxy 发布宿主端口失败，Windows config/headless/TUI 未执行。

Docker Claude TUI 的人工验收保存在 [TUI 用户确认报告](../../docs/reproduction/2026-08-10-docker-mock-20260810-033636-tui-user-confirmed.md)；随后的[文本往返报告](../../docs/reproduction/2026-08-10-docker-mock-20260810-033636-tui-message-passed.md)记录用户收到 `mock text`、Mock 新增观察中列明的敏感诱饵/凭证/内部 header 泄漏检查结果，以及 MemoryCore L0 owner oracle。

Runner 不保存 key hash、前缀或长度。Mock 只保存三个列明的布尔结果：`sensitive_value_seen` 检查 header/body 的值和名称中的非凭证诱饵，`unexpected_credential_seen` 要求 OpenAI/Anthropic 使用各自固定的 `mock-key`，`memory_user_credential_seen` 检查任意模型 header/body 是否出现 Memory 用户 key 形态；敏感名称只保存固定占位符，原值、稳定派生值和长度均不保存。每次 bridge 请求还必须携带 `x-tdai-agent-source: claude-code`；它与 `x-claude-code-session-id`、`x-vertex-ai-session-id`、gateway service token、team/agent/task/conversation headers 都不得到达模型上游。

证据 writer 在容器内拒绝符号链接/硬链接，并用同目录临时文件原子发布；这不等于验证了宿主 bind source。Docker 会先解析宿主的 `$env:EVIDENCE_DIR`，因此基础 Mock 实验仍把本地账户和该目录视为受信任边界。运行前需确认它是本次 run 的真实普通目录而非 junction/symlink；不要把容器内 no-follow 测试写成宿主防护已通过。

> **Sensitive named volume**：Docker 管理并跨普通 `down` 保留的数据卷；只要其中有 key、token、业务记忆、源码或用户工作文件，就要按仍持有敏感数据的存储管理。

停止开发栈时默认保留 named volumes：

```powershell
& $dockerCli compose -f tests/integration/compose.yaml down
```

`down` 不删除任何 named volume，也不删除 host evidence 目录。凭证卷包括 `runtime-config`/`real-core-config` 中的 gateway token、`bootstrap-state` 中的 admin/user keys、`claude-home-a/b/c` 中的 agent bundle 与渲染 settings，以及 real 层的 `proxy-private-config` DeepSeek key。`core-data`、`hub-data`、`proxy-data` 保存业务或会话数据，`claude-workspace-a/b/c` 可能保存源码与用户文件；这些也都是 sensitive named volumes。只有 `.runtime/runs/<run-id>/` 已脱敏归档、对应 reproduction report 已写入且明确要销毁该唯一实验项目时，才对该精确 `COMPOSE_PROJECT_NAME` 使用 `down -v --remove-orphans`；禁止全局 prune。

## 3. Hardened Windows 入口

Windows 原生 Claude Code 需要 loopback 入口，因此叠加 hardened 层。只有 Gateway 加入非 internal 的 `loopback-ingress` 并发布端口；MemoryProxy 仍只连接 internal `default` 网络。首次启动必须显式 `--build` 更新包含转发器的 tools image，并列出最小服务；不要使用裸 `up --build`，否则会启动本轮不需要的 Hub：

```powershell
$composeFiles = @(
  '-f', 'tests/integration/compose.yaml',
  '-f', 'tests/integration/compose.hardened.yaml'
)

& $dockerCli compose --profile tools @composeFiles `
  up -d --build `
  mock-llm config-init memory-core memory-proxy bootstrap loopback-gateway
if ($LASTEXITCODE -ne 0) { throw 'Windows Mock stack startup failed' }
```

固定宿主端口意味着同一时刻只能有一个 hardened/Windows Compose project 占用 `127.0.0.1:8096`。开始新 project 前先停止或保留但不启动其他占用者；不要删除其他 run 的容器、网络、volume 或证据。

启动返回后必须 fail-closed 等待：`config-init` 与 `bootstrap` 均为 `exited|0`，Mock、Core、Proxy 与 Gateway 均为 `running|healthy`。尤其不能只看到 Proxy healthy 就继续：

```powershell
$deadline = (Get-Date).AddMinutes(2)
$ready = $false
do {
  $entries = @(& $dockerCli compose --profile tools @composeFiles `
    ps --all --format json | ConvertFrom-Json)
  if ($LASTEXITCODE -ne 0) { throw 'Compose readiness status query failed' }
  $byService = @{}
  foreach ($entry in $entries) { $byService[$entry.Service] = $entry }

  $oneShotsReady = $true
  foreach ($service in @('config-init', 'bootstrap')) {
    $entry = $byService[$service]
    if ($null -eq $entry) { $oneShotsReady = $false; continue }
    if ($entry.State -eq 'exited' -and [int]$entry.ExitCode -ne 0) {
      throw "Compose one-shot failed: $service"
    }
    if ($entry.State -ne 'exited' -or [int]$entry.ExitCode -ne 0) {
      $oneShotsReady = $false
    }
  }

  $servicesHealthy = $true
  foreach ($service in @('mock-llm', 'memory-core', 'memory-proxy', 'loopback-gateway')) {
    $entry = $byService[$service]
    if ($null -eq $entry) { $servicesHealthy = $false; continue }
    if ($entry.State -eq 'exited') { throw "Compose service exited: $service" }
    if ($entry.State -ne 'running' -or $entry.Health -ne 'healthy') {
      $servicesHealthy = $false
    }
  }

  if ($oneShotsReady -and $servicesHealthy) { $ready = $true; break }
  Start-Sleep -Seconds 2
} while ((Get-Date) -lt $deadline)
if (-not $ready) { throw 'Compose readiness timed out' }
```

容器状态通过后，必须从 Windows 宿主实际发起 HTTP 请求：

```powershell
curl.exe --noproxy '*' --fail --silent --show-error http://127.0.0.1:8096/health
```

`docker port` 只显示声明或映射信息，Proxy/Gateway 的容器 health 只验证容器侧路径；两者都不能替代上述宿主 HTTP 证明。旧 run 正是在这条边界之前已有两级 Gate 与 agent config 通过、但宿主入口失败，见[不可变阻塞报告](../../docs/reproduction/2026-08-10-windows-mock-20260810-093140-loopback-blocked.md)。

首次批准的 Windows 交互只使用 agent-a。A/B/C 是自动化隔离 fixture，不代表首轮会同时启动三个真实 Claude。以下命令创建项目专用目录，通过受信任的 one-shot 生成 settings，然后令 Windows Claude 使用该目录；命令不会打印或要求手工复制 Memory 用户 key：

```powershell
$windowsConfigDir = Join-Path $env:LOCALAPPDATA 'refine-memory\claude-agent-a'
[IO.Directory]::CreateDirectory($windowsConfigDir) | Out-Null
$windowsGateDir = Join-Path ([IO.Path]::GetTempPath()) ('refine-memory-windows-gate-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($windowsGateDir) | Out-Null
$env:PROJECT_ROOT = (Resolve-Path -LiteralPath .).Path
$env:WINDOWS_CLAUDE_CONFIG_DIR = (Resolve-Path -LiteralPath $windowsConfigDir).Path
$env:WINDOWS_CONFIG_ATTESTATION_FILE = Join-Path $windowsGateDir 'windows-config-attestation.json'

node tests/integration/tools/windows-config-gate.mjs `
  --write-attestation $env:WINDOWS_CONFIG_ATTESTATION_FILE
if ($LASTEXITCODE -ne 0) { throw 'Windows config host gate failed' }

try {
  $windowsFiles = $composeFiles + @('-f', 'tests/integration/compose.windows.yaml')
  & $dockerCli compose --profile windows @windowsFiles `
    run --rm --no-deps windows-config-init
  if ($LASTEXITCODE -ne 0) { throw 'Windows config init failed' }
} finally {
  Remove-Item -LiteralPath $windowsGateDir -Recurse -Force
}

$env:CLAUDE_CONFIG_DIR = $env:WINDOWS_CLAUDE_CONFIG_DIR
claude
```

Host gate 会把真实 worktree root 与 canonical Windows config 目录写入短期 attestation；config 目录必须是仓库外的绝对真实路径，不能使用相对路径、junction 或仓库内 `.runtime`。`windows-config-init` 先核对 attestation，再一次读取 agent-a 私有 home 的 `agent-bundle.json`；它不挂共享 bootstrap state 或 DeepSeek secret。Settings 只把 bundle 中的 key 写入 `ANTHROPIC_AUTH_TOKEN`，生成 team/agent/task/conversation 四行身份 headers，并固定写入 `TDAI_MEMORY_PROXY_BASE_URL=http://127.0.0.1:8096`，保留 Claude 自带的 session header。Gateway 的代码和编排当前仅为 Static Integrated；旧 run 没有越过宿主 loopback，使用新路径的 Windows config、headless 与 TUI 仍为 Pending / Not Run。只有新 run 的宿主 health、Windows headless、服务端观察与人工 TUI 全部通过后才能升级状态。

## 4. Redis profile

Redis 是 Proxy 的可选临时状态层，用于 session、cache、rate limit、binding 和 version pin；它不是 Core 数据库。必须同时显式选择 Redis profile 和受限配置文件；只启动 Redis 容器不算启用：

```powershell
$env:MEMORY_PROXY_CONFIG = 'config.redis.yaml'

& $dockerCli compose `
  --profile redis `
  -f tests/integration/compose.yaml `
  up --build redis memory-proxy
```

`run-proxy.sh` 只接受 `config.yaml` 或 `config.redis.yaml`，拒绝路径和其他文件名。恢复基础模式：

```powershell
Remove-Item Env:MEMORY_PROXY_CONFIG -ErrorAction SilentlyContinue
```

## 5. Docker Claude Code

Bootstrap 成功后，受信任的 `agent-config-a/b/c` 各自生成一个只含当前客户端 key 与 identity 的 `agent-bundle.json`，以同目录临时文件加单次 rename 原子发布；Claude 本身不挂共享 bootstrap volume。Identity 含 service/team/user/agent/task/session/display name，但只有 team/agent/task/session 转成 Proxy headers。A/B/C 的 home 与 workspace 是六个互不共享的 named volumes，用作自动化隔离 fixture；首轮人工 Docker Claude 交互只启动 agent-a。

Headless 版本检查已在 run `docker-mock-20260810-033636` 通过，entrypoint config precheck 为 `status=ok target=docker`，版本为 `2.1.207 (Claude Code)`：

```powershell
& $dockerCli compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  run --rm --no-deps claude-agent-a --version
```

交互式 TUI 已由用户确认界面正确。以下命令继续作为复现和下一项无付费消息探针的入口；在新的 PowerShell 中恢复精确 run/project/space 和绝对 evidence 路径：

```powershell
Set-Location 'D:\workspace\refine-memory\.worktrees\docker-memory-lab'
$dockerCli = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin\docker.exe'
$env:RUN_ID = 'docker-mock-20260810-033636'
$env:COMPOSE_PROJECT_NAME = 'mem-it-20260810-033636'
$env:MEMORY_SPACE_ID = 'default'
$env:EVIDENCE_DIR = 'D:\workspace\refine-memory\.worktrees\docker-memory-lab\.runtime\runs\docker-mock-20260810-033636'
$env:MEMORY_CORE_GATEWAY_API_KEY = 'compose-parse-only-' + [guid]::NewGuid().ToString('N')

& $dockerCli compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  run --rm --no-deps claude-agent-a --interactive
```

`--interactive` 只由镜像入口消费，随后以无额外参数的 `claude` 启动。`compose-parse-only-<guid>` 仅用于上面这条交互命令的 YAML 解析；**不得**用它执行 `up`、`create`、`recreate`、省略 `--no-deps` 的 run 或任何会重建既有服务的命令。TUI 启动和 Mock 文本往返当前均为 **Runtime Passed**；streaming、tool use、thinking 与真实 DeepSeek 仍为 **Not Run**。

## 6. 真实 DeepSeek（Blocked / Not Run）

只有旧 key 已撤销、新 key 位于工作区外、用户明确批准真实测试后，才可以加载 `compose.real.yaml` 和 `real-claude` profile。客户端容器不会挂载 DeepSeek secret；它们只使用 bootstrap 生成的 Memory 用户 key。Real Compose 的默认网络仍为 `internal`；只有 Core、Hub、Proxy 同时接入独立 `egress-net`。Claude、bootstrap、runner、paid-gate 和 config init 没有外网出口。长期运行服务中，DeepSeek key 仅由 Core/Hub 的 Compose secret 和 Proxy 私有配置使用；受信任的一次性 `paid-gate` 与 `real-config-init` 会在启动前短暂读取 secret。内嵌 Proxy key 的 `proxy-private-config` 只挂给 `real-config-init` 与 Proxy，bootstrap/runner/Claude 均不可达。

`proxy-private-config` 是上述 sensitive named volumes 之一。轮换或删除宿主 secret 文件不会清除卷内已渲染的 Proxy key，普通 `docker compose down` 也会保留全部凭证与数据卷。每次真实 run 必须先设置唯一 `COMPOSE_PROJECT_NAME=mem-real-<run-id>`；证据完成脱敏归档后，才能对该精确项目执行以下统一清理：

```powershell
& $dockerCli compose `
  --profile real-claude `
  -f tests/integration/compose.yaml `
  -f tests/integration/compose.real.yaml `
  down -v --remove-orphans
```

如果尚未归档或不准备销毁，就保留该项目并把卷视为仍持有效 key；禁止用全局 volume/system prune 代替精确清理。

真实 Gate 的 `REAL_LLM_MAX_BUDGET_USD` 和 `REAL_LLM_MAX_TURNS` 仅是声明性审批输入，不能对 Claude、Proxy、Core 或 Knowledge 提供统一硬限制。首轮必须一次只运行一个场景，并记录 Proxy、Core、Knowledge 的请求数与 usage。

## 当前已知限制

- **Static Passed**：当前根 Node suite 为 64/64；base、tools、Claude、hardened 和 Windows 组合的 Compose contract 在静态测试中通过。
- **Runtime Passed（受限范围）**：Windows 重启后 Docker 恢复；所选完整镜像 build Passed。最终 run 的 Mock 11 项、Standalone 12 项、A 写/B 共享/C 隔离、安全负测与上游 hygiene、Hub health、Panel team/get、Knowledge wiki/list 和 Docker Claude `2.1.207` headless 均 Passed。
- **Evidence**：最终 run 的 evidence 目录只有两个已脱敏 ordinary JSON 文件；DeepSeek 为 0 个已选 profile/service 请求且 internal network 生效，但这不是 packet capture。
- **Runtime Passed（Docker TUI 文本范围）**：用户看到 `mock text`；相较基线新增 2 个 Anthropic 与 3 个 OpenAI 观察，列明的敏感诱饵、凭证形态和内部 header 泄漏检查均为 0；MemoryCore L0 提示命中 1、owner mismatch 为 0。六个 named volumes 与 internal network 继续保留。
- **Pending / Not Run**：Loopback Gateway 已 Static Integrated，但新 Windows runtime 尚未执行；Windows config/headless/TUI、真实 DeepSeek Anthropic/OpenAI 协议、stream/tool/thinking、Redis、Proxy/Core/Hub stop/restart/recreate、备份恢复、恶意记忆、key 撤销、Win11、WSL Claude 与 LAN 均未运行。
- **Local-only SHA**：public fork `69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 尚未 push；从首个本地修复 `c75ef58` 起至当前修复，共 27 个本地 public commit。当前工作区可用；新 clone 在用户授权 push 前不能取得根 gitlink 目标。
