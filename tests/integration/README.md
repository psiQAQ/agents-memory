# Docker 多客户端记忆实验

本目录保存可重复的 Docker 实验编排。当前状态是 **Static Passed / Runtime Not Run**：Node 契约测试和三层 Compose 解析已通过；镜像构建曾在访问 Docker Hub OAuth 时超时，因此不能据此声称服务已启动或记忆业务已通过。

> **Docker Compose**：用 YAML 一次声明多个容器、网络和数据卷，再用同一组命令启动或停止实验环境。

> **Mock**：返回固定结果的模拟模型服务。它不访问真实模型，适合默认测试协议、失败和恢复路径。

> **Profile**：只有显式选择才启用的一组 Compose 服务，例如 `redis`、`claude` 或会产生真实模型流量的 `real-claude`。

> **Gate**：真实模型服务启动前必须通过的安全检查，包括显式付费开关、预算、turn 上限、run ID、证据目录和工作区外 secret。

## 文件分层

| 文件 | 用途 | 默认付费流量 |
| -- | -- | -- |
| `compose.yaml` | Mock-only 基线；Core、Hub、Proxy、测试工具和隔离 Agent | 无 |
| `compose.hardened.yaml` | 在基线上仅发布 `127.0.0.1:8096`，并持久化 Proxy data/log | 无 |
| `compose.real.yaml` | 显式 `real-claude` profile、Gate 和 DeepSeek server secret | 有，必须另行批准并满足 Gate |

基础层的 Proxy 故意不挂持久 data volume，用来记录“容器强制重建后 session 丢失”的原始基线；hardened 和 real 层才挂 `proxy-data`。Proxy 没有到 Hub 的运行时依赖，Hub 停止时 Proxy/Core 数据面仍应能独立重启；该行为尚待 Task 5 运行验证。

## 1. 静态验证

以下命令从仓库根目录运行。`MEMORY_CORE_GATEWAY_API_KEY` 是一次性实验网关 token，不是 DeepSeek key。

```powershell
$env:MEMORY_CORE_GATEWAY_API_KEY = 'replace-with-a-disposable-lab-token'

node --test tests/integration/test/*.test.mjs

docker compose `
  -f tests/integration/compose.yaml `
  config --quiet

docker compose `
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
  $env:DEEPSEEK_SECRET_FILE = $secretFile
  $env:RUN_PAID_LLM = '1'
  $env:REAL_LLM_MAX_BUDGET_USD = '0.01'
  $env:REAL_LLM_MAX_TURNS = '1'
  $env:RUN_ID = $runId
  $env:EVIDENCE_DIR = $evidenceDir

  docker compose `
    -f tests/integration/compose.yaml `
    -f tests/integration/compose.real.yaml `
    config --quiet
} finally {
  Remove-Item -LiteralPath $secretFile -Force
  Remove-Item -LiteralPath $evidenceDir -Force
}
```

## 2. Mock 开发栈（待镜像构建网络恢复后运行）

每次实验使用唯一 project 与 run ID，避免复用旧 bootstrap 状态：

```powershell
$env:RUN_ID = 'mock-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$env:COMPOSE_PROJECT_NAME = "mem-it-$env:RUN_ID"
$env:MEMORY_SPACE_ID = 'default'

docker compose `
  -f tests/integration/compose.yaml `
  up --build
```

停止开发栈时默认保留 named volumes：

```powershell
docker compose -f tests/integration/compose.yaml down
```

只有证据已归档且明确要销毁该唯一实验项目时，才对该 project 使用 `down -v --remove-orphans`；禁止全局 prune。

## 3. Hardened Windows 入口

Windows 原生 Claude Code 需要 loopback Proxy，因此叠加 hardened 层：

```powershell
docker compose `
  -f tests/integration/compose.yaml `
  -f tests/integration/compose.hardened.yaml `
  up --build
```

此时只有 Proxy 发布到 `127.0.0.1:8096`；Core 和 Hub 不发布宿主端口。Windows Claude 的项目专用 settings 应由 `tools/render-settings.mjs --target windows` 生成，不覆盖用户全局配置。

## 4. Redis profile

Redis 只用于 Proxy session/cache。必须同时显式选择 Redis profile 和受限配置文件；只启动 Redis 容器不算启用：

```powershell
$env:MEMORY_PROXY_CONFIG = 'config.redis.yaml'

docker compose `
  --profile redis `
  -f tests/integration/compose.yaml `
  up --build redis memory-proxy
```

`run-proxy.sh` 只接受 `config.yaml` 或 `config.redis.yaml`，拒绝路径和其他文件名。恢复基础模式：

```powershell
Remove-Item Env:MEMORY_PROXY_CONFIG -ErrorAction SilentlyContinue
```

## 5. Docker Claude Code

Bootstrap 成功后，每个 Agent 在启动时都从脱敏模板重建自己的 `settings.json`，并只读取自己的 Memory 用户 key。A/B/C 的 home 与 workspace 是六个互不共享的 named volumes。

Headless 版本检查：

```powershell
docker compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  run --rm claude-agent-a --version
```

交互式启动，供用户确认 TUI：

```powershell
docker compose `
  --profile claude `
  -f tests/integration/compose.yaml `
  run --rm claude-agent-a --interactive
```

`--interactive` 只由镜像入口消费，随后以无额外参数的 `claude` 启动。当前未完成镜像构建和 TUI 人工确认，因此这两条命令仍是 **Not Run**。

## 6. 真实 DeepSeek（Blocked / Not Run）

只有旧 key 已撤销、新 key 位于工作区外、用户明确批准真实测试后，才可以加载 `compose.real.yaml` 和 `real-claude` profile。客户端容器不会挂载 DeepSeek secret；它们只使用 bootstrap 生成的 Memory 用户 key。

真实 Gate 的 `REAL_LLM_MAX_BUDGET_USD` 和 `REAL_LLM_MAX_TURNS` 不能硬性限制 Core/Knowledge 后台请求总费用。首轮必须一次只运行一个场景，并记录 Proxy、Core、Knowledge 的请求数与 usage。

## 当前已知限制

- **Static Passed**：36 项 Node 测试和 base/hardened/real 三组 `docker compose config --quiet` 已通过。
- **Build Failed**：Hub/Claude 构建在拉取 `docker/dockerfile:1` 的 Docker Hub OAuth token 时网络超时；named-context `COPY` 尚未得到实际构建证明。
- **Runtime Not Run**：未执行 `up`、业务探针、故障恢复或 Claude TUI。
- Proxy auth/session/injection 暂时显式关闭，等待 public fork 的 Task 4 service bearer 修复后再启用。
