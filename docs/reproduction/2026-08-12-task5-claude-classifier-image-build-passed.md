# Task 5 Claude classifier replacement image Passed

## 状态

**Build/Assets Passed；diagnostic runtime Not Run。**

本记录只证明 bounded classifier 代码、Claude replacement image 及 active Compose digest pin 已完成。它不改变 `7186820a` 的 `claude-cli-nonzero-before-mock` Blocked 结论，也不证明 Mock 两写六读、final、TUI 或真实模型通过。

## 固定输入

| 项目 | 值 |
| --- | --- |
| Root classifier fix | `e8a3636a780094bfe77f41961416c71bb6afc14b` |
| Root image pin | `863980b` |
| Product/gitlink | `9e456a5b7bb47ae40596237d0f0b87c1edfc098f` |
| 旧 Claude image | `sha256:8da31af44b686f44b3595e2d392d69c113ed26a35c781bfea39a276e6f271dbb` |
| 新 Claude image/RepoDigest | `sha256:058eccaf56507941c27fd1ce57e69cb6ae5cff20680e7a36ed80bddb22ec946b` |
| `launch-client.mjs` SHA-256 | `3d397bc957d43abcffc8f17deae756806d5565aba6a9d50a8be57f7c888eb832` |

## TDD 与审查边界

- 初版 classifier 的独立 review 找到 timeout 早结算、Claude 官方 HTTP 错误格式 false-green、旧 image 缺 named export，以及两个测试/语义缺口。
- follow-up 以真实 RED 修复：TERM → bounded grace → KILL 后只在 child `close` 结算；官方 401/429/500 与 innocuous prose；recognized category 必须有 output；DNS/TCP timeout/error/destroy-once。
- focused `86/86`、fresh root `230/230`、Compose config `7/7` Passed。
- follow-up 独立复审因 reviewer 平台额度耗尽未完成；主 agent 按原 finding 清单逐项静态复核并 fresh 重跑 focused `86/86`，未发现新的 Critical/Important。此限制不能写成独立 review Passed。

## 单次 build 与离线资产

Docker Desktop 在 build 前处于 stopped；正常 restart 后 engine `29.6.2`、global running containers `0`。确认旧 image 容器引用 `0`、build project labels `0/0/0` 后，只执行一次 `claude-client` build；未带 `--pull`，未并行或重试。build exit `0`，耗时约 `3.1s`，Claude 安装层为 cached。

新 image 验证：

- `Config.User=agent`，实际 UID `10001`。
- `claude --version` 与 `claude --help` exit `0`。
- image 内 `launch-client.mjs` hash 与 host 完全一致，并导出 `diagnoseClientLaunch`。
- `launch-client`、renderer、runtime helper、Task 5 contract/headless client、settings template 均存在且可读。
- image history secret-shape matches `0`；验证容器与 global containers 均为 `0`。
- 旧 image 在 tag replacement 后已不可 inspect，且没有容器引用；未执行 `docker image rm`、`--rmi` 或 prune。

active Claude client/headless 现固定为：

```text
refine-memory-claude-code:2.1.226@sha256:058eccaf56507941c27fd1ce57e69cb6ae5cff20680e7a36ed80bddb22ec946b
```

build-only overlay 仍使用普通 tag，避免把 digest ref 当作 build 输出 tag。pin TDD 为 `8/9` RED → `9/9` GREEN，最终 root `230/230` Passed。

## 下一 Gate

以全新唯一 tuple 对新 image 做 preflight；通过后仅执行一次 tracked coordinator 的原配置 bounded classifier diagnostic。不得 retry、reset、finalize、TUI 或真实/Paid 模型。`/tmp` tmpfs 仍为 Inference/Not Run，只有 classifier 明确指向 filesystem 后才允许做单变量验证。
