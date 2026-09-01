> **状态：Historical** — 本记录只证明 2026-08 实验当时的状态，不是当前可执行流程。

# 2026-08-10 Windows Claude Mock Gateway 运行通过

> **Headless**：不进入交互界面的命令行验证。本报告证明原生 Windows Claude CLI 请求链，不证明 TUI 用户体验。

> **Loopback Gateway**：只在 Windows 本机 `127.0.0.1` 接收 TCP 连接，并把字节原样转发到 internal 网络中的 MemoryProxy。

- 类型：Append-only reproduction report
- 日期：2026-08-10
- Run ID：`windows-mock-20260810-111850-93778ced`
- Compose project：`mem-win-windows-mock-20260810-111850-93778ced`
- 验证基线根仓库 HEAD：`c9d87feffca11cb8445f091b164d4c376fa300d7`
- Public fork SHA：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 原始证据目录：`.runtime/runs/windows-mock-20260810-111850-93778ced/`
- Windows Claude config：`C:\Users\ustcw\AppData\Local\refine-memory\runs\windows-mock-20260810-111850-93778ced\claude-agent-a`
- 结论：Windows 10 原生 Claude `2.1.207` 经 Loopback Gateway 的 Mock headless **Runtime Passed**；Windows TUI **Awaiting User Confirmation**

## 预检、构建与保留边界

Docker client/server `29.6.2`、Docker Desktop `4.85.0`、`desktop-linux` context 和 Compose `5.3.1` 均通过预检。启动前 `127.0.0.1:8096` 没有真实 listener。本 run 使用唯一 project，没有复用 `mem-it-20260810-033636`、`mem-win-20260810-093140-a664249f` 或其 volumes/evidence。

只 fresh build 了包含 TCP 转发器的 `refine-memory-integration-tools:local`，未使用 `--pull`；最终 image ID 为 `sha256:e2479306af4d59450b4518269096ba787cc6d027d2f79cd70ac1f09a79346cb2`。只启动 `mock-llm`、`config-init`、`memory-core`、`memory-proxy`、`bootstrap` 与 `loopback-gateway`；没有启动 Hub、Redis、Docker Claude 或 real profile，也没有读取/加载 DeepSeek secret。

readiness 在两分钟 deadline 内确认：

- `config-init`、`bootstrap` 为 `exited|0`；
- `mock-llm`、`memory-core`、`memory-proxy`、`loopback-gateway` 为 `running|healthy`。

预检时已存在的 Docker project 未被停止、重建或删除。完成后 `mem-it-20260810-033636` 仍有 8 个原容器、1 个 network、6 个 volumes；`mem-win-20260810-093140-a664249f` 仍有 6 个原容器、1 个 network、6 个 volumes。没有执行 `down`、`down -v` 或 prune。

## 两级业务 Gate 与宿主边界

两个 runner 都在同一 project 中使用 `run --rm --no-deps test-runner`：

| Gate | 结果 | 覆盖 |
| -- | -- | -- |
| `mock-contract` | Passed，exit 0，11/11 | OpenAI text/stream/tool、Anthropic text/thinking-stream/tool、count-tokens、400/429/500、timeout |
| `standalone-memory` | Passed，exit 0，12/12 | A 写入、Core L0/L1 owner oracle、B 显式共享、C 隔离、4 项拒绝负测 zero model side effect、上游 header hygiene |

第一次控制脚本错误地要求成功 stdout 包含字面量 `11/11`，而 runner 的契约是成功时原子写 evidence、stdout 可为空。runner 当次 exit 0，`mock-contract.json` 已是 `status=ok` 且精确 11 项；核对源码契约后在同一仍运行 project 继续，没有重跑 Bootstrap、`up` 或 Gate 1，也没有修改源码。

Windows 宿主执行 `curl.exe --noproxy '*' --fail --silent --show-error http://127.0.0.1:8096/health` 成功。`docker inspect` 进一步确认：

- MemoryProxy 没有 `HostConfig.PortBindings`；
- Gateway 仅发布 `127.0.0.1:8096`；
- Gateway 没有 mounts/secret/volume，`CapDrop` 包含 `ALL`。

## Windows 项目专用配置

`agent-config-a`、host attestation 与 `windows-config-init` 均 exit 0。配置目录位于仓库外且绑定本次 run；全局 `C:\Users\ustcw\.claude\settings.json` 只记录元数据，没有读取内容：

| 元数据 | before | after |
| -- | --: | --: |
| exists | `true` | `true` |
| mtime UTC ticks | `639218677719156772` | `639218677719156772` |
| size | `3072` | `3072` |

## Windows Claude headless 与只读 oracle

独立 Windows PowerShell 子进程保存并在 `finally` 恢复 `MEMORY_CORE_GATEWAY_API_KEY`、`CLAUDE_CONFIG_DIR` 与列明的 `ANTHROPIC_*` 变量。直接把含分号 prompt 的字符串传给 Windows PowerShell `-Command` 会丢失参数引号；控制层 fail-closed 后改用 UTF-16LE Base64 的 `-EncodedCommand` 传递同一子脚本，并重新生成 marker、重新取得 Mock before。tracked 代码未因此改变。

实际成功调用保留完整 `$claudeProbeScript` 中的 `try/finally` 环境隔离、`2.1.207` 精确版本检查和只接受 `mock text` 的回复检查，只把父子 PowerShell 传递方式改为：

```powershell
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($claudeProbeScript))
& powershell.exe -NoProfile -EncodedCommand $encoded
if ($LASTEXITCODE -ne 0) { throw 'Windows Claude headless probe failed' }
```

最终通过结果：

- `claude --version`：`2.1.207 (Claude Code)`，exit 0；
- `claude -p`：回复只表达 `mock text`，exit 0；
- Anthropic `/messages`：before `5`，after `6`，delta `1`；
- `sensitive_value_seen=false`；
- `unexpected_credential_seen=false`；
- `memory_user_credential_seen=false`；
- `internal_identity_header_seen=false`；
- Core oracle：HTTP `200`、业务 code 为 0、owner hits `1`、owner mismatch `0`、累计 `58 ms`。

probe 只保存上述脱敏计数、状态、耗时和布尔值，不保存 marker、ID、token、credential、请求头或响应正文。

## 脱敏证据

三个文件均为 ordinary、non-reparse 文件：

| 文件 | 状态/断言 | SHA-256 |
| -- | -- | -- |
| `mock-contract.json` | `ok`，11 | `904e4c9f41cc5164b50b1a5f75a3a0dee8aad67a4a6611b62c294a30c94876dd` |
| `standalone-memory.json` | `ok`，12 | `0a1d72a5c6bf51515ec33ebcf0519916eb22516e3dbaded8b2497f479336d613` |
| `windows-headless-probe.json` | `completed=true` | `0eaf0e376a2a427aa15ecd654998ab25bd5ade45844b8950ccc4d60038eaba80` |

## 结论边界与保留状态

本 run 只证明 Windows 10 原生 Claude Mock headless 路径。Docker Linux Claude 的已通过结论来自独立历史 run `docker-mock-20260810-033636`，本 project 没有重跑 Docker Claude。双客户端汇总必须同时引用两个 run，不能把它们写成同一 project 的联合会话。

Windows TUI、streaming/tool/thinking、真实 DeepSeek、Win11、LAN、WSL Claude、Gateway/Proxy/Core 故障恢复与备份还原仍为 **Not Run**。未经用户人工确认，不声明 G5 Windows UX Passed。企业试点/部署继续 **No-Go**；本机默认 Mock 开发保持 **Conditional Go**。

本 project 为人工 TUI 确认保持运行：4 个长期服务 healthy，3 个 one-shot exited 0，2 个 networks 与 6 个 named volumes 均保留。任何时候都不得用全局 prune 清理它。

## 用户 TUI handoff

在同一 run-specific `CLAUDE_CONFIG_DIR` 启动 Windows Claude TUI。用户需确认两点：界面正常显示并可输入；发送 `Reply exactly mock text; no tools` 后收到只表达 `mock text` 的回复。确认后另写 append-only TUI 记录；本报告不会预写该结论。
