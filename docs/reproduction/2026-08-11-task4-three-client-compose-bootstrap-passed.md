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

## Formal review fix round 1（append-only）

本节保留上方初次实现/review 的 RED 链和 image IDs；它们是当时固定输入的不可变证据。以下 IDs 对当前 launcher/renderer source supersede 上表，不把本轮 retag 写成 build。

### RED → GREEN

- Bootstrap RED：`node --test tests/integration/test/bootstrap.test.mjs` exit 1，12 项中 9 passed / 3 failed。旧实现分别接受 5/5 个 owner user/key/Agent/Session/asset cardinality 破坏、6/6 个 outsider user/key/Agent/Team/Task/scope 重叠，以及 4/4 个新增 binding 字段 mutation。
- Bootstrap GREEN：同命令 exit 0，12/12。发布任何 credential、`bootstrap.private.json` 或 `run-manifest.json` 前，三 owner 的五组值各自 exact cardinality=3；outsider user/key/Agent 不与 owner 重叠且 Team/Task 分别不同；post-set 保留既有 binding，逐字段验证六个 distinct `(consumer, foreignOwnerAsset)` pair 的 `asset_id`、`asset_type`、`injection_mode`、`priority`、`created_by`。
- Bundle RED：`node --test tests/integration/test/launch-client.test.mjs tests/integration/test/render-settings.test.mjs` exit 1，13 项中 11 passed / 2 failed。launcher 接受 linked `.memory` 和 absolute out-of-home bundle 并 spawn 两次；renderer 两例均错误 exit 0。
- Caller RED：`node --test tests/integration/test/runtime-assets.test.mjs tests/integration/test/compose-contract.test.mjs` exit 1，14 项中 11 passed / 3 failed，确认 legacy Claude entrypoint、Windows wrapper 和 Windows Compose 尚未传入 bundle home。
- Bundle/caller GREEN：renderer 与 launcher 只接受 `<home>/.memory/agent-bundle.json`，依次 `lstat` home 和 `.memory` 并拒绝 symlink/junction/非目录，final file 仍须 single-link regular file；legacy Claude 与 Windows caller 同步。bootstrap、launcher、renderer、runtime assets、Compose contract focused 命令 exit 0，39/39。
- Fresh root：`node --test tests/integration/test/*.test.mjs` exit 0，86/86。

### 当前三镜像证据

三个 Dockerfile 都复制了变更后的 launcher/renderer，因此按 Claude → OpenCode → Pi 串行各 build 一次；固定 Node digest 与官方 CLI integrity/SHA layer 命中已审计 cache。未启动业务栈、未调用模型 API。

| Client | 单次 build | 当前 active image ID | Runtime |
| --- | --- | --- | --- |
| Claude Code `2.1.226` | exit 0，11.648 s，直接 tag `refine-memory-claude-code:2.1.226` | `sha256:440d744ef794a29340622f920458fb533c9bff3d3db0b9ce01d3c5947c68492b` | Config.User `agent`；network-none UID `10001`；version/help exit 0，version `2.1.226 (Claude Code)` |
| OpenCode `1.18.16` | exit 0，1.463 s，误写旧本地别名 `refine-memory-opencode:1.2.10` | `sha256:8cdd9dfe249acc1888cb8c6fd8d00bfe46091cc4802fc44f3102adfd976886ab` | 同一 image 仅用 `docker image tag` 增加 active `:1.18.16`，不是第二次 build；Config.User `agent`；network-none UID `10001`；version/help exit 0，version `1.18.16` |
| Pi `0.84.1` | exit 0，1.434 s，误写旧本地别名 `refine-memory-pi:0.60.0` | `sha256:8d3275d699e20f9ab0e91f69f2eb50bcdf6b8722e331ba995c94444ebe56bc82` | 同一 image 仅用 `docker image tag` 增加 active `:0.84.1`，不是第二次 build；Config.User `agent`；network-none UID `10001`；version/help exit 0，version `0.84.1` |

Active base + `mock`/`real`/`claude`/`opencode`/`pi`/`management` Compose config 全部 exit 0；Mock 只使用随后清理的 disposable non-LLM gateway 值。`bash -n` 3/3、Markdown relative links 62、changed UTF-8 no-BOM/LF、secret-shape、gitlink/product status 与 `git diff --check` 均纳入最终静态 Gate。本轮没有读取 `.env`、settings、secret、home 或 runtime evidence 原文。服务、Mock 三写六读、ACL/leak、管理 CRUD、真实 API、TUI 和 Codex 仍为 Not Run。

Review Minor 的 commit-provenance ledger 只记为 deferred，留待最终 consolidation；不扩大本 fix diff。
