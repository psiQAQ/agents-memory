# Task 4：三客户端 Compose、bootstrap 与 CLI image

**状态：Runtime Passed（client build/config assets only）**

**日期：2026-08-11**

**Root base：`5bf881aaf48874679ca06652fba69aed757e5481`**

**Tencent gitlink：`0bba4d798ce452d97dbce3c6fa1b7a3eccd881a2`（未修改）**

## 结论边界

Task 4 已建立 active `compose.four-cli*.yaml`、无 secret 三客户端 manifest、动态三 owner/outsider bootstrap、私有 bundle/config renderer 与三款固定非 root CLI image。review fix 补齐 Mock runtime config/healthy 依赖、config-dir no-follow 与 Node base digest pin。root Node suite 最终为 81/81；Compose base 和六个 overlay 均可解析；三镜像从官方发布源串行构建并通过精确 version/help/UID Gate。

本记录不证明 Memory 服务启动、Mock prompt、三写六读、ACL/leak、管理 CRUD、真实模型、TUI 或 Codex。它们仍为 Not Run。

## TDD RED → GREEN

| Gate | RED | GREEN |
| --- | --- | --- |
| manifest / `ACTIVE_CLIENTS` / bootstrap | focused 1 failed，旧实现返回 `invalid bootstrap arguments`；tracked manifest 不存在；CLI manifest 入口返回 nonzero | dynamic claude/opencode/pi、严格去重/allowlist/三者齐全、三 owner assets、六 cross-owner binding、独立 outsider；focused 10/10 |
| prepare / renderer / launcher | `invalid agent`、`invalid target`、launcher missing；focused 分别 nonzero | 私有 bundle、Claude/OpenCode/Pi 原生 config、旧 `MEMORY_*` 替换；focused 17/17 |
| active Compose / images | 新 Compose/Dockerfile 不存在，focused 5/5 failed | base + mock/real/claude/opencode/pi/management matrix、internal network、loopback Panel、六 client volumes、固定供应链值；focused 5/5 |
| build-arg fixedness | Dockerfile 允许覆盖 registry/integrity/URL，artifact test 1 failed | 所有官方 registry/version/integrity/URL/SHA 值改为不可覆盖 literal；artifact 2/2 |
| review: runnable Mock / no-follow / base digest | focused 15 项中 3 failed：无 `config-init`、config-dir junction 使 key 写入 workspace、浮动 Node tag | Mock runtime config/只读挂载/healthy 依赖、逐级 no-follow + home containment、固定 base digest；17/17 |
| review: client readiness | 新增依赖断言后 Compose 2/4 failed，因 client/bootstrap 仅等 `service_started` | 改为 Proxy/Core `service_healthy`；4/4 |
| review: SOP matrix | 清空 gateway env 后照抄 SOP，Mock config 因 required variable 缺失 exit 1 | 示例设置 disposable non-LLM dummy gateway 值并在 `finally` 清理；六 profile exit 0 |

Legacy `compose.yaml`、Windows/A-B-C fixtures 与不可变历史证据未删除或改写。Task 4 复用既有 manifest atomic publish、credential fan-out、bundle no-follow/atomic rename 与 evidence 校验逻辑。

## Pi Release RED 链

1. 首次 build（10.8 s）已通过 `sha256:5634d7...`，但把 archive 解到 `/usr/local/bin` 后 `pi --version` 返回 `Permission denied`（exit 127）。
2. 按 executable mode 假设增加 `chmod 0755 /usr/local/bin/pi`；静态回归转绿，但第二次 build（9.2 s）仍相同失败，假设被 runtime 否证。
3. 第三次诊断 build（9.1 s）在同一 layer 列出 archive：`/usr/local/bin/pi` 是目录，真实 binary 是 `/usr/local/bin/pi/pi`，且本身已有 `rwxr-xr-x`。根因是顶层目录与 PATH 命令名冲突。
4. 最小修复改为将完整 release 目录解到 `/opt/pi`，创建 `/usr/local/bin/pi -> /opt/pi/pi`；保留 binary 的相对 assets/node_modules。修复后 build、version/help、UID 通过。

## 最终 image 证据

Docker Client/Server 均为 `29.6.2`。最终 Dockerfile 不允许通过 build arg 改写固定发布物。

| Client | 最终 image ID | Build | Runtime |
| --- | --- | --- | --- |
| Claude Code `2.1.226` | `sha256:4822ca8d312f3c63cc53afac0c700f0f66611109b20eacdf6cce9794d6dd76fc` | 初次 39.7 s；review rebuild 2.6 s（已审计安装层 cache）；base digest + wrapper/native npm integrity | Config.User `agent`；UID `10001`；version/help exit 0 |
| OpenCode `1.18.16` | `sha256:02661f09dc296c9676e3e0a4a6437568a02127414f661087b16074854abe5efc` | 初次 55.2 s；review rebuild 1.9 s（cache）；base digest + wrapper/native npm integrity | Config.User `agent`；UID `10001`；version/help exit 0 |
| Pi `0.84.1` | `sha256:252d3871ef9662bd6e34fad449b8fb3b1ca0cb461e8211472489136660babab2` | 初次 17.5 s；review rebuild 2.0 s（cache）；base digest + Release SHA-256 | Config.User `agent`；UID `10001`；version/help exit 0 |

执行的 build 只访问 `registry.npmjs.org`、官方 GitHub Release 和固定 Node base image；未调用模型 API。所有 `docker run` 都使用 `--rm`，未启动 Compose 服务。

## Compose 与身份边界

- Core/Hub 延用 Task 2 固定镜像；Proxy 固定为 Task 3 review-fix `local/refine-memory-proxy:0bba4d7-task3-fix1@sha256:88a350e44c0e04bec0632034a4dfb437904dc4da6471fa9957ebb9dbaa86f66c`。
- client 容器只挂各自 home/workspace；bootstrap-state 只到 prepare one-shot，不到 client。
- Mock overlay 通过 `config-init` 原子生成 Core/Proxy config 与 gateway token，只读挂载并等待 Core/Proxy health；`real` overlay 仍不是 `.env`/Paid launcher。
- renderer 逐级 `lstat` 拒绝 config 目录 symlink/junction，Task 4 launcher 还要求 config 在对应私有 home 内。
- 三 client 没有 model key、Compose secret、Docker socket 或共享 writable volume。
- management overlay 只发布 `127.0.0.1:8125 -> Panel`；Knowledge `8424` 没有 host port。
- OpenCode 使用 `@ai-sdk/anthropic` 与 `/opencode/<space>/v1`；Pi 使用 `anthropic-messages` 与 `/pi/<space>`；两者都只产生 Bearer 所需 key 与四 identity headers，不增加 source header。

## Not Run / concerns

- OpenCode/Pi 实际 release binary 的 provider config 加载、最终 `/v1/messages` 拼接与 prompt 请求留给 Task 5 deterministic Mock。
- 服务健康、三写六读、outsider ACL/注入负测、管理 API、comprehensive leak、TUI、Paid Gate 与真实模型均 Not Run。
- Pi release tarball 的顶层目录行为已固定在 Dockerfile artifact 回归；未来版本变更必须重新核验 release layout 和 SHA-256。

## 最终复验

- `node --test tests/integration/test/*.test.mjs`：exit 0，81/81。
- active base + `mock`/`real`/`claude`/`opencode`/`pi`/`management` Compose config matrix：全部 exit 0。
- 全部 `tests/integration/**/*.sh` 的 `bash -n`：Passed。首次 Windows 组合校验因 PowerShell 交给 Git Bash 的反斜杠路径被拼接而停止；将路径规范化为 `/` 后重跑通过，不是 shell 语法 RED。
- Markdown 相对链接、UTF-8 无 BOM/LF、secret-shape scan、`git diff --check`：Passed。
- root 完整测试与上述静态校验均未读取 `.env`、settings、secret 或 runtime evidence 原文。
- review rebuild 后首次 help harness 因 OpenCode 将正文写到 stderr，PowerShell stdout-only nonempty 检查而中止；合并 stdout/stderr 后 OpenCode/Pi 均为 help exit 0/nonempty。
