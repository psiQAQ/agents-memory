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
