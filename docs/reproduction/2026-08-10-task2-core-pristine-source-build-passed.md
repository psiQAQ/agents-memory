# Task 2 Core pristine source-build Passed

## Status

**Runtime Passed（source-build/runtime asset only）**。本记录只证明固定 Tencent upstream SHA 的 MemoryCore 镜像可以从源码构建，且镜像内必要 SQLite/native runtime asset 可加载；不证明服务健康、业务流、Mock、真实 API 或 TUI。

## Fixed inputs

- Source: `submodules/TencentDB-Agent-Memory/MemoryCore`
- Tencent commit: `0a568c328ea1aae3f22ed3656e7900da7ea565c1`
- Docker context: `MemoryCore`
- Dockerfile: `MemoryCore/Dockerfile`
- Tag: `local/refine-memory-core:0a568c3-task2`
- Platform resolved by Docker: `linux/amd64`
- Base image resolved by Dockerfile: `node:22-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`

没有使用 `--pull`、浮动产品镜像、secret、Tencent ignored `.env` 或真实模型配置。

## Build result

```text
docker build --progress=plain -t local/refine-memory-core:0a568c3-task2 .
exit code: 0
elapsed: 215.2 s
image ID: sha256:063e247be20c83c2e4167a1b20fc4d0ebbd4a0266d2e7129c842b83aae023ec0
repo digest: local/refine-memory-core@sha256:063e247be20c83c2e4167a1b20fc4d0ebbd4a0266d2e7129c842b83aae023ec0
```

这是 pristine upstream build；构建前产品 worktree clean，未预先迁移 legacy 修复。

## Runtime asset verification

均使用 `docker run --rm --network none`，覆盖镜像默认入口，不启动 MemoryCore 服务：

- Node `node:sqlite`：内存数据库 `select 1` Passed。
- `sqlite-vec`：扩展真实加载到 `DatabaseSync`，`select vec_version()` 返回 `v0.1.7-alpha.2`。
- `@node-rs/jieba`：原生模块 import Passed。
- `/app/src/gateway/server.ts`、`/app/node_modules/sqlite-vec`、`/app/node_modules/tsx` 与 `/usr/bin/tini`：存在性检查 Passed。

Node 输出 `ExperimentalWarning: SQLite is an experimental feature`；这是 Node 22 内建 SQLite 的运行期警告，不是加载失败。

## Boundary

- 未启动业务栈或监听端口。
- 未读取 `.env`、settings、secret、home、`.runtime/` 或历史原始 evidence。
- 未执行真实 API、push、PR、remote 修改、`down -v` 或 prune。
- Proxy 与 Hub 在本记录形成时仍为 Not Run，必须分别产生后续不可变记录。
