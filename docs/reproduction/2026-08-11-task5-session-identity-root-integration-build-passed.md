# Task 5 session-identity root integration 与四镜像 build/assets Passed

## 状态

**Product tests/review + Root Static/contract + Runtime build/assets Passed / Business runtime Not Run**。

本记录承接 [pre-runtime round 1 erratum/RED](2026-08-11-task5-pre-runtime-review-round1-erratum.md) 与 [root static Passed](2026-08-11-task5-pre-runtime-review-round1-root-static-passed.md)，不改写早期证据。产品 session-identity fix、root gitlink/Proxy pin、request-local client credential 与四个限定镜像已完成前置验证；本轮在任何业务 Compose `up` 之前停止。

## 固定输入

| 项目 | 值 |
| --- | --- |
| Root base | `codex/four-agent-memory-compose@ec2ff1ea639b05e696290cbb28dc8ea7a818a2a6` |
| 旧 gitlink | `d6afcd835467c56a29d89e9befcb796ab612da78` |
| Reviewed product HEAD / 新 gitlink | `codex/four-agent-memory-upstream@2de58c2f656978cfe310e3ac3ade085d8096f83b` |
| Proxy | `local/refine-memory-proxy:2de58c2-l1-fix@sha256:be847074bd63e34ba85b1eee8638cd7d2457d3617d85ad880d36d71efea69fcd` |
| Proxy metadata | Image ID/repo digest 同为 `sha256:be847074...69fcd`；`Config.User=app`；UID 10001 |
| Remote retrieval | `origin/codex/four-agent-memory-upstream@38ced16f46fed640bcb7360fb1ca45f9f9918628`；`2de58c2...` local-only |

产品 formal verdict 为 Spec PASS、Quality PASS、Critical 0、Important 0、最终 CLEAN；保留一项 nonblocking test-granularity Minor。`--network none` 产品验证为 19 files / 298 tests Passed；`tsc --noEmit` 精确保留既有六项 baseline errors，zero new。本轮只 inspect 上述 Proxy，没有 rebuild Core、Hub 或 Proxy。

## Root TDD

Focused 命令：

```powershell
node --test tests/integration/test/four-cli-compose.test.mjs tests/integration/test/launch-client.test.mjs
```

- RED：exit 1，14 passed / 3 failed。三个预期 assertion 分别显示 Compose 仍固定旧 Proxy、index gitlink 仍为 `d6afcd8...`、继承的错误 `TDAI_MEMORY_USER_KEY` 未被 private bundle key 覆盖。
- GREEN：exit 0，17/17 Passed。
- 最小变更：stage exact `2de58c2...` gitlink；Compose 固定 reviewed tag/digest；launcher 删除继承的 `TDAI_MEMORY_USER_KEY`，再从同一 bundle `memory_user_key` 同时设置 `MEMORY_USER_KEY` 与 `TDAI_MEMORY_USER_KEY`。
- 凭证值没有加入 Compose、prompt、cache、log、evidence 或 tracked file；runtime Compose 继续没有 `build:`。

Fresh root full Node 为 150/150 Passed。显式 dummy `COMPOSE_PROJECT_NAME`、`RUN_ID`、`EVIDENCE_DIR` 与 disposable non-LLM gateway 下，base + `mock`、`real`、`claude`、`opencode`、`pi`、`management` 为 7/7 Compose config Passed。

## 四镜像串行 build

每个 build 前先 inspect exact tag；随后使用 tracked build-only overlay，一条命令只 build 一个 service。四条命令按下表顺序各执行一次，均 exit 0；没有 retry、parallel、显式 `--pull` 或业务 `up`。

| 顺序 | Service / tag | build 前 | build 后 exact image ID |
| --- | --- | --- | --- |
| 1 | `bootstrap` / `refine-memory-integration-tools:task5` | missing | `sha256:e0a321e15a10d8bc985168d1ca213abf1f7378ef71593fdb9d674f0bd7effa74` |
| 2 | `claude-client` / `refine-memory-claude-code:2.1.226` | `sha256:440d744ef794a29340622f920458fb533c9bff3d3db0b9ce01d3c5947c68492b` | `sha256:8da31af44b686f44b3595e2d392d69c113ed26a35c781bfea39a276e6f271dbb` |
| 3 | `opencode-client` / `refine-memory-opencode:1.18.16` | `sha256:8cdd9dfe249acc1888cb8c6fd8d00bfe46091cc4802fc44f3102adfd976886ab` | `sha256:42bc38ead4c3de8ecd75152eeffe23f10f81c580d00e8a816e7b657cf7c57e9b` |
| 4 | `pi-client` / `refine-memory-pi:0.84.1` | `sha256:8d3275d699e20f9ab0e91f69f2eb50bcdf6b8722e331ba995c94444ebe56bc82` | `sha256:56582fd216db259342f4414ebdc6c9c9188229678d77eb2f360959c9af2e4538` |

BuildKit 可复用固定 base/package install cache；新的 launcher 与 evidence ownership layer 均进入新 image ID。这不是完全离线 build 的声明。

## Image contract

所有运行检查使用临时 `docker run --rm --network none`，没有连接业务服务：

- tools：`/lab/clients/manifest.json` 与 `/lab/tools/bootstrap.mjs` 存在。
- Claude Code：`2.1.226 (Claude Code)`；help exit 0；Config.User `agent`，UID 10001。
- OpenCode：`1.18.16`；help exit 0；Config.User `agent`，UID 10001。
- Pi：`0.84.1`；help exit 0；Config.User `agent`，UID 10001。
- 三 client：`/client-evidence` 均为 10001:10001，UID10001 可创建并删除临时 write-check；launcher、renderer、runtime-lib、Task 5 contract 与 headless driver assets 存在；Claude settings template 额外存在。

OpenCode help 将 ANSI 正文写到 stderr，Windows PowerShell 5 的 stdout-only/`ErrorActionPreference=Stop` 包装曾产生验证脚本错误；直接采集双流确认原始 Docker exit 0、56 行输出。该问题未触发 build retry，也不是 image/help failure。

## 明确未运行

- MemoryCore、MemoryProxy、MemoryHub、Mock 的服务启动或 health；
- Proxy→Mock protocol/leak 业务流、management/outsider live oracle；
- 三次顺序写入、六次跨 owner 读取与 final oracle；
- Claude Code/OpenCode/Pi 真实 headless operation 与 TUI；
- Paid/真实模型、真实 API 与 Codex Stage 2。

本轮未读取 `.env`、settings、home、secret、`.runtime/` 或原始 evidence；未 push、建 PR、改 remote、prune、删除 image/volume/context 或执行 destructive cleanup。active gitlink 在另行授权 push/归档前仍无法由 fresh clone 取得。
