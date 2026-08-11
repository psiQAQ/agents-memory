# Task 5 Proxy privacy hardening 与 build/assets Passed

**Status：Runtime Passed（product tests + source-build/runtime assets only） / Static contract Passed（root harness）**。

本记录承接 [Task 5 Proxy privacy hardening RED](2026-08-11-task5-proxy-privacy-hardening-red.md)。产品修复范围为 `0bba4d798ce452d97dbce3c6fa1b7a3eccd881a2..d6afcd835467c56a29d89e9befcb796ab612da78`；active 产品 SHA 固定为 `d6afcd835467c56a29d89e9befcb796ab612da78`。

| 运行元数据 | 值 |
| --- | --- |
| Build run ID | `task5-proxy-build-20260811-094317` |
| Public context | `proxy-d6afcd8-task5-public-20260811-094317` |
| BuildKit reference | `desktop-linux/desktop-linux/ykx4x7l849p9q99u6uilronc3` |
| Business Compose project/volumes | None created |
| Evidence | 本文件；不含 raw identity、credential、marker、prompt、body 或 log |

## 产品验证

| Gate | 结果 |
| --- | --- |
| MemoryProxy full product suite，容器内 `--network none` | 15 files / 113 tests Passed |
| Independent product review | CLEAN；Critical 0 / Important 0 / Minor 0 |
| `tsc --noEmit` | exit 2，精确保留既有 6 项 baseline error，没有扩展为 Passed |
| 既有 6 项 typecheck baseline | `src/config.ts` 3 项 `memCommand`；`src/session/claude-code/init.ts` 1 项 `isDefault`；`src/session/codebuddy/init.ts` 1 项 `isDefault`；`src/storage/factory.ts` 1 项 public cost-guard stub declaration |

产品修复覆盖 Anthropic/OpenAI upstream header allowlist、server-only credential replacement、primary/retry origin 绑定、redirect fail-closed、JSONL/ClickHouse/Opik/Langfuse 等结构化 sink 最小化，以及 active/auxiliary/injection/bootstrap diagnostics。该结论来自产品测试与审查；live Proxy 到 Mock 的端到端泄漏链仍未运行。

## 唯一 public-context build

- 官方 `deploy/dockerhub/publish.sh memory-proxy` 生成唯一 public context；脚本内产品输入 scan 与 context scan 均 Passed。
- 额外窄扫描：170 files、30 directories、0 reparse/symlink、0 forbidden path；Dockerfile、lock/package/tsconfig/source 和 public cost-guard stub 均齐全。
- 只执行一次 `docker build`，没有 retry、并行 build 或显式 `--pull`。
- 固定镜像：`local/refine-memory-proxy:d6afcd8-task5@sha256:d79751b6dca733c5aec2ea11a4484cc4184068373dde14c0f01e6793c6bc30e8`。
- Image ID 与 repo digest 均为 `sha256:d79751b6dca733c5aec2ea11a4484cc4184068373dde14c0f01e6793c6bc30e8`；`Config.User=app`，容器 UID 10001。
- BuildKit 仍做了 Dockerfile frontend/base image 的 registry auth/metadata resolution；对应 frontend、base 与依赖 layer 均命中 cache，没有观察到 base layer 下载。这不是“完全离线 build”的证明。

## 镜像 runtime assets

镜像内以下验证均使用临时 `docker run --rm --network none`，没有启动业务栈：

- 6 个 shell 全部无 CR 且 `bash -n` Passed。
- `better-sqlite3` 使用 SQLite 3.49.2 完成真实内存查询。
- `node-pty` 完成真实 spawn。
- public cost-guard stub/source 可导入，导出为 unavailable fallback；`node_modules` link 指向 `/app/packages/cost-guard`。
- `/app/src/index.ts`、guard adapter、stub source、tsx loader 与 `/usr/bin/tini` 存在，tini 可执行。

## 根仓库静态契约

- Task 5 harness commits：`5bb2d65`、`a10e825`、`a2ed161`、`4cae880`。
- `node --test tests/integration/test/*.test.mjs`：104/104 Passed。
- active base + `mock`、`real`、`claude`、`opencode`、`pi`、`management` overlays：6/6 `docker compose config --quiet` Passed。
- Compose 与其 contract test 固定使用上述 `d6afcd8-task5` Proxy image；focused test 先因旧 pin 取得 1 RED，再更新 Compose 后 5/5 Passed。

## 尚未运行

Task 5 仍是 **in progress**。本记录不证明：

- MemoryCore/MemoryProxy/MemoryHub/Mock 业务服务启动或 health；
- 三款真实 CLI headless 命令；
- Core L0/L1 的三次顺序写入、六次跨 owner 读取；
- outsider、management API 与 live Proxy injection oracle；
- TUI 用户确认或任何真实 DeepSeek 调用。

独立根集成 review 通过前继续暂停业务栈。失败或成功均不执行 `down -v`、prune 或模糊清理；本轮也没有创建需清理的业务 Compose project/volume。
