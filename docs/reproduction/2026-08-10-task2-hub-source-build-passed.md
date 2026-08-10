# Task 2 Hub source-build Passed

## Status

**Runtime Passed（source-build/runtime asset only）**。本记录证明固定 upstream Hub 源码通过 upstream combined-context 生成器可以构建，且镜像内 Knowledge native SQLite 与 Panel/Knowledge 必要 runtime assets 可用；不证明服务健康、业务流、Mock、真实 API 或 TUI。

## Fixed inputs

- Tencent upstream base: `0a568c328ea1aae3f22ed3656e7900da7ea565c1`
- Hub source content: `MemoryPanel`、`MemoryKnowledge` 与 `deploy/panel-knowledge-combined` 相对该 base 的 diff 为空
- Context generator: `KEEP_CTX=0 PREPARE_ONLY=1 deploy/panel-knowledge-combined/build.sh`
- Unique context: `.task2-build-contexts/hub-0a568c3`
- Tag: `local/refine-memory-hub:0a568c3-task2`
- Platform: `linux/amd64`
- Base image: `node:22-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`

combined context 的 `panel`、`panel/web`、`knowledge`、OpenAPI、Dockerfile、`.dockerignore` 与启动脚本存在性检查 Passed；文件名检查未发现 `.env*`、`metadata-instances.json`、admin-key 或 DB runtime 文件。没有使用 `--pull`、浮动产品镜像、secret、Tencent ignored `.env` 或真实模型配置。

## Build result

```text
docker build --progress=plain -t local/refine-memory-hub:0a568c3-task2 .
exit code: 0
elapsed: 486.0 s
image ID: sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4
repo digest: local/refine-memory-hub@sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4
```

修复前 recipe 目录直接 build 的 combined-context RED 保存在先前不可变记录。

## Runtime verification

均使用 `docker run --rm --network none`，覆盖默认入口，不启动 Hub 服务：

- Knowledge `better-sqlite3`：内存数据库查询 Passed，SQLite `3.49.2`。
- `/app/panel/dist/index.js` 与 `/app/knowledge/dist/server.mjs`：`node --check` Passed。
- Knowledge MCP dist、`openapi.yaml`、Panel web `index.html`：存在性检查 Passed。
- `/usr/local/bin/start-combined.sh`：LF、executable 与 `bash -n` Passed。
- `/app` 中 `.env`、`metadata-instances.json`、`.admin-key` 文件名：未发现。

## Concerns and boundary

- 镜像 `Config.User` 为空，即 root-default；本轮只记录事实，不在 source-build Gate 中扩大为容器权限重构。
- Dockerfile 对空值 `REMOTE_INSTANCE_KEY` 与 `LLM_API_KEY` 环境变量名产生两个 `SecretsUsedInArgOrEnv` warning；没有发现或传入 secret 值。
- build 还输出 npm peer/deprecation、install-script approval 与 Vite chunk-size warnings；build/runtime asset 检查仍为 exit 0。后续服务 Gate 不能忽略这些 warning。
- 未启动业务栈或监听端口；未执行真实 API、push、PR、remote 修改、`down -v` 或 prune。
