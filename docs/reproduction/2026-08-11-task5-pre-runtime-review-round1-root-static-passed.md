# Task 5 pre-runtime review round 1：root static Passed

## 状态

**Static/contract Passed（root corrections only） / Pre-runtime review Pending / Runtime Not Run**。

本记录承接 [round 1 erratum/RED](2026-08-11-task5-pre-runtime-review-round1-erratum.md)。七项 root-side Important 已通过 TDD 收紧；产品跨身份 session cache 修复、产品新提交与新 Proxy 镜像仍 Pending，独立 scoped re-review 尚未回执，所以不得启动业务栈或重建 tools/三客户端镜像。

## 根提交

| Commit | 合同修正 |
| --- | --- |
| `192f81b` | random reset epoch、单调 sequence、per-path aggregate、strict Anthropic fixture 与 same-epoch headless delta |
| `a1e91fd` | 每次 write/read 的 Core L0 identity/role oracle、write L1 owner/marker、三写六读顺序与 outsider all-model bracketing |
| `99a9964` | headless bounded capture + sensitive scan；逐 client/action 原子 0600 fixed-shape evidence |
| `d4894df` | tools base digest、runtime/build Compose 分离、三个独立 evidence volumes |
| `4f751df` | required run/project/evidence、manifest run binding 与 host-only fixed-sequence launcher |

## GREEN

- `node --test tests/integration/test/*.test.mjs`：143/143 Passed。
- base + `mock`、`real`、`claude`、`opencode`、`pi`、`management`：6/6 `docker compose config --quiet` Passed，所有静态命令显式传入 disposable non-LLM gateway、`RUN_ID`、`COMPOSE_PROJECT_NAME` 与 `EVIDENCE_DIR`。
- focused：runner 43/43、headless launcher 8/8、host launcher 3/3、Compose/runtime-assets 16/16 Passed。
- runtime Compose 不含 `build:`；新增 build-only overlay 仅覆盖 bootstrap 与三个 client。tools Dockerfile 固定 `node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`。
- host launcher 固定执行 services → bootstrap → 三个 config → protocol/leak → management/outsider → 三写 → 六读 → final；任一步失败即停，不 build、不 cleanup。

以上均为测试和配置解析，不是 Docker 业务流证明。

## Evidence 与输出边界

- headless child stdout/stderr 只在内存中做 256 KiB bounded capture，扫描当前 prompt/operation/marker、渲染后的 user key/identity 与固定 sentinels；不会继承到宿主或写入 evidence。
- 每个 client/action 由受信任 Gate 写入自己的独立 evidence volume，采用 atomic hard-link、0600 与固定脱敏 shape；final 只接受精确九份 evidence。
- evidence 不包含 raw identity、key、marker、prompt、body、response 或 log；本轮没有读取 `.env`、settings、home、`.runtime/` 或任何原始运行证据。

## 尚未运行

- tools、bootstrap 与三个 client 的新 Task 5 镜像 build/runtime asset 验证；Task 4 固定 client images 不包含本轮 headless artifacts，不能复用为本轮 build 证明；
- 产品 session-cache 修复提交、完整产品 suite/typecheck 对比、public-context scan/build 与新 Proxy image；
- MemoryCore/MemoryProxy/MemoryHub/Mock 服务、真实三 CLI headless、三写六读、live outsider/management、TUI 与真实 DeepSeek；
- scoped independent re-review。

所有失败或成功 project/volumes 的 destructive cleanup 均未获授权。本轮没有创建业务 Compose project/volume；未 push、PR 或修改 remote。

## Formal scoped review 与 round 2 erratum（append-only）

`8b5b8b7..0f8774f` formal scoped review 判定原七项 Important 为 `ADDRESSED 5 / NOT ADDRESSED 2`，因此本文件前文“七项 root-side Important 已通过”的表述过宽。未关闭项是：

- I6：launcher 没有把 Compose project 唯一绑定到 run，也没有在任何 business step 前证明 exact project 的 containers/networks/volumes 均不存在；
- I7：三个 UID10001 headless image 没有为新 named volume 初始化可写的 `/client-evidence` mountpoint。

round 2 分别取得真实 RED：project/run mismatch 被接受且执行 17 个 business steps；container/network/volume 三类 exact label collision 均未拒绝；三个 client Dockerfile 均缺少 evidence mountpoint 创建/ownership。最小 GREEN 后：

- `COMPOSE_PROJECT_NAME` 必须精确为 `refine-memory-${RUN_ID}`；launcher 以 Docker `container/network/volume ls --filter label=com.docker.compose.project=<project>` 在创建 evidence 目录和首个 Compose step 前 fail closed。任一探针非零或输出非空都停止，不读取/回显资源原文，也不清理碰撞资源。
- Claude/OpenCode/Pi Dockerfile 均在 `USER agent` 前创建 `/client-evidence` 并 `chown 10001:10001`；headless 仍固定 `10001:10001`，不新增 root init service。
- focused I6 5/5、I7 7/7、相关组合 29/29、fresh root Node 149/149 与 Compose config 6/6 Passed。

这些结果仍是 **Static/contract Passed**。三个 client 与 tools 尚未 rebuild，named-volume ownership 没有 runtime 证明；产品修复、替代 Proxy、同一 reviewer scoped re-review、business stack、headless、三写六读、live outsider/management、TUI 与真实模型继续 Pending/Not Run。
