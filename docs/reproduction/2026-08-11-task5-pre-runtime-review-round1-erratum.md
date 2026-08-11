# Task 5 pre-runtime review round 1：合同范围勘误与 RED

## 状态

**Failed / Reproduced（修正前不可变证据）**。本记录补正 [Task 5 Proxy privacy/build Passed](2026-08-11-task5-proxy-privacy-build-passed.md) 中“root harness 104/104”的证明范围，不改写原记录。原记录仍准确证明 `d6afcd8` 的既定 privacy test/build-assets 范围；但 104/104 没有充分固定 deterministic Mock runtime 的 epoch、响应形状、Core L0、outsider、build/run 与 evidence 边界，因此不能据此启动业务栈。

本轮只执行根仓库 Node/Compose 静态合同和产品源码审计；未 build 镜像、启动服务、运行真实 CLI、读取 secret/runtime 原文或执行付费调用。

## 七项 Important RED

| 项目 | 修正前缺口 | RED 证据边界 |
| --- | --- | --- |
| Mock aggregate | reset epoch、全局顺序、per-path 计数/marker 与 sticky/dropped 状态不完整 | epoch 断言 2 项失败；错误 path、额外 operation、乱序与 dropped/sticky 曾可误绿 |
| Anthropic fixture | 仅检查局部 JSON/SSE 字段，未锁定完整事件顺序与 response sensitive scan | strict response focused batch 8 项失败 |
| outsider | forged 请求未使用完整 victim tuple；各负测未逐项以同 epoch all-model delta 0 包围 | forged export、模型 delta 与成功路径断言分别取得 RED |
| Core oracle | 三写六读没有逐 operation 核对 reader 的 user/team/agent/task/session/role | final success 缺少六条 read L0 调用时失败 |
| build boundary | tools base 未固定 digest，runtime Compose 仍含隐式 `build:` | digest、runtime build service 与 build-overlay 三组 focused RED |
| run boundary | `RUN_ID`、`COMPOSE_PROJECT_NAME`、`EVIDENCE_DIR` 各有固定默认值，可能跨 run 混用 | clean env/default 与 mismatched manifest run ID 取得 RED |
| headless evidence | child output 可继承到宿主，且 evidence 不是逐 client/action 的独立原子 0600 文件 | safe inherit、sensitive/overflow output、client/final evidence 负测取得 RED |

这些批次覆盖范围不同且有重叠，不汇总为一个虚构的总失败数。

## 产品阻塞风险

pre-runtime review 进一步发现 `d6afcd8` 的 terminal L1 session cache key 未纳入完整 user/space identity：使用 outsider key 但复用 victim source/session 时，存在复用 victim terminal state 的风险。根合同因此固定为 outsider key + 完整 victim source/team/agent/task/session，响应只能是 403/409，且同 epoch all-model delta 必须为 0。

该风险已通过产品 focused test/source audit 复现，但修复提交、完整产品验证与替代镜像尚未形成；committed gitlink 仍是 `d6afcd8`，既有 `sha256:d79751b6...` 镜像不得用于 Task 5 business runtime。产品修复完成后必须另增 append-only Passed 记录，不能在本文件中回填成功。

## 后续边界

根侧合同修正结果见 [round 1 root static Passed](2026-08-11-task5-pre-runtime-review-round1-root-static-passed.md)。它仍不关闭产品阻塞，也不代表独立 scoped re-review 已通过。tools/三客户端镜像重建、服务启动、headless、三写六读、outsider/management live oracle、TUI 和真实模型均为 **Not Run**。
