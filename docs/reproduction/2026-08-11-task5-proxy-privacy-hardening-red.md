# Task 5 Proxy privacy hardening RED

**Status：Failed / Reproduced（修复前不可变证据）**。

本记录固定 Task 5 业务运行前对 Tencent MemoryProxy 的产品级隐私前置审计。起点是 `codex/four-agent-memory-upstream@0bba4d798ce452d97dbce3c6fa1b7a3eccd881a2`；发现真实产品缺陷后，根仓库的 Docker 业务栈保持暂停，没有启动服务、CLI、三写六读、管理 API 或 TUI。

## RED 范围

各批次会重复覆盖同一路径，失败数不能相加为一个总数：

| 边界 | RED test file | 独立 RED 证据 | 后续闭环 commit |
| --- | --- | --- | --- |
| Anthropic main / `count_tokens` / retry 的 caller header、Memory credential、origin 与 redirect | `anthropic-count-tokens-routes.test.ts`、`anthropic-platform-routes.test.ts`、`anthropic-retry-header-privacy.test.ts`、`upstream-redirect-privacy.test.ts` | 初始 header 批次 7 failed | `42b7775`、`b445367`、`dba1644`、`8dec350`、`2c9dafd`、`ee73f47` |
| JSONL、ClickHouse、Opik、Langfuse 等 telemetry 的 usage/error/key/tag/order/concurrency | `privacy-sinks.test.ts` | 初始 6 failed；后续 7 failed；ClickHouse/trace 批次先 3 failed，随后扩到 4 类 sink | `ba42da6`、`a2b8c4a`、`a19f5fc`、`4c84631`、`476c66f`、`e799e4a` |
| active handler、identity、memory bridge 与诊断输入 | `active-diagnostics-privacy.test.ts`、`active-handler-diagnostics-privacy.test.ts` | 初始 4 failed；扩展后的 12-case 批次仍有 4 failed | `fdd4a9d`、`b18c30f`、`e60cf36`、`fbbe9de`、`2c4a5ba` |
| OpenAI 共享 upstream header、credential 与 protocol 隔离 | `openai-header-privacy.test.ts` | 14/14 RED | `dbcc149`、`2f52681` |
| injection observer/pipeline/prewarm 的 active diagnostics | `injection-active-diagnostics-privacy.test.ts`、`injection-prewarm-wrapper-privacy.test.ts` | 2 files / 5 RED | `d76b9ca` |
| auxiliary handler diagnostics | `auxiliary-diagnostics-privacy.test.ts` | 3/3 RED | `097dbda` |
| injection index/bootstrap diagnostics | `injection-active-diagnostics-privacy.test.ts`、`injection-bootstrap-diagnostics-privacy.test.ts` | 9 tests 中 6 RED | `6370e31` |
| server-only upstream credential 与 system-user 类型契约 | `README.md`、`README_CN.md`、`config.example.yaml`、`types.ts` | 配置/类型审查发现旧说明不足以锁定 fail-closed 边界 | `c0febed`、`d6afcd8` |

这些 RED 证明旧 `0bba4d7` 只能继续支持 Task 3 已限定的 route/console 结论，不能作为 Task 5 comprehensive product privacy Gate。具体修复和新镜像证据见 [Task 5 Proxy privacy/build Passed](2026-08-11-task5-proxy-privacy-build-passed.md)。

## 安全与运行边界

- 没有读取 Tencent ignored `.env`、本地 settings、secret、home、`.runtime/` 或原始运行日志。
- 没有记录 caller auth、Memory user key、gateway token、identity value、marker、prompt、body 或 key fingerprint。
- 未执行真实模型调用、push、PR、remote 修改或破坏性清理。
- 因产品缺陷触发 fail-stop；根侧只继续编写不启动产品服务的 deterministic contract tests。
