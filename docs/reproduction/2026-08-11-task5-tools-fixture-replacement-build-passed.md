# Task 5 tools fixture replacement build/assets Passed

## 状态

**Root fixture fix/review + tools replacement build/assets Passed / deterministic Mock rerun Not Run**。

本记录承接 [authfix tool fixture Blocked](2026-08-11-task5-mock-20260811-authfix-2eae9df1-tool-fixture-blocked.md)，不覆写任何历史 Blocked run，也不将 tools image build/assets 结论扩大为服务、protocol/leak 或完整 Mock Gate Passed。

## 固定输入与 root 验证

| 项目 | 值 |
| --- | --- |
| Root HEAD | `bfb3839a82d206e147ba31c9a0b3e1b5e493cd6d` |
| tools build run | `tools-build-20260811-bfb3839a` |
| Build service / tag | `bootstrap` / `refine-memory-integration-tools:task5` |
| Build-only inputs | `tests/integration/compose.four-cli.build.yaml`；context `tests/integration`；`images/tools/Dockerfile` |

本次 root 修复让 Mock fixture 识别 Proxy 规范化后的 array text-block marker。定向 RED 为 mock `8/9`，修复后 GREEN 为 mock `9/9`、runner `43/43`、root `152/152`、Compose config `7/7`。独立 review 结果为 Critical `0`、Important `0`；唯一 Minor 是 header/body 优先级没有直接测试，不阻止 replacement image rebuild。

## 唯一 tools build 与 image contract

build-only `bootstrap` 单次 exit 0；没有 `--pull`、retry、业务 Compose `up`、服务启动或 cleanup。

| 项目 | 值 |
| --- | --- |
| 旧 local image ID | `sha256:e0a321e15a10d8bc985168d1ca213abf1f7378ef71593fdb9d674f0bd7effa74` |
| 新 exact local image ID | `sha256:8ca1a2a82a585ecf477577db2308c09348b4c7a6ff6022693f3653ed20004d81` |
| Node | `v22.23.2` |
| Image contract | host/mock fixture hash 匹配；required assets、entrypoint 与 workdir 均通过 |

构建后旧 ID 已自动无法 inspect；这来自 tag 被新 image 替换，不是主动 `rm`。后续 container/Compose 资源查询为 `0`，临时资源亦为 `0`。这些查询只说明本次 build 没有留下引用或 Compose 资源，不证明业务 runtime。

## 未运行边界与下一 Gate

本记录没有读取 raw evidence、日志、`.env`、settings、home 或 secret；也没有启动 Docker workload、执行 runtime、`down`、prune 或 cleanup。新 tools image 当前为 **Ready（build/assets only）**。下一 Gate 是在新的唯一 run/project/evidence tuple 下重跑固定 deterministic Mock；该 rerun 当前为 **Not Run**。management/outsider、三写六读、final oracle、三个真实 headless、TUI 与真实/Paid 模型均保持 Not Run。
