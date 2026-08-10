# Task 2 shell asset fix round 1：Core/Proxy rebuild Passed

## 结论

**Runtime Passed（source-build/runtime asset only）**。在产品提交 `49c4536b0353b3b4f7b5544c065d4845615031aa` 上，动态 Shell Gate 覆盖全部 23 个 tracked `*.sh`；Core 与 Proxy 从两个新的唯一、无 secret build context 串行重建，镜像内全部 `*.sh` 均无 CR 且通过 `bash -n`，native/runtime assets 复验通过。

Hub 无需重建，继续使用原 Task 2 Passed 镜像。本记录不证明服务健康、Mock、真实 API、TUI 或跨客户端业务流，它们仍为 **Not Run**。

## RED → GREEN

- RED：23 个 tracked shell 中 17 个为 `w/crlf`；动态测试得到 `crlf_failures=17`、`syntax_failures=16`。
- 最小修复：保留根 `.gitattributes`，只把现有 tracked shell 的 CRLF 安全刷新为 LF；不改脚本逻辑。
- 逻辑一致性：22 个既有脚本的 worktree filtered blob 与原 index blob 全部相同；唯一逻辑 diff 是把 regression test 从硬编码 5 项改为动态枚举全部 tracked `*.sh`。
- GREEN：`tracked=23 crlf_failures=0 syntax_failures=0`。
- 产品提交：`49c4536b0353b3b4f7b5544c065d4845615031aa`（`test(build): validate all tracked shell scripts`）。

## 串行构建

| 顺序 | 组件 | 唯一 context | 固定 tag | build | image ID / repo digest |
| ---: | --- | --- | --- | --- | --- |
| 1 | Core | `.task2-build-contexts/fix1-core-49c4536-tracked` | `local/refine-memory-core:49c4536-fix1` | Passed，130.9 s | `sha256:fded9d48d76bf71d0652023be0e9aa5553d46c039cc04ace0ec7c1e370f95d44` |
| 2 | Proxy | `.task2-build-contexts/fix1-proxy-49c4536` | `local/refine-memory-proxy:49c4536-fix1` | Passed，393.1 s | `sha256:14acf3c7d04b1b701159193b79e9989656f83d0ad24018cafcb37c1c171468aa` |
| 保留 | Hub | 原 combined context | `local/refine-memory-hub:0a568c3-task2` | 本轮 Not Rebuilt | `sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4` |

本地 tag 的 repo digest 与各自 image ID 相同。第一次新的 Core archive context 因未继承根 EOL attributes，在 Docker build 前被 shell precheck 拒绝并保留；随后使用新的 tracked-only context，不复用失败 context。

旧 Core `sha256:063e247...` 和旧 Proxy `sha256:394101...` 被上述新镜像 supersede；旧记录与镜像不删除。

## 镜像内验证

| 检查 | 结果 |
| --- | --- |
| Core 全部 `/app/**/*.sh` | 4 个；无 CR；`bash -n` Passed |
| Core native/runtime | `node:sqlite` + `sqlite-vec v0.1.7-alpha.2`、`@node-rs/jieba` Passed；SQLite experimental warning 保留 |
| Proxy 全部 `/app/**/*.sh` | 6 个（含安装依赖脚本）；无 CR；`bash -n` Passed |
| Proxy tests | Vitest 1 file / 2 tests Passed |
| Proxy optional stub | `isCostGuardAvailable() === false`；fallback Passed |
| Proxy native/runtime | `better-sqlite3` SQLite 3.49.2；`node-pty` import/spawn Passed |
| Proxy typecheck | Failed，仍为相同 6 个基线错误：`RawYamlConfig.memCommand` 3 项、Task `isDefault` 2 项、public stub declaration 1 项 |

全部容器检查使用 `--rm --network none`，未启动默认 entrypoint 的业务服务。

## 权限元数据

| 组件 | `Config.User` | runtime UID | 本轮处理 |
| --- | --- | ---: | --- |
| Core | unset（root-default） | 0 | 记录 concern，不改造 |
| Proxy | `app` | 10001 | Passed |
| Hub | unset（root-default） | 0 | 记录 concern，不改造；本轮未重建 |

## 安全边界

- build context 使用 tracked-only/官方生成器输入，未包含 secret-shaped 文件。
- 未读取 `.env`、settings、secret、home、`.runtime/` 或原始 evidence。
- 未启动业务栈、Mock、真实 API、TUI 或端口探针。
- 未 push、建 PR、修改 remote、执行 `down -v`、prune 或 destructive cleanup。
