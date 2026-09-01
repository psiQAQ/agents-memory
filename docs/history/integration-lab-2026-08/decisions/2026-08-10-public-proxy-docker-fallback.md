> **状态：Historical** — 本决策只适用于已归档的 2026-08 实验，不构成当前仓库的执行要求。

# ADR-2026-08-10：Public Proxy Docker 公开构建回退

> **ADR**：Architecture Decision Record，用于记录一项关键工程选择、依据与后果。

> **Submodule**：由父仓库引用、但保留独立 Git 历史和版本的源码目录。

> **Public checkout**：只包含公开仓库可取得内容的源码检出，不包含私有 submodule 内容。

> **Gitlink**：Git 在父仓库中记录另一仓库精确提交的指针；只检出父仓库时，该目录可以存在但没有实际文件。

> **Passthrough stub**：不启用可选功能、只保留兼容接口的公开占位包；这里让请求继续按原路径转发。

> **Docker image**：由 Dockerfile 构建、用于启动容器的只读文件系统模板。

**状态：** Accepted

**验证状态：** Public Proxy image build/runtime self-check Passed；Root Static Integrated；Full Compose Build/Runtime Not Run

**日期：** 2026-08-10

## Context

Public checkout 中 `MemoryProxy/packages/cost-guard` 是空的私有 gitlink，没有 `package.json` 或 `src`；原 Dockerfile 却直接 `COPY` 这两个不存在的来源，导致公开源码构建在 source stage 失败。已有发布脚本已经定义安全回退语义：没有私有 cost-guard 时使用不导出实现的公开占位包，让 `guard-adapter` 保持 passthrough。

## Decision

1. 若 `packages/cost-guard/package.json` 存在，继续使用已初始化的真实 cost-guard，不覆盖其内容。
2. 若该文件不存在，Docker build 从仓库跟踪的非私密 stub 填充 `packages/cost-guard`；stub 不启用 `CostGuard`，维持 passthrough。
3. 根仓库采用 public commit `69fd8b31e3fd4362af6c65407b92b26dfabebd0c`，gitlink 与 Core、Hub、Proxy 的 `fork-69fd8b` 标签同步更新，并由 Compose contract 锁定。
4. 该 public commit 仍为 local-only；本阶段不 push、不修改 remote。用户授权 push 前，fresh clone 无法取得根 gitlink 目标。

## Evidence

- Public focused test：1/1 passed。
- Public full Proxy Vitest：94 passed / 3 skipped。
- 独立复审：Clean。
- 单独 Proxy Docker build：exit 0。
- Built image runtime check：`better-sqlite3=ok cost-guard=passthrough-stub`，exit 0。
- 当前 Docker client/engine 29.6.2、Docker Desktop 4.85.0、context `desktop-linux`、Compose 5.3.1 可访问。

## Consequences

- 公开源码不再依赖无法取得的私有 gitlink 才能构建 Proxy；已初始化的真实 cost-guard 行为保持不变。
- Public 分支从首个本地修复 `c75ef58` 起至当前修复，共 27 个本地 public commit，active pin 为上述完整 SHA。
- 完整 Compose build、Mock 业务 Gate、Claude TUI 与 DeepSeek 仍为 Not Run，等待 controller 执行；单独 Proxy image 自检不能替代这些 Gate。
