# 2026-08-10 Docker 无付费记忆业务运行通过

> **Data plane**：实际承载客户端请求、记忆写入和读取的服务路径；本 run 的 data plane 是 Proxy、Core 与本地 Mock，不包含真实 DeepSeek。

> **L0 / L1**：L0 是 Core 保存的原始对话层，L1 是从对话提炼出的原子记忆层；runner 直接查询两层作为业务证据。

> **Headless**：不进入交互界面的命令行验证，例如只执行 `claude --version`。

> **Read-only business probe**：真实调用服务业务 API，但不修改业务状态的检查；健康状态本身不能替代该探针。

> **One-shot**：只应执行一次并在完成后退出的初始化或配置容器任务。

> **Internal network**：只连接同一 Compose project 内服务、默认不提供公网出口的 Docker 网络。

- 类型：Append-only reproduction report
- 日期：2026-08-10
- Run ID：`docker-mock-20260810-033636`
- Compose project：`mem-it-20260810-033636`
- 验证基线根仓库 HEAD：`deee5cea2ade01750ad991677c6d27693d80dc97`
- 文档落盘边界：上述验证基线加本报告所在集成 commit 的 tracked changes；本报告不预写未来 commit SHA
- Public fork SHA：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 原始证据目录：`.runtime/runs/docker-mock-20260810-033636/`
- 结论：Gate 1 Passed；Gate 2 Passed；Hub health 与只读业务探针 Passed；Docker Claude config precheck 与 `2.1.207` headless version Passed；TUI **Awaiting User Confirmation**

## 构建与准备

Session 前置条件修复后只重建 tools/test-runner image，未使用 `--pull`。Compose 缺少必须的一次性非模型环境值时，第一次 build 命令在插值阶段 fail-closed，未创建资源；补充一次性值后 build exit 0：

- 旧 tools local image ID：`sha256:677c74dfae61304f6a329f9f607c3d81e558efce243e9ff8060c22cd564f60a2`
- 新 tools local image ID：`sha256:3d4853b4e098c6a163ff87f98c942a7d9f2a7d4fd1439ea755f61152a9b000bb`

Core、Hub、Proxy 与 Claude 四个镜像继续匹配 `docker-mock-20260810-015646` 记录的 exact local image ID。Docker client/server `29.6.2`、Docker Desktop `4.85.0`、`desktop-linux` context、Compose `5.3.1` 和 base/tools/Claude parse 均 Passed。

新 project 启动前没有同名容器、volume 或 network。显式 stack 准备 exit 0；readiness 首次查询确认 `config-init`/`bootstrap` 为 `exited|0`，Mock/Core/Proxy 为 `running|healthy`。

## 两级业务 Gate

两个 runner 都在同一已准备 project 中以 `run --rm --no-deps test-runner` 执行：

| Gate | 结果 | 断言与覆盖 |
| -- | -- | -- |
| `mock-contract` | Passed，exit 0 | 11 项；OpenAI text/stream/tool、Anthropic text/thinking-stream/tool、count-tokens、400/429/500 与 timeout |
| `standalone-memory` | Passed，exit 0 | 12 项；未认证拒绝、A 写入、Core L0/L1 oracle、冲突身份拒绝、缺失/forged source 拒绝、B session 初始化与共享读取、C session 初始化与隔离、最终上游 header hygiene |

**Verified Fact：** A 写入后，Core 的 L0/L1 oracle 都找到对应结果；显式绑定的 B 读到该共享记忆，未绑定的 C 没有读到。未认证、身份冲突、缺失 source、forged source 四项拒绝负测均记录 zero model side effect；C 隔离断言记录共享 nonce 命中为 0。正向断言均有匹配结果或模型观察。报告不保留业务 nonce、用户/team/agent/task/session ID 原值或稳定 credential 派生值。

最初的本地 evidence checker 错误地假设两个文件有相同顶层 schema，因此在 runner 已通过后拒绝 standalone 文件。修正 checker 以匹配各自源码契约后，两文件均通过；没有重跑或覆盖证据。

## 脱敏证据

证据目录含两个 ordinary、non-symlink 文件，link count 均为 1：

| 文件 | 状态 | 断言 | SHA-256 |
| -- | -- | --: | -- |
| `mock-contract.json` | `ok` | 11 | `a8e8de0c159dc09bc0e12c6961ff038fe15b98f05e08844bd4d88c5c489d626a` |
| `standalone-memory.json` | `ok` | 12 | `85693e208cbec9e7675b8ba248819c874e2d6ea11dad89ffeee17fc9c00560ed` |

Checker 验证了允许的 schema、断言顺序、精确 status、负向 zero-side-effect 与正向观察数。它没有在文件中发现一次性 gateway 值或名称、Memory 用户 key 形态、DeepSeek marker、业务 marker 前缀、authorization 字段、message body 或 content 字段。

## Agent、Hub 与 Claude

`agent-config-a` 以 `up --no-deps` 只准备一次，固定输出 `status=ok`，exit 0。

Hub 以 `up -d --no-deps memory-hub` 启动并达到 `running|healthy`。健康状态未被当作业务证明；随后在 tools 容器内执行只读业务探针：

- Panel `POST /api/v1/meta/team/get`：HTTP 200、业务 `code=0`、返回 team 与 manifest 匹配；
- Knowledge `POST /v3/wiki/list`：HTTP 200、业务 `code=0`、`items` 为数组、`total` 为非负整数。

第一次探针命令重复写了 `node`，而 tools image 已将 Node 设为 entrypoint，因此在发出任何 HTTP 请求前以 module-not-found 退出。删除重复单词后，同一只读探针 exit 0；输出仅包含 status、业务 code 与结构布尔值，不包含 credential、正文或 ID。

Docker Claude 使用 `run --rm --no-deps claude-agent-a --version`：entrypoint config precheck 固定输出 `status=ok target=docker`，随后输出 `2.1.207 (Claude Code)`，exit 0。该结果证明镜像、配置入口和 CLI 版本可启动；不证明 TUI、streaming、tool use 或真实 DeepSeek 兼容。

## DeepSeek 与保留状态

**Verified Fact：** 本 run 只选择默认 Mock 服务，Compose network 为 `internal=true`。项目日志扫描未发现 `DeepSeek`、一次性 gateway 原值或 Memory 用户 key 形态。

**Inference：** 所选 profile/service 的 DeepSeek 请求数为 0；这不是 packet capture，不能证明宿主所有进程没有其他外部流量。

项目为用户 TUI 确认而保持运行：

- 四个长期服务 `mock-llm`、`memory-core`、`memory-proxy`、`memory-hub` 均为 `running|healthy`；
- 三个 one-shot `config-init`、`bootstrap`、`agent-config-a` 均为 `exited|0`；
- 一个 internal project network；
- 六个 named volumes：bootstrap state、Core data、Hub data、runtime config、Claude home A、Claude workspace A。

没有执行 `down`、`down -v` 或 prune。这些卷仍按敏感项目状态管理。

## 用户 TUI handoff

在新的 PowerShell 窗口中进入当前 worktree，恢复精确 run/project/space 与绝对证据目录。Compose 即使使用 `--no-deps` 仍会先做 YAML 插值，因此只为本次 parse 生成一个新的占位值：

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

该 `compose-parse-only-<guid>` 只允许用于上面这条 `run --rm --no-deps claude-agent-a --interactive` 的 YAML 解析。**不得**用它执行 `up`、`create`、`recreate`、省略 `--no-deps` 的 run 或任何会重建既有服务的命令；否则可能用占位值替换真实运行配置。

**Recommendation：** 只按上述精确 handoff 启动交互命令并由用户确认 TUI；确认前不要对该 project 执行 `down`，任何时候都不要全局 prune。

**当前状态：** Docker Claude TUI Awaiting User Confirmation。
