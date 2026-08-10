# Task 2 Proxy pristine source-build RED

## Status

**Failed / Blocked**。固定 Tencent upstream SHA 的 MemoryProxy pristine source-build 在 Docker context 校验阶段稳定失败。本记录保留修复前 RED；后续修复或成功必须新增记录，不覆盖本文件。

## Fixed inputs

- Source: `submodules/TencentDB-Agent-Memory/MemoryProxy`
- Tencent commit: `0a568c328ea1aae3f22ed3656e7900da7ea565c1`
- Docker context: `MemoryProxy`
- Dockerfile: `MemoryProxy/Dockerfile`
- Requested tag: `local/refine-memory-proxy:0a568c3-task2`
- Base image resolved by Dockerfile: `node:22-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`

没有使用 `--pull`、浮动产品镜像、secret、Tencent ignored `.env` 或真实模型配置。

## RED

```text
docker build --progress=plain -t local/refine-memory-proxy:0a568c3-task2 .
exit code: 1
elapsed: 128.5 s
Dockerfile:50 COPY packages/cost-guard/package.json ...: not found
Dockerfile:51 COPY packages/cost-guard/src ...: not found
ERROR: failed to compute cache key
```

BuildKit 已成功读取 Dockerfile、`.dockerignore`、`MemoryProxy` context 与固定 `node:22-slim` digest；失败发生在执行 `npm install` 之前。失败构建没有生成请求 tag 的 image ID/digest。

## Initial evidence

- `git ls-tree -r 0a568c3` 将 `MemoryProxy/packages/cost-guard` 记录为 gitlink `160000 commit 15759552068705caecdccb582b5c93cc29a3bd2e`。
- 当前 upstream tree 没有根 `.gitmodules`，因此 fresh checkout 没有该 gitlink 的 URL/初始化映射。
- pristine 产品 worktree 中 `MemoryProxy/packages/cost-guard` 是空目录；Docker build context 中不存在 Dockerfile 无条件要求的 `package.json` 与 `src`。
- `MemoryProxy/package.json` 把 `@context-proxy/cost-guard` 声明为 optional `file:packages/cost-guard` 依赖，但 Dockerfile 当前无条件复制它。

以上是待进一步测试的根因链；本记录不预先指定修复方案。

## Boundary

- 未修改产品源码，未迁移 legacy commit。
- 未启动业务栈、监听端口或 Hub build。
- 未读取 `.env`、settings、secret、home、`.runtime/` 或历史原始 evidence。
- 未执行真实 API、push、PR、remote 修改、`down -v` 或 prune。
