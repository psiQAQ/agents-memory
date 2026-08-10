# 2026-08-10 Docker Claude TUI 文本往返通过

> **Roundtrip / 往返**：客户端发送请求，服务端处理并返回结果，客户端最终显示响应的完整来回路径。

> **TUI**：在终端中显示并接收键盘操作的交互界面；Claude Code 的主要界面属于 TUI。

> **Mock**：返回固定结果的模拟模型服务；默认不会调用或收费于真实模型。

> **Runtime Passed**：列明的真实容器与请求已经运行通过；结论只适用于本报告明确列出的 Mock 文本场景。

> **Run ID / Commit / Public fork**：Run ID 是一次实验的唯一编号；Commit 是 Git 保存的代码快照；Public fork 是用户公开维护、用于向腾讯上游提交通用修复的仓库副本。

> **MemoryProxy / MemoryCore**：MemoryProxy 接收 Claude Code 请求并转发给模型与记忆服务；MemoryCore 保存和查询原始对话与提炼后的记忆。

> **Anthropic / OpenAI 请求**：本实验中 Claude Code 到 MemoryProxy 使用 Anthropic 消息格式，MemoryCore 的提炼调用使用 OpenAI-compatible 格式；两者都只到本地 Mock。

> **L0 / 服务端 oracle**：L0 是 MemoryCore 保存的原始对话层；服务端 oracle 是直接查询该层验证请求已写入，而不是只根据界面输出推测。

> **Owner / session**：Owner 是消息所属的 team、user、agent 和 task 组合；session 是一次连续对话的标识。两者共同防止读取到其他客户端的数据。

> **Header**：HTTP 请求携带的元数据；身份、session 和内部服务字段不应转发给模型上游。

> **HTTP 200 / 业务 `code=0`**：HTTP 200 表示网络请求成功到达并收到响应；业务 `code=0` 表示 MemoryCore 在响应内容中也判定该操作成功，两者需要同时满足。

> **Upstream hygiene / 上游卫生检查**：只检查本报告列明的敏感诱饵、模型凭证、Memory 用户 key 形态和禁止内部 header 是否进入模型上游；结果为 0 不等于对请求整体安全性的认证。

> **Memory 用户 key / gateway 值 / DeepSeek key**：前两者分别用于客户端访问记忆服务和内部服务认证；DeepSeek key 用于真实模型计费调用。本报告的证据不得包含它们。

> **Streaming / tool use / thinking**：Streaming 是模型逐段返回内容；tool use 是模型请求客户端执行工具；thinking 是模型返回的推理内容块。文本往返通过不代表这些能力已验证。

> **Runtime Not Run**：尚未实际执行或取得证据，不能按通过处理。

> **SHA-256**：用于检查证据文件是否被改动的内容摘要；这里计算的是脱敏证据文件，不是 key 或凭证的指纹。

> **Ordinary / non-symlink / no-follow / 单链接 / `0600` / rename**：这些文件约束依次表示普通文件、不是目录链接、写入时不跟随链接、只有一个文件入口、仅文件所有者可读写，以及用一次改名原子发布完整结果。

> **Fail-closed**：检查不满足时停止且不发布结果，不尝试降低安全条件继续运行。

> **忽略目录**：Git 配置为不提交的本地目录，用于保存脱敏后的原始运行证据，避免把动态日志混入源码历史。

- 日期：2026-08-10
- 父 Run ID：`docker-mock-20260810-033636`
- Docker 项目标识：`mem-it-20260810-033636`
- 根仓库起始提交：`e64e3e2cad8fa36bebf2a93335b82ccccdad75b9`
- Public fork 提交：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 父运行记录：[无付费运行通过](2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)
- 界面确认记录：[TUI 用户确认](2026-08-10-docker-mock-20260810-033636-tui-user-confirmed.md)
- 结论：Docker Claude TUI 文本往返在默认 Mock 范围 **Runtime Passed**；streaming、tool use、thinking 与真实 DeepSeek 仍为 **Not Run**

## 用户侧结果

用户在已确认可启动的 Docker Claude TUI 中输入不调用工具的连通性提示，并确认界面返回固定文本 `mock text`。这是人工观察；服务端证据由下面两项独立补强。

## Mock 上游观察

`standalone-memory.json` 的最终上游安全断言记录基线观察数为 6。用户交互后，Mock 观察数为 11，新增 5 项：

- Anthropic `/messages`：新增 2 项；
- OpenAI `/chat/completions`：新增 3 项；
- 新增观察中的敏感诱饵、异常模型凭证、Memory 用户 key 形态和禁止内部 header：均为 0。

这 5 项包括 Claude 交互请求，以及同一观察区间内对 OpenAI-compatible Mock 端点的调用；没有时间戳或调用方身份字段把每一项子请求单独归因给某个界面动作或服务，因此只将整体往返记为通过。

## MemoryCore L0 oracle

只读查询 agent-a 的同一 team、user、agent、task 与 session，返回 HTTP 200、业务 `code=0`、共 6 条消息：

- 连通性提示命中 1 条；
- 命中记录的 owner 字段不匹配数为 0；
- `mock text` 聚合命中 3 条，但其中包含该 session 的既有 Mock 响应，因此不把该数字当成一一对应证明。

用户看到的 `mock text`、新增 Anthropic 观察和 L0 提示命中共同证明本次 `Docker Claude → MemoryProxy → Mock → Docker Claude` 文本往返。OpenAI-compatible Mock 端点新增 3 次调用，与 MemoryCore 后台提炼相符；但当前聚合证据没有调用方身份，不能独立把这些请求归因给 MemoryCore。

## 脱敏证据

原始结构化结果保存在忽略目录 `.runtime/runs/docker-mock-20260810-033636/tui-message-probe.json`：

- 文件为 ordinary、non-symlink，容器写入时验证单链接；
- 同目录临时文件、`0600`、拒绝覆盖、单次 rename 后发布；
- 大小 499 bytes；
- SHA-256：`885cc6f4bcef2f05bbbfdd691dfbeed0d46d6863998c1b58bd20419b9f806d6c`；
- 字段结构、计数和 owner 断言复核通过；
- 不含提示原文、`mock text`、Memory 用户 key、authorization、gateway 值或凭证派生值；残留临时文件为 0。

首次发布尝试复用了只允许两个既有文件名的 runner 写入器，因此在创建目标前 fail-closed；业务查询本身随后再次通过。最终证据使用同样的 no-follow、单链接、`0600`、拒绝覆盖和原子 rename 规则专门发布，没有修改受 Git 管理的测试程序或覆盖旧证据。

## 边界与下一步

本报告只证明默认 Mock 下的文本往返和 L0 写入。它不证明真实 DeepSeek、streaming、tool use、thinking、长会话、Windows Claude、故障恢复或企业生产可用。

下一步切换到 Windows 10 原生 Claude，使用工作区外的项目专用配置目录连接同一 MemoryProxy；不得覆盖用户全局 `.claude`，不得加载 DeepSeek secret。
