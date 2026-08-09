# 2026-08-10 Standalone Gate 被 forged source 契约差异阻塞

> **Forged source**：客户端伪造但格式合法的 agent source，用来验证“格式正确”不会绕过用户、身份与 session 绑定。

> **HTTP 400 / 401**：400 表示请求字段缺失或格式错误；401 表示请求格式可以解析，但当前凭证或绑定无权完成该操作。

> **Zero side effect**：被拒绝的请求不得触发任何模型调用；本实验以拒绝前后的 Mock 观察数相同来确认。

- 类型：Append-only reproduction report
- 日期：2026-08-10
- Run ID：`docker-mock-20260810-024419`
- Compose project：`mem-it-20260810-024419`
- 验证基线根仓库 HEAD：`deee5cea2ade01750ad991677c6d27693d80dc97`
- Public fork SHA：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 原始证据目录：`.runtime/runs/docker-mock-20260810-024419/`
- 结论：Gate 1 Passed；Gate 2 Failed；Hub、Claude 与 DeepSeek Not Run

## 环境与 lifecycle 修复复验

**Verified Fact：** Docker client/server `29.6.2`、Docker Desktop `4.85.0`、`desktop-linux` context、Compose `5.3.1` 与 base/tools/Claude Compose parse 均通过。运行前五个已构建镜像的 exact local image ID 与 `docker-mock-20260810-015646` 报告一致；本 run 没有 build 或 pull。

项目首次准备后，`config-init` 与 `bootstrap` 为 `exited|0`，Mock、Core 与 Proxy 为 `running|healthy`。README 的 fail-closed readiness loop 首次查询即通过。

Gate 1 使用：

```powershell
$env:TEST_SCENARIO = 'mock-contract'
& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  run --rm --no-deps test-runner
```

命令 exit 0，runner 返回固定 `status=ok`；已完成的 Bootstrap 保持 `exited|0`，没有重放。这是 `--no-deps` lifecycle 修复的首次真实运行证据。

## Gate 结果

| Gate | 结果 | 证据 |
| -- | -- | -- |
| `mock-contract` | Passed | `mock-contract.json`，11 项断言，HTTP/status 序列为 `200,200,200,200,200,200,200,400,429,500,0` |
| `standalone-memory` | Failed | 正向写入、Core L0/L1 查询均已到达；在 forged source 负向断言处停止，未发布 `standalone-memory.json` |

Gate 1 证据文件 SHA-256 为 `ba5f8127fe69bbaea4cc0010ab1ab1bd21a6db261d208a19ea195f17ad300455`。Mock 的三项布尔泄漏检查均为 false；提交证据扫描未发现 Memory 用户凭证形态、一次性 gateway 原值或 `DeepSeek`。这些是已选服务与保留证据范围内的结果，不是 packet capture。

## 失败定位

**Verified Fact：** 当时 runner 要求格式合法但未绑定的 `forged-client` 返回 HTTP 400。Public fork 的 Bridge 契约把“缺失或格式错误 source”定义为 400，把“格式合法但未绑定”定义为 401；focused unit contract 也要求 401。Proxy 日志显示 forged source 进入 session lookup，而不是语法拒绝。

**Inference：** 最强定位是 runner 中的 forged source 预期已过期：它要求 400，而真实 Bridge 正确地返回 401。原 runner 只输出通用失败消息，没有直接打印实际状态，因此该定位来自源码、focused contract 与运行日志的交叉证据。

## 最小修复

后续修复只调整 runner 与对应测试：

- 缺失或 malformed source 仍必须返回 400；
- 格式合法但未绑定的 forged source 必须精确返回 401；
- 两类拒绝都必须保持 zero model side effect；
- 不接受宽泛的任意 4xx。

TDD RED 为 focused suite 6 passed / 1 failed，失败点精确在旧 400 预期；GREEN 后 focused 7/7、完整根 Node suite 58/58 Passed。新 runner 的真实运行在后续 [`docker-mock-20260810-030443`](2026-08-10-docker-mock-20260810-030443-session-precondition-failed.md) 中越过该断言。

## 停止与边界

失败后未运行 agent config、Hub、Claude headless/TUI 或真实 DeepSeek。对精确 project 执行 `down --remove-orphans` exit 0，没有 `-v` 或 prune；容器与网络删除，`bootstrap-state`、`core-data`、`runtime-config` 三个 named volumes 保留并按敏感状态管理。

**Recommendation：** 不复用本 run。后续用新 project 验证修复，且不得把 Gate 1 通过写成 Standalone 业务通过。
