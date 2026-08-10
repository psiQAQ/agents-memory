# Task 2 Hub pristine recipe-context RED

## Status

**Failed / Blocked**。固定 upstream Hub Dockerfile 不能以 recipe 目录本身作为 build context；它要求预先组合 `MemoryPanel` 与 `MemoryKnowledge`。本记录保留 combined context 生成前的 pristine RED，后续结果不得覆盖。

## Fixed inputs

- Tencent Hub source content: 与 `0a568c328ea1aae3f22ed3656e7900da7ea565c1` 对 `MemoryPanel`、`MemoryKnowledge`、`deploy/panel-knowledge-combined` 的 diff 为空
- Docker context: `deploy/panel-knowledge-combined`
- Dockerfile: `deploy/panel-knowledge-combined/Dockerfile`
- Requested tag: `local/refine-memory-hub:0a568c3-task2`
- Base image: `node:22-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`

没有使用 `--pull`、浮动产品镜像、secret、Tencent ignored `.env` 或真实模型配置。

## RED

```text
docker build --progress=plain -t local/refine-memory-hub:0a568c3-task2 .
exit code: 1
elapsed: 1.3 s
COPY knowledge/: not found
COPY panel/web/: not found
COPY panel/: not found
ERROR: failed to compute cache key
```

Docker 收到的 recipe context 约 `19.07 kB`，其中没有 Dockerfile 所需的 `panel/`、`panel/web/` 和 `knowledge/`。这是纯 build-context RED；upstream 已提供 `deploy/panel-knowledge-combined/build.sh` 用于 rsync combined context，下一步复用该入口而不改产品源码。

Docker 对 `REMOTE_INSTANCE_KEY` 与 `LLM_API_KEY` 两个空值 `ENV` 名输出 `SecretsUsedInArgOrEnv` 静态 warning；本轮没有传入 key 或读取 secret。该 warning 保留为 concern，不等于发现 secret 值。

## Boundary

- 未修改 Hub Dockerfile、Panel 或 Knowledge 源码。
- 未启动业务栈、监听端口或真实 API。
- 未读取 `.env`、settings、secret、home、`.runtime/` 或历史原始 evidence。
- 未执行 push、PR、remote 修改、`down -v` 或 prune。
