# Task 5 Claude EROFS classifier and hardened tmpfs fix Passed

## 状态

**TDD / Build / Runtime Asset Passed；business diagnostic Not Run**。

`92204e33` 的 canonical diagnostic 只返回 `cli-nonzero / unknown`。后续不读取 raw output，而是对固定 Claude Code `2.1.226` binary/source 与 active Compose 做静态追踪：`-p` 主流程在任何 setup/API 请求前创建 `${os.tmpdir()}/claude-<uid>`；当前 service 是 `read_only: true` 且无 `/tmp` tmpfs，因此 UID10001 会在 `/tmp/claude-10001` 遇到 `EROFS`。原 classifier 的 anchored errno allowlist 未含 `EROFS`，所以现场被安全降级为 `unknown`。

## RED → GREEN

- classifier RED：新增 `Error: EROFS: read-only file system` 后，旧实现返回 `unknown`；test file 为 `31/33` Passed（新增 leaf 与父测试失败）。最小 GREEN 只把 `EROFS` 加入既有 filesystem errno allowlist，focused `33/33`。
- Compose RED：新 Claude digest 与 bounded tmpfs 两项合同在旧配置上为 `8/10` Passed、`2` failed。GREEN 后 focused `10/10`。
- final root Node `232/232` Passed；base + mock/real/claude/opencode/pi/management Compose config `7/7` Passed；两轮独立 scoped review 均为 C0/I0/M0。

## 唯一镜像构建与资产验证

| 项目 | 结果 |
| --- | --- |
| Build input | root `178a4a812e0325a53944619585cf428e68f3221b`，product/gitlink `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`，两边 clean |
| Build | `claude-client` 单次 Compose build，exit `0`；Claude install layer cached；无 retry/pull/并发 build |
| Image | `refine-memory-claude-code:2.1.226@sha256:261a917376f791d9b5e092040c2f488f23588b7103a27606226426f273b040dd` |
| User/runtime | Config.User `agent`；actual UID `10001`；Claude `2.1.226`；help exit `0` |
| Source contract | host/image `launch-client.mjs` SHA-256 均为 `9352bb72aabaf41ddc914b4e392e57375c0ccd50e16ba0cfbd32174540692d03`；`diagnoseClientLaunch` export present |
| tmpfs runtime | `--rm --network none --read-only` probe 证明 UID10001 可创建 `/tmp/claude-10001`，mount options 包含 `rw,noexec,nosuid,nodev`，结束后 global containers `0` |

active `claude-client` 与 `claude-headless` 均固定新 digest，并各自获得 `/tmp:rw,noexec,nosuid,nodev,size=64m,mode=1777`；OpenCode/Pi 未增加 tmpfs。旧 `sha256:058eccaf...` 在 tag replacement 后已自动 absent、container refs 为 `0`，未执行手工 image remove 或 prune。

一次临时验证命令因 PowerShell `$Host` 保留变量和一次 Node `--eval` quoting 失败；两者均未启动业务栈，验证容器由 `--rm` 清理。修正后的 hash/export/tmpfs probes 全部 Passed。此记录不证明 Claude 已发出请求、Mock/三写六读/final 或 TUI 通过。
