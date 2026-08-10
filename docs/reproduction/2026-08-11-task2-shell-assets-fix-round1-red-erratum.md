# Task 2 shell asset fix round 1：RED 与证据勘误

## 结论

**Failed / Superseded evidence**。Task 2 首轮通过记录中的产品 Shell Gate 只硬编码检查 5 个脚本，没有覆盖全部 23 个 tracked `*.sh`；因此旧 Core/Proxy 镜像虽已通过当时的 build/native asset 检查，仍包含带 CR 的 runtime shell。该遗漏不改写旧 reproduction，本记录作为 append-only erratum 固定新增 RED。

本记录只修正 source-build/runtime asset 证据边界。服务、Mock、真实 API、TUI 和跨客户端业务流仍为 **Not Run**。

## 固定输入

- upstream base：`0a568c328ea1aae3f22ed3656e7900da7ea565c1`
- 当时 active 产品 SHA：`3db2b7d60a3b6162118cad1090d1872f1410835a`
- 旧 Core：`local/refine-memory-core:0a568c3-task2@sha256:063e247be20c83c2e4167a1b20fc4d0ebbd4a0266d2e7129c842b83aae023ec0`
- 旧 Proxy：`local/refine-memory-proxy:3db2b7d-task2@sha256:39410138cf8a6b2742b0bfe99658b6f58b6c32693c2cd441a701b7e8ec3ab31a`
- Hub 保持：`local/refine-memory-hub:0a568c3-task2@sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4`

## RED

Windows worktree 对全部 tracked shell 的枚举结果：

```text
tracked=23
w/crlf=17
w/lf=6
bash-n exit=2
```

将回归改为动态枚举全部 tracked `*.sh` 后，在修复前得到：

```text
tracked=23 crlf_failures=17 syntax_failures=16
```

旧镜像的遗漏范围：

| 镜像 | 带 CR 的 runtime shell | 证据结论 |
| --- | ---: | --- |
| Core `sha256:063e247...` | 4 | Shell asset Gate 失败，旧镜像被 supersede |
| Proxy `sha256:394101...` | 2 | Shell asset Gate 失败，旧镜像被 supersede |

旧 reproduction 的原文和旧镜像均保留；后续 Passed 记录不得倒写成它们当时已覆盖全部 shell。

## 权限元数据勘误

首次 Task 2 总结只突出 Hub root-default，不完整。真实 image metadata/runtime UID 是：

| 组件 | `Config.User` | runtime UID |
| --- | --- | ---: |
| Core | unset（root-default） | 0 |
| Proxy | `app` | 10001 |
| Hub | unset（root-default） | 0 |

本轮只准确披露，不把 source-build Gate 扩大为 Core/Hub 权限改造。

## 安全边界

- 未读取 `.env`、settings、secret、home、`.runtime/` 或原始 evidence。
- 未启动业务服务、Compose project 或监听端口。
- 未做真实 API、push、PR、remote 修改、`down -v` 或 prune。
