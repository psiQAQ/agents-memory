# Task 3 review fix round 1：Passed

## 状态

**Runtime Passed（handler/route tests + source-build/runtime assets only）**。三个独立 Important RED 已通过最小产品修复关闭：OpenCode/Pi 的 Anthropic session context 只进入顶层 `system`；三平台 `count_tokens` 使用 literal route-bound source 与各自 upstream；共享 SessionStore/recovery/capability 的选定 console 路径不再输出 raw session/user/agent/task/key。

服务健康、deterministic Mock identity/share/isolation/leak、真实 Claude Code/OpenCode/Pi CLI、真实 API、TUI 与跨客户端共享记忆业务流仍为 **Not Run**。

## 固定提交与镜像

- Product：`0bba4d798ce452d97dbce3c6fa1b7a3eccd881a2`（`fix(proxy): close Anthropic route review gaps`）。
- Official public context：`.task2-build-contexts/proxy-0bba4d7-task3-fix1`；源码与 context 两阶段 secret-scan Passed。
- Proxy：`local/refine-memory-proxy:0bba4d7-task3-fix1@sha256:88a350e44c0e04bec0632034a4dfb437904dc4da6471fa9957ebb9dbaa86f66c`。
- 本轮只执行一次 build，exit `0`，耗时 `398.2 s`；目标 tag 构建前不存在。

## GREEN

### Handler/route tests

- focused：4 files / 29 tests Passed。
- 完整 Proxy Vitest：5 files / 31 tests Passed。
- 新镜像内完整 Proxy Vitest：5 files / 31 tests Passed。
- 新镜像内 privacy focused：1 passed / 2 skipped。

测试直接断言：

- OpenCode non-stream 与 Pi stream 最终 upstream `messages` 不含 `role=system`，顶层 `system` 保留原 system 并追加 `<session_context>`；OpenAI CodeBuddy initialized 行为仍在 messages 中注入 system。
- Claude Code、OpenCode、Pi `count_tokens` 分别命中各自 URL/key；unknown、unbound、conflict 在 auth、body、upstream、credit 计数均为 0 时返回 404/400。
- privacy sentinel 实际经过 `getOrRecover()`、header registration、initialized recovery 与 capability resolution；固定 category/presence 日志存在，合并 console 输出不含 sentinel。

### TypeScript 与文件边界

- 修复前后 `npx tsc --noEmit --pretty false` 均为同一 6 项既有错误：`memCommand` 3、Claude/CodeBuddy `isDefault` 2、public cost-guard declaration 1；本轮新增错误为 0。
- 12 个 changed TS 均为 `i/lf w/lf`、无 BOM；`git diff --check` 与 staged secret-shape scan Passed。

### 新镜像 runtime assets

全部使用 `docker run --rm --network none` 并覆盖默认 entrypoint：

- image `Config.User=app`；runtime UID `10001`。
- 6 个 `/app/**/*.sh` 无 CR 且 `bash -n` Passed。
- `/app/src/index.ts`、tsx 与 `/usr/bin/tini` 存在。
- `better-sqlite3` 使用 SQLite `3.49.2`；`node-pty` import + spawn Passed。
- official public cost-guard stub：`isCostGuardAvailable() === false`，fallback Passed。

## 保留边界

- 原 Task 3 RED/Passed 均保持不可变；本轮通过 [erratum](2026-08-11-task3-review-fix-round1-erratum.md) 与本 Passed 记录追加修正。
- 仅共享 SessionStore/recovery/capability 的选定 console 路径完成 sentinel Gate。JSONL、ClickHouse、Opik、Langfuse、upstream headers 与 Claude 专用历史状态机留到 Task 5，当前 **Not Run**。
- deprecated `/claude-code/v1/messages` 固定 404 的 Minor 已登记 deferred，本轮未修。
- 未启动业务栈、监听端口、Mock、真实 API 或 TUI；未读取 secret/runtime 原文；未 push/PR/remote/destructive cleanup。
