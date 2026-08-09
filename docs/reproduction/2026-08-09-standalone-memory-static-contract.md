# 2026-08-09 Standalone Memory 静态契约记录

> **Static contract**：通过单元测试、文件解析和 Compose 展开检查接口与安全边界；不代表镜像已构建或服务已运行。

> **Gitlink**：根仓库记录 submodule 精确提交的指针；工作目录里更新了 submodule 源码，不等于根仓库已经采用该版本。

> **Expected Blocked**：测试已定义，但它依赖尚未合入根仓库 gitlink 的 public fork 修复；当前运行应被视为预期不能通过，而不是成功证据。

> **Append-only reproduction report**：实验完成后只新增、不覆盖旧实验记录的复现报告，便于追溯当时的输入、版本和结论。

> **SHA**：Git 对某个提交内容计算的唯一标识，用来固定本次检查基于哪个版本。

> **Identity**：当前客户端的 service、team、user、agent、task、session 与显示名；它与该客户端 key 一起存入私有 bundle。

> **Agent bundle**：只属于一个客户端的私有 JSON 文件，把该客户端 key 与 identity 作为完整整体切换。

> **Fingerprint**：从敏感值稳定派生、可跨记录关联的标识。本记录禁止保存 key fingerprint。

> **Sentinel**：用于泄漏探测的非凭证唯一标记；Mock 只报告是否看到它，不记录原值。

> **TUI**：Claude Code 在终端中显示并接收键盘操作的交互界面。

> **ACL**：服务端用于决定某个 user、team 或 agent 能否读取一项记忆的访问控制规则。

- 类型：Append-only reproduction report
- 范围：私有根仓库 Task 5；未修改 TencentDB submodule
- 日期：2026-08-09
- 根仓库基线 SHA：`501a578a9e0ef62f288bc211262cd076f5e523e0`
- Task 5 实施提交 SHA：`4714e107c873e968eca75de0569c4d2a770aa443`
- 根仓库记录的 submodule gitlink：`c75ef5834eeacf17f2df8f84f7cf2d1747822de2`（本次不更新）
- 结果：Static Passed；Build Not Run（本次，既有记录曾受 registry network 阻塞）；Runtime Not Run
- 共享 bridge：Expected Blocked / Not Run，等待 public fork 最终 SHA 与根仓库 gitlink 集成

## 目标

建立默认无付费的 standalone 业务 Gate，使 A 的写入能由 Core L0/L1 oracle 确认，B 只能通过显式共享资产读取，C 保持隔离；同时确保每个 Claude home 只获得自己的身份与用户 key，且身份、用户 key、gateway service token 和内部 headers 不泄漏到模型上游或运行报告。

## 实现事实

1. `prepare-agent` 从脱敏运行清单只选择当前客户端，将 Memory 用户 key 与 7 个 identity 字段写入私有 `agent-bundle.json`。文件在 Linux 目标中的权限为 `0600`、所有者编号为 `10001`，home 与 `.memory` 权限为 `0700`；单个同目录临时文件加一次文件替换是唯一发布点。测试证明替换前仍读取完整旧 bundle，替换失败保留旧 bundle；符号/硬链接、跨 space、非法 ID 与跨客户端输入都被拒绝。
2. Docker 与 Windows settings 渲染器一次读取同一 bundle，只生成四行 `x-team-id`、`x-agent-id`、`x-task-id`、`x-conversation-id`；key 只进入 `ANTHROPIC_AUTH_TOKEN`，没有生成 `x-claude-code-session-id`。模板占位符只有位于 `env.ANTHROPIC_BASE_URL` 且渲染结果等于预先允许的本地 Proxy URL 才会通过；`TDAI_MEMORY_PROXY_BASE_URL` 分别固定为 Docker `http://memory-proxy:8096` 与 Windows `http://127.0.0.1:8096`，模板不能预设外部地址。
3. Bootstrap 使用真实 Core endpoint/body/response 契约核实 A 的 team-visible `chat_memory` asset；B 的全量覆盖操作先保留既有绑定再追加 A，并逐字段核实 B 原绑定未被 Core 改写，C 显式排除。运行清单使用 `0600` 临时文件加 rename 发布；Core、write 或 rename 失败均不生成正式运行清单。
4. Mock 识别 Core 的真实结构化提炼提示，确定性返回携带原 message ID 与 nonce 的 L1 JSON；Mock Core 关闭去重，real Core 保持去重。
5. `standalone-memory` runner 保留原 `mock-contract`，新增认证、A 写入、Core L0/L1、B/C、冲突身份与上游 header 脱敏 Gate。Proxy 正向写入必须使 Anthropic Mock 请求数精确增加 1，并立即检查该条 observation，不能用本地伪响应、仅有 Core OpenAI 观察或后来被截断的干净记录代替模型转发。L1 轮询最终必须同时满足 HTTP 成功、业务 `code === 0` 和 owner nonce 匹配；HTTP 200 但业务失败的 envelope 即使夹带匹配 items 也会拒绝。主请求主动发送带非凭证诱饵的 `x-claude-code-session-id` 与 `x-vertex-ai-session-id`，由 Mock 的值检测和禁止 header 名双重确认它们未到上游。每次 bridge 请求显式携带 `x-tdai-agent-source: claude-code`；缺失/伪造来源、认证失败和身份冲突前后都比较 Anthropic Messages、Anthropic `count_tokens` 与 OpenAI 模型请求总数，任何模型副作用都拒绝。输出只有证据 hash、status、count、latency，没有 key 派生 fingerprint。
6. Mock 对 header 与 body 只返回 `sensitive_value_seen`、`unexpected_credential_seen`、`memory_user_credential_seen` 三个布尔值。OpenAI 路径必须且只能收到 `Authorization: Bearer mock-key`，Anthropic 路径必须且只能收到 `x-api-key: mock-key`；缺失、错误或同时出现另一种认证 header 都记为异常。敏感形态若出现在 header 名或 JSON 属性名，同样计入布尔值并在 observation shape 中替换为固定占位符。诱饵不是凭证；用户 key、gateway service token、诱饵原值、请求内容及其 hash 都不进入 observation、runner JSON 或本报告。Mock 最多保留 100 条 observation；达到上限表示可能发生截断，runner 必须 fail-closed。`x-tdai-agent-source`、`x-vertex-ai-session-id` 与其他内部 headers 都属于模型上游禁止集。
7. Compose runner 只读挂载 bootstrap state 与不含 DeepSeek key 的 runtime config，依赖 Core/Proxy/Mock/bootstrap，不依赖 Hub；证据使用拒绝跟随链接、`0600`、同目录临时文件加 rename 写入 host `.runtime/runs/<run-id>/`。
8. Real Compose 的默认网络保持 internal；只有 Core、Hub、Proxy 额外加入外网出口网络 `egress-net`。DeepSeek Proxy config 写入独立 `proxy-private-config`，只有一次性 `real-config-init` 与 Proxy 可挂载；bootstrap/runner/Claude 不能直接出网，也不能读取该卷。

## TDD 证据

以下行为均先观察到目标失败，再实施最小修复：

| Gate | RED | GREEN |
| -- | -- | -- |
| identity 分发与 settings | 双文件发布可在两次替换之间留下新 key/旧 identity；模板可把占位符藏在非 base URL 字段 | 单 bundle 发布点、替换失败与恶意模板测试 Passed |
| key fingerprint 与上游内容脱敏 | 新测试要求请求 header/body 都只返回布尔观察结果 | Mock/runner 聚焦测试 Passed |
| gateway 服务凭证与内部 identity 诱饵 | Mock 初始未检查请求正文，runner 初始未禁止 `x-vertex-ai-session-id` | Mock/runner 聚焦测试 Passed |
| Proxy 模型转发与原生 session header | 正向只核 Anthropic-shaped 响应；禁止集未证明客户端实际发送 Claude/Vertex session header | Anthropic 请求增量必须为 1；两种 session header 的请求输入、上游禁止名和值诱饵均有断言 |
| Mock 模型认证 | 缺少 OpenAI/Anthropic 上游凭证时旧 observation 仍标为正常 | 两种协议都要求精确 `mock-key`，缺失/错误/冲突凭证均标为异常 |
| Observation 原值与截断 | 敏感 header/body 属性名会原样留在 shape；早期泄漏可被 100 条干净记录挤出 | 敏感名固定占位、正向 observation 立即检查、达到 100 条上限 fail-closed |
| 负向模型副作用 | 认证/身份/bridge 负测只比较 Anthropic 请求数 | 同时比较 OpenAI 与 Anthropic 总数，任一增量都失败 |
| Bootstrap 资产与发布 | 初始只核 asset ID，运行清单直接写正式路径 | binding 字段改写、运行清单写入/替换失败测试 Passed |
| Core L1 业务 envelope | HTTP 200、业务 `code != 0` 且夹带 matching items 时旧最终断言可误通过 | 最终同时要求 HTTP 成功、`code === 0` 与 owner nonce 匹配 |
| Real secret/network reachability | 初始共享 real config 卷与外网 default network 扩大可达面 | private volume 与最小 egress Compose contract Passed |
| host evidence bind | Compose 初始把 `/evidence` 解析为 named volume | 5/5 Compose contract tests Passed |

Bootstrap、配置模板、runner 拓扑和安全负向测试也在本次 Task 5 过程中按 RED→GREEN 实现；最终全量结果以本记录提交前的验证节为准。

## 运行命令（尚未执行）

```powershell
$env:RUN_ID = 'mock-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$env:COMPOSE_PROJECT_NAME = "mem-it-$env:RUN_ID"
$env:MEMORY_SPACE_ID = 'default'
$env:EVIDENCE_DIR = Join-Path (Resolve-Path -LiteralPath .).Path ".runtime\runs\$env:RUN_ID"
[IO.Directory]::CreateDirectory($env:EVIDENCE_DIR) | Out-Null

docker compose --profile tools -f tests/integration/compose.yaml `
  up -d --build mock-llm config-init memory-core memory-proxy bootstrap

docker compose --profile tools -f tests/integration/compose.yaml `
  run --rm test-runner
```

第一步只启动数据面和一次性 Bootstrap；第二步单独运行业务 Gate。只有第二步 exit 0 且 `.runtime/runs/<run-id>/standalone-memory.json` 通过脱敏检查，才允许进入 Claude headless/TUI。

## 验证结果

| 检查 | 结果 | 说明 |
| -- | -- | -- |
| Node tests | Passed | 57/57，exit 0 |
| base/hardened/real/Windows Compose config | Passed | 4/4 `config --quiet` exit 0；仅静态解析 |
| Bash syntax | Passed | 根仓库全部 `.sh` 经 Git Bash `bash -n`，exit 0 |
| LF | Passed | 本次 30 个变更/新增普通文件扫描，CR 字节计数 0；不把 submodule gitlink 计作普通文件 |
| Secret/diff scan | Passed | 只输出计数：credential shape 0、credential fingerprint field 0、禁止跟踪路径 0；`git diff --check` exit 0 |
| Docker CLI/engine diagnostic | Client only | Client 29.6.2 可执行；当前执行上下文无法访问 Docker config/named pipe，Server 为 null |
| Docker build | Not Run（本次） | 既有报告记录过 Docker Hub registry/network 失败；本轮未构建 |
| Docker runtime | Not Run | engine 当前不可用于端到端启动 |
| B shared bridge | Expected Blocked / Not Run | 等待 public fork ACL/envelope 修复最终 SHA |

## 已知限制

- 根 settings 已为 Docker/Windows 分别生成 `TDAI_MEMORY_PROXY_BASE_URL`，但 public fork 消费该字段的最终 commit 尚未更新根 gitlink；Windows memory tool 仍是 Expected Blocked / Runtime Not Run。
- 当前根 Compose 镜像标签与 submodule gitlink 尚未更新到 public fork Task 4 最终修复，不能把静态 runner 契约当作 ACL runtime 证据。
- 没有启动 Hub 不妨碍 Proxy/Core 数据面 Gate；Panel/Knowledge 行为仍需单独实验。
- Runner 的拒绝跟随链接检查只覆盖容器内目标；Docker 会先解析宿主 `EVIDENCE_DIR`，基础 Mock run 仍信任本地账户与人工确认的普通宿主目录，不能据此声称宿主 junction/symlink 已被拦截。
- Real 的 `proxy-private-config` 会保留已渲染的 DeepSeek key；普通 `down` 或删除宿主 secret 不会清卷。真实 run 必须用唯一 Compose project，归档后精确 `down -v --remove-orphans`，否则继续按敏感卷管理。
- 原始 JSON 位于忽略目录；证据归档前保留该 run 的目录和 volumes，禁止全局 prune。
