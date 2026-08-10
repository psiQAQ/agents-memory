# Task 3 review fix round 1：RED 与证据范围勘误

## 状态

**Failed / Reproduced（修复前不可变证据）**。本记录补正 [Task 3 原 Passed 记录](2026-08-11-task3-anthropic-platform-routes-passed.md) 的证明范围，不改写原文件。原记录仍准确证明三条 Messages literal route、主 handler 的 source/session fail-closed 与当时镜像资产；但其 OpenCode/Pi Anthropic session-init、`count_tokens` 与 privacy 结论过宽，须以后续 fix-round Passed 为准。

固定修复前产品为 `f97873393ba314db58bcc981ce06cf03233a7061`，固定镜像为 `local/refine-memory-proxy:f978733-task3@sha256:ea1487a338f1cb765ed81f71d81adb93db3b9ae0608ff874bb2d314e07d02667`。测试均使用当前测试源码只读覆盖 `/app/src`、`--network none` 与覆盖 entrypoint；未启动 Proxy 服务。

## Important 1：Anthropic session-init body RED

```powershell
docker run --rm --network none --entrypoint sh `
  -v "${PWD}/MemoryProxy/src:/app/src:ro" `
  local/refine-memory-proxy:f978733-task3 `
  -lc "npx vitest run src/__tests__/anthropic-platform-session-app.test.ts -t 'top-level system'"
```

- Exit：`1`。
- 结果：`2 failed / 1 skipped`。
- OpenCode non-stream 与 Pi stream 的最终 upstream `messages` 都是 `[system,user]`；期望只保留 user message，并把 session context 放入顶层 `system`。

## Important 2：count_tokens route/source RED

```powershell
docker run --rm --network none --entrypoint sh `
  -v "${PWD}/MemoryProxy/src:/app/src:ro" `
  local/refine-memory-proxy:f978733-task3 `
  -lc "npx vitest run src/__tests__/anthropic-count-tokens-routes.test.ts"
```

- Exit：`1`。
- 结果：`6/6 failed`。
- 三个合法平台均错误命中 global upstream；unknown、known-but-unbound 与 path/source conflict 没有在 auth/body/upstream/credit 副作用前 fail closed。

## Important 3：共享 recovery/capability privacy RED

```powershell
docker run --rm --network none --entrypoint sh `
  -v "${PWD}/MemoryProxy/src:/app/src:ro" `
  local/refine-memory-proxy:f978733-task3 `
  -lc "npx vitest run src/__tests__/anthropic-platform-session-app.test.ts -t 'redacts shared recovery'"
```

- Exit：`1`。
- 结果：`1 failed / 2 skipped`。
- 真实 `createApp()`、`sessionInit.enabled=true` 路径依次经过 `getOrRecover()`、header registration 与 initialized L1 recovery；console 输出含测试 sentinel，对应 raw composite session 与 capability user。

## 勘误后的证明边界

- 原 Task 3 privacy Passed 不能扩写为全面日志泄漏 Gate。
- fix round 1 只要求共享 SessionStore/recovery/capability 的选定 console 路径输出固定 presence/category。
- JSONL、ClickHouse、Opik、Langfuse、upstream headers 等结构化 sink，以及 Claude 专用历史状态机，明确留给 Task 5 comprehensive leak Gate，当前为 **Not Run**。
- Minor：deprecated `/claude-code/v1/messages` 当前固定 404。本轮按负责人要求 deferred，不扩大兼容范围；后续必须在“恢复兼容”与“删除误导入口并写迁移说明”之间明确选择并补 app-level 回归。

## 授权边界

未读取 `.env`、settings、secret、home、`.runtime/` 或原始 evidence；未启动业务栈、真实 API 或客户端；未 push、PR、修改 remote 或执行 destructive cleanup。
