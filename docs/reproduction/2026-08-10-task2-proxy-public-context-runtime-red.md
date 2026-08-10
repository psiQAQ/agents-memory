# Task 2 Proxy public-context build Passed / runtime RED

## Status

**Failed / Blocked**。修复 Windows Shell LF 后，固定 upstream 的官方 public context 可以构建 Proxy 镜像，native SQLite 等基础 runtime asset 也可加载；但 public `cost-guard` stub 没有触发预期的 unavailable fallback，因此 Proxy source-build Gate 仍未通过。本记录不可覆盖。

## Fixed inputs

- Upstream base: `0a568c328ea1aae3f22ed3656e7900da7ea565c1`
- Product LF fix: `43a3477b568de68e21489e8e14b0ee54189ceacf`
- Context generator: `DRY_RUN=1 deploy/dockerhub/publish.sh memory-proxy`
- Context: `.task2-build-contexts/proxy-0a568c3`
- Requested tag: `local/refine-memory-proxy:0a568c3-task2`

Context generator 对显式 `src package.json packages` 执行两次 secret-scan，并使用 upstream 自带的 optional `cost-guard` stub；没有读取 `.env` 或传入模型 key。

## Build Passed

```text
docker build --progress=plain -t local/refine-memory-proxy:0a568c3-task2 .
exit code: 0
elapsed: 458.9 s
image ID: sha256:e4877297d9b0a90ad35dda7794fdc4f48b4917e8e60981070f895c1076897862
repo digest: local/refine-memory-proxy@sha256:e4877297d9b0a90ad35dda7794fdc4f48b4917e8e60981070f895c1076897862
```

## Runtime checks

均使用 `docker run --rm --network none`，覆盖默认入口，不启动 Proxy 服务：

- `better-sqlite3`：内存数据库查询 Passed，SQLite `3.49.2`。
- `node-pty`：native module import 与 `spawn` export Passed。
- 镜像用户：UID `10001` Passed。
- `/app/src/index.ts`、`tsx`、stub 与 `tini`：存在性检查 Passed。
- public stub fallback：**Failed**。通过 `tsx` 导入真实 `/app/src/guard-adapter.ts` 后，`isCostGuardAvailable()` 返回 `true`，但 stub 的 `CostGuard` export 是 `undefined`。

```text
Error: stub must not enable cost guard
exit code: 1
```

## Boundary

- 镜像 build exit 0 不足以把 Proxy Gate 标为 Passed；fallback 行为必须先 RED→GREEN。
- 未启动业务栈、监听端口、Hub build或真实 API。
- 未读取 `.env`、settings、secret、home、`.runtime/` 或历史原始 evidence。
- 未执行 push、PR、remote 修改、`down -v` 或 prune。
