# 2026-08-10 Standalone Gate 被客户端 session 前置条件阻塞

> **Session binding**：服务端把经过认证的用户、agent source 与 session 绑定成一个不可混用的身份组合；未初始化或冲突的组合必须拒绝。

> **Fail-closed**：身份或状态不完整时默认拒绝，而不是猜测或补全后继续。

> **Race / asynchronous extraction**：成功请求可能在后台继续提炼记忆；若它恰好落入后续负向断言的观察窗口，会造成“被拒请求触发了模型调用”的假阳性。

> **L0 / L1**：L0 是 Core 的原始对话层，L1 是从对话提炼出的原子记忆层。

- 类型：Append-only reproduction report
- 日期：2026-08-10
- Run ID：`docker-mock-20260810-030443`
- Compose project：`mem-it-20260810-030443`
- 验证基线根仓库 HEAD：`deee5cea2ade01750ad991677c6d27693d80dc97`
- Public fork SHA：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 原始证据目录：`.runtime/runs/docker-mock-20260810-030443/`
- 结论：Gate 1 Passed；Gate 2 已越过 forged source、随后在 B session 未初始化处 Failed；Hub、Claude 与 DeepSeek Not Run

## 构建与准备

Forged source runner 修复后只重建 tools/test-runner image，未使用 `--pull`：

- 旧 local image ID：`sha256:3ddcbf11de00bce248f3051e81aceee44714aab18013668289e7979ad5eca152`
- 新 local image ID：`sha256:677c74dfae61304f6a329f9f607c3d81e558efce243e9ff8060c22cd564f60a2`

Core、Hub、Proxy 与 Claude 四个镜像仍匹配上一 run 的 exact local image ID。Docker/Compose 预检和 base/tools/Claude parse Passed；缺少必须的一次性非模型环境值时，一次 config-only 调用先 fail-closed，且没有创建 Docker 资源。

显式 stack 准备 exit 0，readiness 首次查询即确认两个 one-shot 为 `exited|0`、Mock/Core/Proxy 为 `running|healthy`。

## Gate 结果

| Gate | 结果 | 证据 |
| -- | -- | -- |
| `mock-contract` | Passed | `mock-contract.json` 原子发布，11 项断言，状态序列 `200,200,200,200,200,200,200,400,429,500,0` |
| `standalone-memory` | Failed | A 写入与 Core L0/L1 oracle 已完成；forged 401 已通过；随后 B 的合法 Bridge 读取因 session 未初始化而停止，没有发布 standalone 证据 |

Gate 1 runner 容器 exit 0，并由 Docker event 记录。调用它的 Windows PowerShell 5.1 wrapper 把 Compose 写到 stderr 的正常容器创建进度转成 `NativeCommandError`，导致 wrapper 提前停止；这是 wrapper 解释错误，不是 runner 失败。修正 wrapper 后没有重跑 Gate 1，从而避免覆盖已发布证据。

Gate 1 文件 SHA-256 为 `a3279594d4a79acfb88e6a280bb0d769287da3247eca8f01513c030f5fd2d431`。证据 schema、ordinary file/no-symlink 与 denylist 检查通过；未保存 credential、gateway 原值、业务 marker 原值或请求正文。

## 安全定位

**Verified Fact：** 新 runner 已越过 forged source 断言。下一条相关请求是 B 的合法 `x-tdai-agent-source=claude-code` Bridge 读取。Proxy 对该 B session 报告 cache miss 且没有 binding；Core 没有收到后续 atomic query。

**Inference：** B 的新 session 从未先经过认证的 Proxy main path，Bridge 因而按 fail-closed 身份契约返回拒绝。这不是应由 Bridge 放宽的行为；runner 必须先建立 B 的合法 session，C 的隔离查询也需要同样前置条件。

为避免失败信息泄漏，后续 diagnostic 只输出正则 allowlist 中的固定 assertion name，不转发捕获到的原始 error、路径、身份或凭证。TDD 先以 `consumer-shared-bridge` 的固定错误名 RED，再由安全诊断 GREEN。

## Session 修复与 race 复审

最小修复为：

- B 在共享读取前先发送一条完整身份、无业务 marker 的认证主路径请求；
- C 在隔离读取前执行同类初始化；
- 两次初始化必须各自 HTTP 200、恰好增加一条安全的 Anthropic Mock 观察；
- 未授权与身份冲突请求不得建立 session；
- B/C 仍分别验证共享可读与未绑定不可读，Bridge 不接受未初始化 session。

第一次 GREEN 后，独立复审指出 B 初始化可能触发异步 Core extraction，污染随后负向请求的 zero-side-effect 观察窗口。新增确定性 delayed-observation fixture 后 RED 精确出现在该污染窗口；最终只重排现有步骤：先完成 A 的 L1 oracle，再运行身份冲突、缺失 source、forged source 三项负测，然后初始化 B/C 并执行共享/隔离正测。没有放宽任何 ACL、Bridge 或等待语义。

修复后 focused 7/7、完整根 Node suite 58/58 Passed。真实 Docker 验证见[最终无付费通过 run](2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)。

## 停止与边界

失败后未运行 agent config、Hub、Claude headless/TUI 或真实 DeepSeek。对精确 project 执行 `down --remove-orphans` exit 0，没有 `-v` 或 prune；容器与网络删除，三个数据卷保留并按敏感项目状态管理。

**Recommendation：** 本 run 保持 **Gate 2 Failed**。必须用新 run ID 证明真实 Proxy 接受 B/C 的良性初始化，并同时保留负向 zero-side-effect 与 A/B/C 隔离结论。
