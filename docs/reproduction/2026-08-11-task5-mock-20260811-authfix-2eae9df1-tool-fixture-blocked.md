# Task 5 deterministic Mock `authfix-2eae9df1` tool fixture Blocked

## 状态

**Blocked / Mock fixture fix pending**。

本记录是 append-only runtime evidence，不覆盖先前的 `preflight-7c1a9e2b` 或 `fixed-8d4802d5` Blocked 记录，也不将 replacement Proxy image 的 build/test Ready 扩写为完整业务 Gate 通过。本次固定 17 步 launcher 在 step 6 `protocol-leak` fail closed；没有继续 management、headless、final、TUI 或真实模型。

## 固定范围与启动前检查

| 项目 | 值 |
| --- | --- |
| Root HEAD | `b3182b2717fb5693d375bf6080d45d467e5cbcfd` |
| `RUN_ID` | `task5-mock-20260811-authfix-2eae9df1` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-mock-20260811-authfix-2eae9df1` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-mock-20260811-authfix-2eae9df1` |
| Launcher | tracked `node tests/integration/tools/run-task5-mock.mjs`，固定 17 步 |

- exact Compose label preflight：container/network/volume 均为 `0`；这是 freshness 条件，不是业务 Passed。
- 固定 image preflight：`7/7`；这是输入可用性检查，不是服务或业务 Passed。

本记录只保存脱敏断言与观测值，不包含 raw logs、请求/响应正文、用户 key、gateway 值或其他 secret；未读取 Tencent `.env`、settings、home 或既有 runtime evidence。

## 精确结果

- launcher reached step 6 `protocol-leak`，以 `assertion=leak-claude-tool`、`passed=2` fail closed。
- 失败后四个长期服务为 healthy，`config-init` exited 0；这些仅是失败后 Compose 状态，不证明任何业务步骤 Passed。
- evidence 目录仅有脱敏 `stage1-mock.json`；未将该单一 evidence 文件扩大为完整 Mock Gate 证明。
- 脱敏 observation：`total=2`、Anthropic `target=1`、`unsafe=false`、`forbidden=0`、`fixture_tool=false`。

这两个已通过的 protocol/leak cases 间接证明 replacement auth 修复在该 run 的最初两个调用中可用；它**不**证明完整 auth Gate、全部协议路径或 24 cases 通过。24-case protocol/leak Gate 整体为 **Failed**。management/outsider、三个真实 headless、final oracle、TUI 与真实/Paid 模型均为 **Not Run**；三写六读也尚未执行。

## 静态根因定位

**Fact（静态代码定位，非修复证明）**：Mock 的 `selectedFixture` 仅处理 string `content`。Proxy 规范化后，Anthropic text marker 为 array text block，Mock 未识别该 marker，返回 text；但本 Gate 期待 tool，故 `fixture_tool=false` 并在 `leak-claude-tool` fail closed。下一步应以 TDD 修复该 Mock fixture 识别边界；该修复、review、replacement image 与 runtime 重跑均尚未发生。

## 清理边界与下一 Gate

本 run 的 exact project `refine-memory-task5-mock-20260811-authfix-2eae9df1` 及对应 evidence 路径在本记录提交后按用户授权进行独立、精确 cleanup；本次文档提交不执行 Docker、`down`、`down -v`、prune 或 cleanup。该授权不扩大到任何旧 Blocked project、诊断 project、network、volume、image 或其他 evidence 路径。

下一 Gate 是先修复 Mock fixture 的 array text-block marker 识别、完成相应测试/review，再使用新的唯一 run/project/evidence tuple 重跑 deterministic Mock；在完整 headless Gate 通过前不得进入 TUI 或真实/Paid 模型。
