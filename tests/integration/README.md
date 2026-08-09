# Docker 多客户端记忆实验

> **Docker Compose**：用 YAML 一次声明多个容器、网络和数据卷，再用同一组命令启动或停止实验环境。

> **Canonical path**：操作系统解析符号链接和相对片段后得到的唯一绝对路径，用来避免同一文件以不同写法绕过目录检查。

> **Gate**：真实模型或宿主配置操作前必须通过的安全检查；任一检查失败就拒绝执行。

> **Attestation**：host 检查后交给容器复核的短期记录，不是带签名的加密证明。它信任宿主账户、Compose 启动环境和实验证据目录，只防误配置、字段不一致与过期复用，不防能同时改写记录和环境变量的本地操作者。

> **Static Passed**：文件、渲染器、Gate 与 Compose 展开结果通过自动检查；不代表镜像或服务已经运行。

> **Current agent context: Engine Inaccessible**：本轮 Codex 执行环境能运行 Docker client，但无法访问 engine；这不代表用户会话中的 Docker Desktop 一定无法启动。

> **Runtime Not Run**：尚未执行 `up`、业务探针、Claude TUI 或真实模型请求。

> **Expected Blocked**：测试契约已定义，但依赖的 public fork 修复尚未更新到根仓库 gitlink；当前不得执行后宣称通过。

> **Agent bundle**：只放在单个客户端私有 home 中的 `0600` JSON 文件，把该客户端的 Memory 用户 key 与身份作为一个整体原子切换，避免更新中途出现“新 key 配旧身份”。

本目录保存可重复的 Docker 实验编排。当前状态为 Static Passed、Current agent context: Engine Inaccessible、本轮 Build Not Run、Runtime Not Run；最近一次有证据的 Build 在 registry network 阶段 Failed。因此不能据此声称服务已启动或记忆业务已通过。

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

## 2. Mock 数据面与两级 Gate（待镜像构建网络恢复后运行）

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

第一级只验证 Mock 协议，不宣称记忆业务通过：

```powershell
$env:TEST_SCENARIO = 'mock-contract'
& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  run --rm test-runner
if ($LASTEXITCODE -ne 0) { throw 'Mock contract failed' }
```

第二级 `standalone-memory` 使用真实 Core/Proxy API 验证 A 写入、Core L0/L1 oracle、B 显式共享、C 隔离、身份冲突和模型上游 header 脱敏。当前 public fork 最终 ACL/envelope 修复尚未更新到根仓库 gitlink，因此 B shared bridge 的状态是 **Expected Blocked / Not Run**；只有 Task 4 最终 SHA、镜像标签和 gitlink 集成后才执行并允许转为 Passed：

```powershell
$env:TEST_SCENARIO = 'standalone-memory'
& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  run --rm test-runner
if ($LASTEXITCODE -ne 0) { throw 'Standalone memory gate failed' }
```

两个 Gate 都 exit 0 且 `$env:EVIDENCE_DIR` 内的 JSON 通过脱敏检查后，才进入 Claude headless 与 TUI。Runner 不保存 key hash、前缀或长度。Mock 只保存三个列明的布尔结果：`sensitive_value_seen` 检查 header 或 body 中的非凭证诱饵，`unexpected_credential_seen` 检查模型认证 header 是否偏离协议固定的 `mock-key`，`memory_user_credential_seen` 检查任意模型 header 或 body 是否出现 Memory 用户 key 的形态；原值、稳定派生值和长度均不保存。每次 bridge 请求还必须携带 `x-tdai-agent-source: claude-code`；它与 `x-vertex-ai-session-id`、gateway service token、team/agent/task/conversation headers 都不得到达模型上游。

证据 writer 在容器内拒绝符号链接/硬链接，并用同目录临时文件原子发布；这不等于验证了宿主 bind source。Docker 会先解析宿主的 `$env:EVIDENCE_DIR`，因此基础 Mock 实验仍把本地账户和该目录视为受信任边界。运行前需确认它是本次 run 的真实普通目录而非 junction/symlink；不要把容器内 no-follow 测试写成宿主防护已通过。

> **Sensitive named volume**：Docker 管理并跨普通 `down` 保留的数据卷；只要其中有 key、token、业务记忆、源码或用户工作文件，就要按仍持有敏感数据的存储管理。

停止开发栈时默认保留 named volumes：

```powershell
& $dockerCli compose -f tests/integration/compose.yaml down
```

`down` 不删除任何 named volume，也不删除 host evidence 目录。凭证卷包括 `runtime-config`/`real-core-config` 中的 gateway token、`bootstrap-state` 中的 admin/user keys、`claude-home-a/b/c` 中的 agent bundle 与渲染 settings，以及 real 层的 `proxy-private-config` DeepSeek key。`core-data`、`hub-data`、`proxy-data` 保存业务或会话数据，`claude-workspace-a/b/c` 可能保存源码与用户文件；这些也都是 sensitive named volumes。只有 `.runtime/runs/<run-id>/` 已脱敏归档、对应 reproduction report 已写入且明确要销毁该唯一实验项目时，才对该精确 `COMPOSE_PROJECT_NAME` 使用 `down -v --remove-orphans`；禁止全局 prune。

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

Host gate 会把真实 worktree root 与 canonical Windows config 目录写入短期 attestation；config 目录必须是仓库外的绝对真实路径，不能使用相对路径、junction 或仓库内 `.runtime`。`windows-config-init` 先核对 attestation，再一次读取 agent-a 私有 home 的 `agent-bundle.json`；它不挂共享 bootstrap state 或 DeepSeek secret。Settings 只把 bundle 中的 key 写入 `ANTHROPIC_AUTH_TOKEN`，生成 team/agent/task/conversation 四行身份 headers，并固定写入 `TDAI_MEMORY_PROXY_BASE_URL=http://127.0.0.1:8096`，保留 Claude 自带的 session header。上述启动与 TUI 仍为 Runtime Not Run。

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

- **Static Passed**：57/57 Node 测试，以及 base、hardened、real 和可选 Windows override 四组 `docker compose config --quiet` 已通过提交前复验。
- **本轮 Build Not Run**：当前 agent context 无法访问 Docker engine；最近一次有证据的 Hub/Claude Build 在拉取 Docker Hub token 时网络超时，named-context `COPY` 尚未得到实际构建证明。
- **Runtime Not Run**：未执行 `up`、业务探针、故障恢复或 Claude TUI。
- **Expected Blocked / Runtime Not Run**：B shared bridge 的 runner 契约已定义，但 ACL/envelope 修复的最终 public fork SHA、镜像标签和根 gitlink 尚未集成；不得误报通过。
- **Static config only**：Proxy auth、session、injection、extraction 与 tdai L0/L1 模板已启用，真实行为仍等待 public fork 集成与容器业务 Gate。
- **Expected Blocked / Runtime Not Run**：settings renderer 已分别固定 Docker `http://memory-proxy:8096` 与 Windows `http://127.0.0.1:8096` 的 `TDAI_MEMORY_PROXY_BASE_URL`，但 public fork 消费该字段的最终 commit 尚未更新根 gitlink；不能据此宣称 Windows memory tool 已可用。
- MemoryPanel 构建上下文缺少收窄用 `.dockerignore`；该 Medium 项留到下一次 Task 4 public fork commit，本轮不修改 submodule。
