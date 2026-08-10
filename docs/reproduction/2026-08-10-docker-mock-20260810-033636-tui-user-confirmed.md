# 2026-08-10 Docker Claude TUI 用户确认

> **TUI**：在终端中显示并接收键盘操作的交互界面；Claude Code 的主要界面属于 TUI。

> **User Confirmed**：由用户直接观察后确认的界面结果。它是有效的人工验收证据，但不等同于自动化运行日志，也不能证明未实际操作的功能。

> **Append-only report**：创建后不回写覆盖的运行记录；后续结果使用新报告补充，保留当时的证据边界。

> **Run ID**：一次实验的唯一编号，用来区分不同时间启动的环境和证据。

> **Commit / Public fork**：Commit 是 Git 保存的代码快照；Public fork 是用户公开维护、用于向上游提交通用修复的腾讯仓库副本。

> **Mock**：返回固定结果的模拟模型服务；默认不会调用或收费于真实模型。

> **Streaming / tool use / thinking**：Streaming 是模型逐段返回内容；tool use 是模型请求客户端执行工具；thinking 是模型返回的推理内容块。界面能打开不代表这些能力已经可用。

> **Named volume**：Docker 管理并在普通停止后继续保留的数据卷，可能含凭证或业务数据。

> **MemoryProxy / MemoryCore**：MemoryProxy 接收 Claude Code 请求并转发给模型与记忆服务；MemoryCore 保存和查询对话与提炼后的记忆。

> **Memory 用户 key / 环境变量 / 凭证派生值**：Memory 用户 key 是客户端访问记忆服务的凭证；环境变量是进程启动时读取的配置；凭证派生值是由 key 计算出的哈希或指纹，仍可能用于关联敏感身份。

> **running|healthy / exited|0**：前者表示容器正在运行且健康检查通过；后者表示一次性容器已经正常完成并以成功状态退出。

- 日期：2026-08-10
- 父 Run ID：`docker-mock-20260810-033636`
- 父运行记录：[无付费运行通过](2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)
- Docker 项目标识：`mem-it-20260810-033636`
- 根仓库提交：`dffc01515cfaf8f1d9cb790a9ddc4a47e4e70da9`
- Public fork 提交：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 结论：Docker Claude Code TUI 启动界面 **User Confirmed**；消息请求、streaming、tool use 与真实 DeepSeek 仍为 **Not Run**

## 用户观察

用户按父报告中的精确 `run --rm --no-deps claude-agent-a --interactive` 交接命令启动 Docker Claude Code 后，回复“界面正确”。因此，本报告只把“交互界面可以正确打开并供用户操作”记为人工验收通过。

没有收集截图、终端全文、Memory 用户 key、环境变量值或凭证的稳定派生值。该观察不能证明提示词已经送达 MemoryProxy，也不能证明 Mock 响应、记忆写入、streaming、tool use、thinking 或真实 DeepSeek 协议兼容。

## 同步运行状态

用户确认后执行只读 Docker 状态检查：`mock-llm`、`memory-core`、`memory-proxy`、`memory-hub` 仍为 `running|healthy`；`config-init`、`bootstrap`、`agent-config-a` 仍为 `exited|0`。检查时没有遗留的 Docker Claude 临时容器。这项机器证据只说明保留项目仍健康且临时容器已退出，不证明 TUI 内容。

没有执行 `down`、`down -v` 或 prune。项目和六个 named volumes 继续保留，供下一项无付费交互请求验证使用。

## 下一验证边界

下一步是在同一 TUI 中发送不调用工具的最小文本探针。默认 Mock 的预期文本响应是 `mock text`；随后再用 Proxy/Mock 观察和 MemoryCore 记录区分“界面启动”与“请求确实经过记忆数据面”。在获得该证据前，消息交互保持 **Not Run**。

Windows Claude、真实 DeepSeek、streaming、tool use、thinking、长会话、故障恢复、Win11、WSL Claude 与 LAN 均不在本报告的已验证范围。
