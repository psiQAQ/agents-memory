# Task 5 deterministic Mock `fixed-8d4802d5` protocol/leak Blocked

## 状态

**Blocked / business Gate 未通过**。

本记录为 append-only runtime evidence，不改写此前 `preflight-7c1a9e2b` 的 Blocked 记录，也不把前置 product/root/image 的限定 Passed 扩写为业务通过。本次固定 launcher 在第 6 步 `protocol-leak` fail closed；没有进入 management、写入、读取、final oracle、真实 headless、TUI 或真实模型。

## 固定范围与边界

| 项目 | 值 |
| --- | --- |
| Root HEAD | `6d5ef07bbc9a08a98e7c52db11da5d8c0f5d2164` |
| Product gitlink | `2de58c2f656978cfe310e3ac3ade085d8096f83b` |
| `RUN_ID` | `task5-mock-20260811-fixed-8d4802d5` |
| failed `COMPOSE_PROJECT_NAME` | `refine-memory-task5-mock-20260811-fixed-8d4802d5` |
| Launcher | tracked `node tests/integration/tools/run-task5-mock.mjs`，固定 17 步 |

本记录只保留脱敏的断言、HTTP 分类和静态代码边界；不含 raw logs、请求/响应正文、用户 key、gateway 值或其他 secret。未读取 Tencent `.env`、模型/用户 secret、settings、home 或旧 runtime evidence。

## 精确结果

- launcher **reached step 6**；steps 1–5 均 returned 0。这只用于定位第 6 步，不代表其中任何业务 Gate、服务状态或前置条件为 Passed。
- step 6 的 `protocol-leak` gate 以 `assertion=leak-claude-text`、`passed=0` 失败。
- Proxy 返回 HTTP 401：`authentication_error` / `auth-http-401`。
- Core verify 返回 HTTP 401，脱敏诊断为 `code0=false`、`valid=false`、`user_present=false`。
- Mock target 计数为 `0`，`unsafe=false`；未观察到模型副作用或泄漏命中。

因此 24 cases、management/outsider、三写六读、final oracle 和三个真实 headless 都是 **Not Verified**，不是 Failed 或 Passed 的业务结果。TUI 与真实/Paid 模型仍为 **Not Run**。

## 静态根因定位

**Fact（静态代码定位，非修复证明）**：root 的 `proxy.mock` template 提供 `auth.serviceToken`，但当前产品 `AuthConfig`、`buildConfig` 与 `auth.ts` 没有保留并在 Core verify 请求中发送相应的 `Authorization: Bearer`。这与本次 HTTP 401 诊断一致，但 replacement image 的修复、产品测试和 runtime 复验尚未发生。

## 保留与清理边界

以下项目均为本次新建、唯一、fail-stop 的范围；诊断只使用脱敏分类，不读取 raw logs：

| 用途 | exact project |
| --- | --- |
| failed launcher run | `refine-memory-task5-mock-20260811-fixed-8d4802d5` |
| 定位 step 6 | `refine-memory-task5-mock-20260811-diag-formal-647b8a3a` |
| strict evidence `leak-claude-text` / `passed=0` | `refine-memory-task5-mock-20260811-diag-step6-7c945465` |
| 初次 Claude text 分类不足 | `refine-memory-task5-mock-20260811-diag-claude-text-65eb7d25` |
| 最终 safe-stage/auth 分类 | `refine-memory-task5-mock-20260811-diag-timeout-23929ee9` |

用户已随后授权对上表的 exact projects 进行独立、精确 cleanup；本次文档提交本身不执行 Docker、`down`、`down -v`、prune 或 cleanup。不得将该授权扩大到 `preflight-7c1a9e2b`、前一 launcher 诊断 project、任何其他 project、network、volume、image 或 evidence 路径。

## 下一 Gate

下一 Gate 是在产品 fork 中先以 TDD 修复 `auth.serviceToken` 的保留与 Bearer 发送，再构建 replacement Proxy image、完成 scoped independent review，并在新的唯一 run/project/evidence tuple 下重跑 deterministic Mock。未经新的实施授权，不进入 TUI、真实/Paid 模型或 Task 6。
