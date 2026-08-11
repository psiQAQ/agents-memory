# Task 5 deterministic Mock `e83748e2` exact cleanup Passed

## 状态

**Runtime Cleanup Passed**。

对应失败边界见 [e83748e2 generic launcher failure Blocked](2026-08-12-task5-mock-20260812-e83748e2-generic-launcher-failure-blocked.md)。按用户对用完 Docker 资源的清理要求，仅针对 exact project `refine-memory-task5-mock-20260812-e83748e2` 执行 cleanup。

| 阶段 | Containers | Networks | Volumes | Host evidence files |
| --- | ---: | ---: | ---: | ---: |
| Before | 5 | 1 | 14 | 2 |
| After | 0 | 0 | 0 | 2 |

cleanup 显式启用 `mock`、`management`、`claude`、`opencode`、`pi` profiles，并固定 base/mock/management/claude/opencode/pi 六个 Compose files；`down --volumes --remove-orphans` exit `0`。独立 after-query 确认 exact project containers/networks/volumes 为 `0/0/0`，global containers 为 `0`。

host evidence directory 与后续 fresh tuple 仍需使用的 active images 保留；未使用 `--rmi`、模糊 project 名或全局 prune。cleanup 不改变业务结论，完整 Mock Gate 仍为 **Blocked**。

## 后续静态修复

launcher 原本已在内部产生 `step=N`，但 CLI catch 将其降为 generic。commit `d7c7d57fa2cbe55a28dc1148be79004d5974c5de` 以 TDD 增加固定 allowlist：仅完整匹配 `step=1..17` 时输出该单行；越界、尾随文本、raw child text 或未知异常仍输出 generic。RED 为 focused `6/7`，GREEN 为 `7/7`；fresh root Node `233/233`、Compose config `7/7`、独立 review `C0/I0/M0`。这些是 static/contract 证据，不把已结束的 `e83748e2` 重新分类为业务通过。
