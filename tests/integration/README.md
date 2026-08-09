# Docker 多客户端记忆实验

> **Docker Compose**：用 YAML 一次声明多个容器、网络和数据卷，再用同一组命令启动或停止实验环境。

> **Canonical path**：操作系统解析符号链接和相对片段后得到的唯一绝对路径，用来避免同一文件以不同写法绕过目录检查。

> **Gate**：真实模型或宿主配置操作前必须通过的安全检查；本项目使用短期 attestation 把 host 检查结果交给容器复核。

> **Static Passed**：文件、渲染器、Gate 与 Compose 展开结果通过自动检查；不代表镜像或服务已经运行。

> **Build Failed**：镜像构建曾在获取 Docker Hub OAuth token 时超时，尚未执行到项目 Dockerfile 的关键构建步骤。

> **Runtime Not Run**：尚未执行 `up`、业务探针、Claude TUI 或真实模型请求。

本目录保存可重复的 Docker 实验编排。当前状态为 Static Passed、Build Failed、Runtime Not Run，因此不能据此声称服务已启动或记忆业务已通过。

> **Mock**：返回固定结果的模拟模型服务。它不访问真实模型，适合默认测试协议、失败和恢复路径。

> **Profile**：只有显式选择才启用的一组 Compose 服务，例如 `redis`、`claude` 或会产生真实模型流量的 `real-claude`。

## 文件分层

| 文件 | 用途 | 默认付费流量 |
| -- | -- | -- |
| `compose.yaml` | Mock-only 基线；Core、Hub、Proxy、测试工具和隔离 Agent | 无 |
| `compose.hardened.yaml` | 在基线上仅发布 `127.0.0.1:8096`，并持久化 Proxy data/log | 无 |
| `compose.real.yaml` | 显式 `real-claude` profile、Gate 和 DeepSeek server secret | 有，必须另行批准并满足 Gate |
| `compose.windows.yaml` | 按需为 Windows Claude agent-a 生成项目专用 settings；与 base+hardened 叠加 | 无 |

基础层的 Proxy 故意不挂持久 data volume，用来记录“容器强制重建后 session 丢失”的原始基线；hardened 和 real 层才挂 `proxy-data`。Proxy 没有到 Hub 的运行时依赖，Hub 停止时 Proxy/Core 数据面仍应能独立重启；该行为尚待 Task 5 运行验证。

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

## 2. Mock 开发栈（待镜像构建网络恢复后运行）

每次实验使用唯一 project 与 run ID，避免复用旧 bootstrap 状态：

```powershell
$env:RUN_ID = 'mock-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$env:COMPOSE_PROJECT_NAME = "mem-it-$env:RUN_ID"
$env:MEMORY_SPACE_ID = 'default'

& $dockerCli compose `
  -f tests/integration/compose.yaml `
  up --build
```

停止开发栈时默认保留 named volumes：

```powershell
& $dockerCli compose -f tests/integration/compose.yaml down
```

只有证据已归档且明确要销毁该唯一实验项目时，才对该 project 使用 `down -v --remove-orphans`；禁止全局 prune。

## 3. Hardened Windows 入口

Windows 原生 Claude Code 需要 loopback Proxy，因此叠加 hardened 层：

```powershell
& $dockerCli compose `
  -f tests/integration/compose.yaml `
  -f tests/integration/compose.hardened.yaml `
  up --build
```

此时只有 Proxy 发布到 `127.0.0.1:8096`；Core 和 Hub 不发布宿主端口。

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
  & $dockerCli compose `
    --profile windows `
    -f tests/integration/compose.yaml `
    -f tests/integration/compose.hardened.yaml `
    -f tests/integration/compose.windows.yaml `
    run --rm windows-config-init
  if ($LASTEXITCODE -ne 0) { throw 'Windows config init failed' }
} finally {
  Remove-Item -LiteralPath $windowsGateDir -Recurse -Force
}

$env:CLAUDE_CONFIG_DIR = $env:WINDOWS_CLAUDE_CONFIG_DIR
claude
```

Host gate 会把真实 worktree root 与 canonical Windows config 目录写入短期 attestation；config 目录必须是仓库外的绝对真实路径，不能使用相对路径、junction 或仓库内 `.runtime`。`windows-config-init` 先核对 attestation，再读取 agent-a 私有 home 中的 Memory 用户 key；它不挂共享 bootstrap state 或 DeepSeek secret。上述启动与 TUI 仍为 Runtime Not Run。

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

Bootstrap 成功后，受信任的 `agent-config-a/b/c` 只把对应 Memory 用户 key 放进对应私有 home；Claude 本身不挂共享 bootstrap volume。A/B/C 的 home 与 workspace 是六个互不共享的 named volumes，用作自动化隔离 fixture；首轮人工 Docker Claude 交互只启动 agent-a。

Headless 版本检查：

```powershell
& $dockerCli compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  run --rm claude-agent-a --version
```

交互式启动，供用户确认 TUI：

```powershell
& $dockerCli compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  run --rm claude-agent-a --interactive
```

`--interactive` 只由镜像入口消费，随后以无额外参数的 `claude` 启动。当前未完成镜像构建和 TUI 人工确认，因此这两条命令仍是 **Not Run**。

## 6. 真实 DeepSeek（Blocked / Not Run）

只有旧 key 已撤销、新 key 位于工作区外、用户明确批准真实测试后，才可以加载 `compose.real.yaml` 和 `real-claude` profile。客户端容器不会挂载 DeepSeek secret；它们只使用 bootstrap 生成的 Memory 用户 key。

真实 Gate 的 `REAL_LLM_MAX_BUDGET_USD` 和 `REAL_LLM_MAX_TURNS` 仅是声明性审批输入，不能对 Claude、Proxy、Core 或 Knowledge 提供统一硬限制。首轮必须一次只运行一个场景，并记录 Proxy、Core、Knowledge 的请求数与 usage。

## 当前已知限制

- **Static Passed**：45 项 Node 测试，以及 base、hardened、real 和可选 Windows override 四组 `docker compose config --quiet` 已通过。
- **Build Failed**：Hub/Claude 构建在拉取 `docker/dockerfile:1` 的 Docker Hub OAuth token 时网络超时；named-context `COPY` 尚未得到实际构建证明。
- **Runtime Not Run**：未执行 `up`、业务探针、故障恢复或 Claude TUI。
- **Design Only / Runtime Not Run**：ACL、权限隔离、文件所有权和恢复语义尚未得到真实容器与服务行为证明。
- Proxy auth/session/injection 暂时显式关闭，等待 public fork 的 Task 4 service bearer 修复后再启用。
- MemoryPanel 构建上下文缺少收窄用 `.dockerignore`；该 Medium 项留到下一次 Task 4 public fork commit，本轮不修改 submodule。
