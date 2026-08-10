# Task 3 Anthropic platform routes Passed

## 结论

**Runtime Passed（handler/route tests + source-build/runtime assets only）**。产品提交 `f97873393ba314db58bcc981ce06cf03233a7061` 为 Claude Code、OpenCode、Pi 提供三条显式 Anthropic Messages route，并在 auth/body/Core/upstream 前 fail closed 校验 route-bound source 与 session。OpenCode/Pi 的真实 source 保留到 adapter、session binding 与 Core participation record。服务健康、Mock 共享/隔离、真实 API、TUI 与跨客户端业务流仍为 **Not Run**。

## 最小实现

- 三条 literal route 分别绑定 `claude-code`、`opencode`、`pi`；unknown Anthropic-style prefix 由显式 guard 返回 404，不落入最终 OpenAI catch-all。
- handler 不接受 source header；path/source conflict、unbound source、缺失 session、非法字符、`..` 与长度超限均在副作用前拒绝。
- UUID、`ses_*`、`urn:uuid:a:b` 三种允许格式有正例。
- OpenCode/Pi 复用现有 Anthropic handler/default adapter 和 session 状态机，但 adapter kind、binding、store 与 Core source 始终保留真实平台值。
- handler、identity、CodeBuddy 复用状态机和已知 OpenAI 回归日志不输出 raw session/user/key/identity 值。

## 测试

| 检查 | 结果 |
| --- | --- |
| Focused route/source/session/privacy | 2 files / 19 tests Passed |
| 产品 full Vitest（source bind mount） | 3 files / 21 tests Passed |
| 新镜像内 full Vitest | 3 files / 21 tests Passed |
| `git diff --check` 与 changed TS EOL | Passed；13 个 changed TS 均 `i/lf w/lf` |
| Proxy `tsc --noEmit` | Failed；仍精确为既有 6 项，无新增 |

既有 typecheck 基线为 `RawYamlConfig.memCommand` 3 项、Claude/CodeBuddy Task `isDefault` 2 项、public cost-guard stub declaration 1 项。

## official public context 与单次构建

- Context generator：`DRY_RUN=1 deploy/dockerhub/publish.sh memory-proxy`。
- 两次 secret-scan：产品 `src package.json` 与 context `src package.json packages` 均 Passed。
- 唯一 context：`.task2-build-contexts/proxy-f978733-task3`。
- 唯一 tag：`local/refine-memory-proxy:f978733-task3`。
- Build：`linux/amd64`，单次顺序构建 Passed，397 s。
- Image ID / local repo digest：`sha256:ea1487a338f1cb765ed81f71d81adb93db3b9ae0608ff874bb2d314e07d02667`。

## 无网络 runtime asset

全部检查使用 `docker run --rm --network none` 并覆盖默认 entrypoint，不启动 Proxy 服务：

- image `Config.User=app`，runtime UID `10001`。
- 6 个 `/app/**/*.sh`：无 CR，`bash -n` Passed。
- `better-sqlite3`：SQLite `3.49.2`；`node-pty` import 与 `spawn` Passed。
- public cost-guard stub：`isCostGuardAvailable() === false`，fallback Passed。
- `/app/src/index.ts`、tsx、stub 与 `/usr/bin/tini` 存在。

Task 2 Proxy `sha256:14acf3c7...` 保留为旧构建证据；Task 3 新镜像使用唯一 tag/ID，没有覆盖旧记录或镜像。

## 边界

未读取 `.env`、settings、secret、home、`.runtime/` 或历史原始 evidence；未启动业务栈、监听端口、Mock、真实 API 或 TUI；未 push、PR、修改 remote、执行 `down -v`、prune 或 destructive cleanup。
