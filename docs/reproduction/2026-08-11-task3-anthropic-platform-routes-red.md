# Task 3 Anthropic platform routes RED

## 结论

**Failed / Reproduced**。在产品基线 `c400a6f04bf0850583de99194bbe9e506da1cfe6` 上，MemoryProxy 不能诚实处理 OpenCode/Pi 的原生 Anthropic Messages route，unknown/unbound source 与缺失或非法 session 也未在 auth、Core 或 upstream 副作用前 fail closed。本记录保留修复前 RED；后续 Passed 见独立记录。

## 固定边界

- 目标 route：`/claude-code/<space>/v1/messages`、`/opencode/<space>/v1/messages`、`/pi/<space>/v1/messages`。
- session 合同：`[A-Za-z0-9._:-]{1,256}`，并拒绝任何包含 `..` 的值。
- route-bound source；不增加可伪造 source header，不把 OpenCode/Pi 映射成 Claude Code。
- 拒绝必须发生在 auth、body parse、session store、Core 与 upstream 之前。
- 使用 Task 2 固定 Proxy 镜像的 `/app/node_modules`，只读挂载当前 `src`，并设置 `--network none`；未启动服务或真实 API。

## 主 RED

```powershell
docker run --rm --network none --entrypoint node `
  -v "<product>/MemoryProxy/src:/app/src:ro" `
  local/refine-memory-proxy:49c4536-fix1 `
  ./node_modules/vitest/vitest.mjs run `
  src/__tests__/anthropic-platform-routes.test.ts `
  src/__tests__/anthropic-platform-session-source.test.ts
```

结果：2 files failed；18 tests 中 16 failed、2 passed。

| RED | 已观察结果 |
| --- | --- |
| OpenCode/Pi 原生 route | 返回 401，未形成平台 route；Claude Code 正例通过 |
| unknown/unbound source | 返回 200，auth/upstream 已发生 |
| path/source conflict | 未在 route 边界以 400 拒绝 |
| missing/blank/space/slash/`..`/control/超长 session | 多项继续转发或未按合同提前拒绝 |
| OpenCode/Pi Core participation source | 被记录为 `context_proxy:codebuddy` |
| 已知 OpenAI CodeBuddy route | 回归正例通过 |

## privacy follow-up RED

主 route GREEN 后，真实测试输出暴露成功 handler 与 session-init 仍记录 raw session/identity。新增 privacy 断言后：

- accepted handler privacy 专测：1 failed，命中 `identity` 与 `injection-debug` raw session。
- OpenCode/Pi session-init privacy：2/2 failed，命中 CodeBuddy 复用状态机的 raw composite session。
- 已知 OpenAI CodeBuddy 回归 privacy：1 failed，命中 raw session/user。

这些失败均先保留为 RED，再做最小日志脱敏；拒绝路径没有产生 auth/Core/upstream 调用。

## 边界

未读取 `.env`、settings、secret、home、`.runtime/` 或历史原始 evidence；未启动业务栈、监听端口、Mock、真实 API 或 TUI；未 push、PR、修改 remote 或执行清理。
