# 2026-08-10 四 Docker CLI 基线记录

> **Append-only reproduction report**：只新增、不覆盖旧实验结果的复现记录。

> **Static baseline**：版本、指针和文档已固定；不代表镜像、服务、客户端或业务流运行成功。

- 类型：Append-only reproduction report
- 日期：2026-08-10
- 根仓库基线：`a949ca305550693c30abb3f2a3f84ab76d4e101c`（Task 1 开始时）
- Tencent active gitlink：`feat/server_team@0a568c328ea1aae3f22ed3656e7900da7ea565c1`
- Legacy preservation ref：`codex/legacy-proxy-hardening-69fd8b@69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- Legacy ref 边界：local-only、未 push；fresh clone 不可取得，未经授权不得 push。跨 clone 可重建保全需要 push 或外部归档授权，在此之前仍未完成。
- 固定客户端版本：Claude Code `2.1.226`；Codex `0.147.0`；OpenCode `1.18.16`；Pi `0.84.1`
- 结论：Static baseline；Docker/Mock/真实 API/TUI Not Run

## 本轮范围

1. 将 active 入口切换为四 Docker CLI：Stage 1 为 Claude Code、OpenCode、Pi 的原生 Anthropic Messages 路由，Stage 2 为 Codex Responses。
2. 将旧 Windows + Claude 路线标为 Legacy，保留旧 specs/plans/ADR/reproduction 原文，不把历史 Runtime Passed 扩写为新基线结果。
3. 记录每客户端独立 identity、key、home、workspace、evidence 和显式 team-visible sharing 的架构边界。

## 未运行边界

本轮未执行 Docker workload、镜像 build、Mock、真实模型请求、端口探针、TUI、真实服务 API 或凭证读取。没有读取或记录 Tencent ignored `.env`、settings、secret、home 或 runtime evidence 原文。

因此以下项目均为 **Not Run**：upstream Core/Proxy/Hub source-build、Stage 1 路由、Mock identity/share/isolation/leak Gate、客户端卷隔离、管理面、真实模型和 Stage 2 Codex。

## 下一步

按实施计划的 Task 2，从 `0a568c328ea1aae3f22ed3656e7900da7ea565c1` 分别构建 Core、Proxy、Hub。每项先记录 RED/Passed，再固定 image ID/digest；发现产品阻塞时先写最小复现并在 fork worktree 修复。不得以 legacy `69fd8b3` 结果替代该验证。
