# 2026-08-10 Public Fork 静态集成记录

> **Public fork**：用户在公开 GitHub 仓库中维护的个人派生仓库，用来保存可独立验证并适合后续 PR 的通用修复。

> **SHA**：Git 用来唯一标识某次提交的哈希值。

> **Submodule**：根仓库记录外部 Git 仓库精确提交、同时让该源码保留独立提交历史的目录。

> **Gitlink**：根仓库固定 submodule 精确提交的指针。

> **Static Integrated**：独立复审通过的 public fork 精确 SHA 已写入根 gitlink、镜像标签和静态测试；不代表镜像或服务已经运行。

> **Local-only commit**：只存在于当前本地 Git 仓库、尚未推送到远端的提交；新的 clone 无法取得它。

> **Baseline-existing typecheck error**：在修改前基线和修改后分支中以相同方式出现的类型检查错误；它仍是失败项，但不是本轮新增回归。

> **Append-only reproduction report**：只新增、不覆盖旧实验结果的复现记录。

> **Vitest**：Public fork 的 JavaScript/TypeScript 单元测试执行器。

> **TUI**：Claude Code 在终端中显示并接收键盘操作的交互界面。

> **POSIX file mode**：Linux 等系统用于限制文件所有者、组和其他用户读写权限的位标记；`0600` 表示只有所有者可读写。

- 类型：Append-only reproduction report
- 日期：2026-08-10
- 根仓库集成基线 SHA：`c234d9eb87e33834f5e0354bb233269f77f690b8`
- 根仓库集成提交 SHA：`27b325c40f32cf558491064465ee6bb98630555c`
- Public fork 基线 SHA：`c75ef5834eeacf17f2df8f84f7cf2d1747822de2`
- Public fork final SHA：`b75317b2bb0deb72240b2016d54252e3232b48fa`
- 镜像标签：`fork-b75317b`
- 远端状态：final SHA 未 push；未修改 remote；未创建 PR
- 结论：Static Integrated；Docker Build/Runtime/TUI/DeepSeek Not Run

## 集成内容

1. 根 gitlink 从 `c75ef5834eeacf17f2df8f84f7cf2d1747822de2` 更新到 `b75317b2bb0deb72240b2016d54252e3232b48fa`。
2. `memory-core`、`memory-hub`、`memory-proxy` 镜像统一使用 `fork-b75317b`，Compose contract 测试精确锁定三项标签。
3. 当前 README、Docker 集成说明、规格和企业评估把 ACL/header/runtime tool base 状态更新为 Static Integrated / Runtime Not Run；没有把静态证据升级为业务 Passed。
4. 新增集成 ADR；旧 ADR 和旧 reproduction 报告保持不变。

## Public Fork 证据

Public fork 从基线到 final 共 25 个独立提交，覆盖 session/identity 隔离、无分隔符碰撞的持久 key 编码、Memory/Skill bridge 每请求认证、上游 header allowlist、DeepSeek Anthropic 路径、跨平台 tool base、settings 原子 `0600` 写入、Panel build context 和 legacy credential 脱敏。

独立复审对 final SHA 给出 Clean：

| 检查 | 结果 | 边界 |
| -- | -- | -- |
| MemoryProxy Vitest | Passed | 15 files；93 passed / 3 skipped |
| MemoryPanel tests | Passed | 4/4 |
| Panel backend/web build | Passed | web 1321 modules；仅既有打包体积警告 |
| Proxy typecheck | Failed（baseline-existing） | 基线与 final 完全相同的 6 项；新增错误 0 |
| Bash / diff / LF / lock / secret scan | Passed | package/lock 无变化；61 个变更文件 LF；credential/private-key candidate 0 |
| Git/remote | Passed | worktree clean；remote 仍为用户 fork；未 push |
| Node 22 | Not Run | 当前 agent context 无法访问 Docker engine |
| native SQLite | Skipped | 2 项测试 skipped；当前 Node 24 缺少 native `better-sqlite3` binding |
| POSIX mode | Skipped | 1 项测试 skipped；当前宿主为 Windows |

## 根仓库证据

| 检查 | 结果 | 边界 |
| -- | -- | -- |
| Node tests | Passed | 57/57 |
| Compose config | Passed | base/hardened/real/Windows 4/4；仅静态展开 |
| Bash syntax | Passed | 3/3 |
| Git diff / LF / secret / links | Passed | 不读取真实 settings/secret |
| Docker build/runtime | Not Run | 当前 agent context 无法访问 engine；历史 build 曾在 registry network 阶段失败 |

## 限制与下一步

- Final public SHA 是 local-only commit。当前工作区可构建；新 clone 在用户授权 push 前不能取得 gitlink 目标，禁止静默回退到旧 SHA。
- 未被访问的 legacy 数据行可能仍含历史 `user_key`；已有部署必须离线清理并轮换全部 Memory 用户 key。
- Static Integrated 只解除源码/gitlink 漂移；B shared/C isolation、Proxy/Core/Hub 恢复、Docker/Windows Claude TUI 与真实 DeepSeek 均需后续业务 Gate。
- 下一步由用户会话确认 Docker engine 可访问，再构建 `fork-b75317b` 镜像，按顺序运行 `mock-contract` 与 `standalone-memory`。
