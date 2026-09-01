> **状态：Historical** — 本决策只适用于已归档的 2026-08 实验，不构成当前仓库的执行要求。

# ADR-2026-08-09：Standalone Memory 身份、共享与证据 Gate

> **ADR**：Architecture Decision Record，即记录某项架构选择、原因和后果的决策文档。

> **Standalone Memory Gate**：在启动真实 Claude 前，用确定性 Mock、真实 Core/Proxy API 和三套隔离身份验证认证、记忆写入、共享边界与上游脱敏的业务检查。

> **Oracle**：不依赖模型回答猜测结果，而是直接查询 MemoryCore 的权威数据结构来判断 L0 对话和 L1 原子记忆是否已写入。

> **Identity**：当前客户端的 service、team、user、agent、task、session 和显示名；它决定请求以谁的身份访问哪一组记忆。

> **Fingerprint**：从敏感值稳定派生、可用于跨记录关联的标识。本项目的运行结果禁止保存 key fingerprint。

> **Sentinel**：故意注入的非凭证唯一标记，用来判断内部字段是否误传到模型上游；只记录“是否出现”的布尔结果。

> **Atomic publish**：先完整写好同目录临时文件，再用一次 rename 切换正式文件；读取方只会看到旧版本或完整新版本。

> **Agent bundle**：只属于单个客户端的私有 JSON 文件，把 Memory 用户 key 与当前 identity 作为一个整体发布。

**状态：** Accepted
**验证状态：** Static Passed；Build Not Run（本次）；Runtime Not Run

## Context

仅验证 HTTP 200、容器 `healthy` 或 Mock 协议不能证明记忆已按正确身份写入。Bootstrap 的共享资产绑定、Claude settings 的身份 headers、Core 的 L0/L1 结果结构和 Proxy 的上游 header 边界必须形成一个可复现 Gate。同时，SEC-LOCAL-001 禁止在报告中记录任何 key 的内容、长度、前缀或稳定 fingerprint。

## Decision

1. `prepare-agent` 只从脱敏 `run-manifest.json` 读取被选中的客户端，向该客户端私有 home 原子发布单个 `.memory/agent-bundle.json`。Bundle 只含当前 Memory 用户 key 和 `service_id`、`team_id`、`user_id`、`agent_id`、`task_id`、`session_id`、`display_name` identity，使用 mode `0600`；拒绝跨 space、CRLF、冒号、空值、过长值、符号链接和硬链接。单次 rename 是唯一发布点，更新被中断时正式路径仍指向完整旧 bundle。
2. `render-settings` 一次读取 bundle，只把 `team_id`、`agent_id`、`task_id`、`session_id` 转成 `ANTHROPIC_CUSTOM_HEADERS`；`user_id` 与 `display_name` 不进入 headers，Memory 用户 key 只进入 `ANTHROPIC_AUTH_TOKEN`，不覆盖 Claude 自带的 `x-claude-code-session-id`。模板占位符必须精确位于 `env.ANTHROPIC_BASE_URL`，渲染后 URL 必须等于 Docker/Windows 允许地址清单中的本地 Proxy 地址；同时分别写入 Docker `http://memory-proxy:8096` 或 Windows `http://127.0.0.1:8096` 的 `TDAI_MEMORY_PROXY_BASE_URL`，拒绝模板预设外部地址。
3. Bootstrap 必须以正确 caller key 和 gateway 服务凭证核实 A 的 `chat_memory` asset，把 visibility 改为 `team`；B 的全量 `agent-fixed-asset/set` 先保留自身绑定再追加 A，随后按 `asset_id` 逐字段核实 B 原绑定的 `asset_type`、`injection_mode`、`priority`、`created_by` 未变，C 不绑定 A。脱敏运行清单只记录 asset IDs、source、consumers 与 excluded，并以 `0600` 临时文件加一次 rename 发布；任何步骤失败都不生成正式运行清单。
4. `standalone-memory` runner 依次检查 Proxy 认证正反向、A 写入、Core `data.messages` L0 owner oracle、Core `data.items` L1 轮询、B 共享、C 隔离、同 session 身份冲突和 Mock 上游 header 脱敏。正向 Proxy 写入必须使 Anthropic Mock 请求数精确增加 1并立即核验该条 observation；L1 最终结果必须同时满足 HTTP 成功、业务 `code === 0` 与 owner nonce 匹配，不能因错误 envelope 夹带 items 而误通过。主请求必须实际携带带非凭证诱饵的 Claude/Vertex session header，并由上游禁止名和值检测证明未泄漏。每次 bridge 请求显式携带 `x-tdai-agent-source: claude-code`，缺失或伪造都必须拒绝；认证、身份和来源负测前后都比较 OpenAI、Anthropic Messages 与 `count_tokens` 请求总数，任何副作用都失败。结果只保存 status、count、latency 与由 run ID/asset ID 生成的证据 hash。
5. 上游泄漏测试使用每次运行生成的非凭证 sentinel。Mock 只保存列明的三个布尔结果：`sensitive_value_seen` 扫描 header 与 body 中的 sentinel；`unexpected_credential_seen` 要求 OpenAI 只使用 `Authorization: Bearer mock-key`、Anthropic 只使用 `x-api-key: mock-key`，缺失、错误或冲突凭证均失败；`memory_user_credential_seen` 扫描任意 header 与 body 中的 Memory 用户 key 形态。Header 名和 JSON 属性名也纳入扫描，命中后只保存固定占位符。Observation 不保存 sentinel、请求内容、header 值、key hash、key 前缀或 key 长度；记录达到 100 条保留上限时 runner 必须拒绝，避免早期泄漏被截断后误绿；`x-tdai-agent-source`、`x-vertex-ai-session-id` 和其他内部身份 header 都列入模型上游禁止集。
6. Runner 的可提交结果说明写入 `docs/reproduction/`；原始脱敏 JSON 以同目录 `0600` 临时文件加 rename 写入忽略目录 `.runtime/runs/<run-id>/`。Compose 使用宿主目录挂载，证据归档完成前不得销毁该 run 的容器、volume 或目录。
7. `consumer-shared-bridge` 是硬 Gate，但在 public fork 的 ACL/envelope 修复经独立 commit、测试并更新根仓库 gitlink 前，状态只能是 `Expected Blocked / Not Run`，不得标为通过。

## Consequences

- A/B/C 的凭证、identity 和 Claude home 互不共享；runner 只能只读挂载 bootstrap state、runtime config 与 gateway token，并单独写证据目录。
- 本决策以单 bundle 原子发布取代早期“单独复制 user-key”的 fan-out 细节；旧决策记录保留为历史背景，不再代表当前客户端文件布局。
- Real Compose 的默认网络保持 internal；只有 Core、Hub、Proxy 加入 egress network。含 DeepSeek key 的 Proxy 私有配置卷只对一次性 renderer 与 Proxy 可见，bootstrap、runner、Claude 不可达。
- Hub 不阻塞 Proxy/Core 数据面 Gate；Panel/Knowledge 另行验证。
- 根 settings renderer 已分别生成 Docker Compose service URL 与 Windows loopback URL；public fork 消费 `TDAI_MEMORY_PROXY_BASE_URL` 的最终 commit 尚未更新根 gitlink，因此 Windows memory tool 仍是 Expected Blocked / Runtime Not Run。
- 该 Gate 当前只有静态测试证据；Docker engine/build/runtime 恢复后必须按两步命令先启动服务，再单独运行 runner。
