# Task 2 Proxy source-build Passed

## Status

**Runtime Passed（source-build/runtime asset only）**。本记录证明精确 upstream base 加本轮两笔 TDD 最小修复后，MemoryProxy 可以用 upstream 自带 public context 构建，并在无网络容器内正确加载 native SQLite/PTY 与 optional cost-guard fallback；不证明服务健康、业务流、Mock、真实 API 或 TUI。

## Fixed inputs

- Upstream base: `0a568c328ea1aae3f22ed3656e7900da7ea565c1`
- Product LF fix: `43a3477c54802a2cf362ecd196004adb73755166`
- Product runtime fix: `3db2b7d60a3b6162118cad1090d1872f1410835a`
- Context generator: `DRY_RUN=1 deploy/dockerhub/publish.sh memory-proxy`
- Unique context: `.task2-build-contexts/proxy-3db2b7d`
- Tag: `local/refine-memory-proxy:3db2b7d-task2`
- Platform: `linux/amd64`

context generator 对显式 `src package.json packages` 执行两次 secret-scan，并生成 upstream 设计的 optional `cost-guard` stub。没有使用 `--pull`、浮动产品镜像、secret、Tencent ignored `.env` 或真实模型配置。

## Build result

```text
docker build --progress=plain -t local/refine-memory-proxy:3db2b7d-task2 .
exit code: 0
elapsed: 341.7 s
image ID: sha256:39410138cf8a6b2742b0bfe99658b6f58b6c32693c2cd441a701b7e8ec3ab31a
repo digest: local/refine-memory-proxy@sha256:39410138cf8a6b2742b0bfe99658b6f58b6c32693c2cd441a701b7e8ec3ab31a
```

修复前原目录 build、Windows LF 和 stub runtime RED 分别保存在先前不可变记录；旧 RED 镜像 `sha256:e4877297d9b0a90ad35dda7794fdc4f48b4917e8e60981070f895c1076897862` 未被覆盖。

## Runtime verification

均使用 `docker run --rm --network none`，覆盖镜像默认入口，不启动 Proxy 服务：

- `guard-adapter-optional.test.ts`：2/2 Passed。
- 真实 public stub import：`isCostGuardAvailable() === false`，fallback Passed。
- `better-sqlite3`：内存数据库查询 Passed，SQLite `3.49.2`。
- `node-pty`：native module import 与 `spawn` export Passed。
- 镜像用户 UID `10001`；`/app/src/index.ts`、`tsx`、stub 与 `tini` 存在性检查 Passed。

全量 `tsc --noEmit` 仍 Failed：当前 upstream 的 `RawYamlConfig.memCommand` 3 个、Task `isDefault` 2 个，以及 public stub declaration 1 个错误，共 6 个；没有错误指向本轮 helper/test。该基线未被扩大修复，保留为 concern。

## Boundary

- 未启动业务栈或监听端口。
- 未读取 `.env`、settings、secret、home、`.runtime/` 或历史原始 evidence。
- 未执行真实 API、push、PR、remote 修改、`down -v` 或 prune。
- Hub 在本记录形成时仍为 Not Run，必须产生独立后续记录。
