# Repository Agent Rules

本文件是本仓库所有 coding agent 的根级执行规则。每次新对话或新任务开始时，先读本文件，再读 `CLAUDE.md`、当前企业评估和与任务相关的最新运行记录。聊天摘要和历史结论只能用于定位，不能替代当前 Git、源码、测试和运行状态。

## 第一目标与阶段顺序

除非负责人在当前任务中明确改变目标，当前第一目标是完成并管理一套可重复演示的记忆共享系统：

- Windows 原生 Claude Code 使用 `agent-a`；Docker Claude Code 使用 `agent-b`。
- A、B 连接同一套 MemoryProxy/MemoryCore，但必须使用不同的 Memory 用户、Agent、Session 和 user key。
- A、B 加入同一 Team，通过明确授权的 team-visible 记忆验证共享；隔离客户端继续作为反例。
- 主对话共用 DeepSeek Pro 上游，记忆提炼使用 DeepSeek Flash 上游；模型凭证只留在服务端。
- 先通过无付费 Mock、身份、共享、隔离和泄漏 Gate，再执行用户明确授权的真实模型测试。
- 管理范围包括用户、Team、Agent、Task、共享资产、服务健康、凭证和持久卷生命周期；优先复用 Tencent Panel/Knowledge 的现有入口。
- 交付可执行 SOP，覆盖启动、健康检查、Windows/Docker 客户端配置、演示步骤、管理入口、证据、停止和精确清理。

按以下顺序推进，不因发现次要问题而提前扩展范围：

1. 完成 Windows Claude Code + Docker Claude Code 的同栈共享记忆演示和日常管理。
2. 处理演示中实际出现的兼容性问题。
3. 根据已验证的使用需要增加功能。

只要第一阶段仍有未完成 Gate，新对话默认继续下一项未完成工作，不先做无关重构、泛化或功能扩展。

## 复用优先

- 实现或测试前，先检查 `submodules/TencentDB-Agent-Memory` 的源码、部署脚本、Dockerfile、配置、测试和文档。
- Tencent 仓库已有的能力直接调用、配置或做薄封装，不在根仓库复制实现，也不另造同类工具。
- 根仓库只保留跨仓库编排、Windows/Docker 双客户端拓扑、证据 Gate、SOP 和企业评估等集成职责。
- Docker 构建与服务级测试优先复用 fork 中的 Dockerfile、启动脚本和测试。只有跨宿主网络、双客户端编排或上游确实缺失的验证，才放在根仓库 `tests/integration/`。
- 若复用遇到问题，先判断是配置/使用错误、版本差异还是上游缺失。只有确认 Tencent 仓库没有该能力，或现有实现存在可复现缺陷时，才开发修复或新增功能。

## Tencent fork 开发流程

- 适配修复和新增功能都在 `submodules/TencentDB-Agent-Memory` 对应的个人 fork 中开发，不把产品源码补丁塞进根仓库。
- 开发前检查 fork、upstream、gitlink 和工作树状态；从个人 fork 创建独立 feature branch，并使用独立 Git worktree。不得在 detached HEAD 或共享脏工作树中开发。
- 每个问题先写可复现测试，再做最小修复；在 fork 中完成单元测试、类型检查、构建和必要的 Docker 验证。
- fork 变更按独立逻辑提交。根仓库只在 fork 结果通过后更新 gitlink、集成测试、ADR、运行记录和 SOP。
- 变更达到 PR-ready 后记录目标仓库、base、head SHA、验证结果和已知限制。只有负责人明确授权时才 push 或创建 PR；不得修改 remote 来绕过权限或流程。
- fork 代码保持可独立使用，不依赖根仓库的私有路径、secret、运行证据或本机状态。

## 临时模型凭证

- 不在聊天、提交、日志、测试快照或稳定 fingerprint 中记录 API key。
- 默认使用工作区外 secret 文件和真实 Paid Gate。
- 为本机短期演示，负责人可明确授权复用 Tencent 原生的 `submodules/TencentDB-Agent-Memory/deploy/global-images/.env`，分别填写 `PROXY_UPSTREAM_API_KEY` 和 `MEMORY_LLM_API_KEY`。
- 该 `.env` 仅是 Local-only Quick Test 输入：它虽被 Git 忽略，仍是宿主明文文件。根栈需要读取时优先通过 `--env-file` 和 Compose secrets 使用，不复制到新的根目录配置，不把值传给客户端。
- 测试完成并归档脱敏证据后，由负责人删除临时 `.env` 并轮换或撤销临时 key。未完成清理前，不得把结果标为企业部署可用。

## 新对话启动检查

1. 读取本文件、`CLAUDE.md`、`docs/enterprise-memory-system-evaluation.md` 和最新相关 reproduction report。
2. 检查根仓库、submodule、相关 worktree、Docker project 和宿主端口的当前状态。
3. 找出上述第一目标的下一项未完成 Gate，并先推进它。
4. 区分 `Static`、`Runtime Passed`、`User Confirmed`、`Failed`、`Blocked` 和 `Not Run`；不把历史成功或 health check 扩写成当前业务证明。
5. 任何 destructive cleanup、真实付费调用、push 或 PR 创建，仍按仓库既有授权规则执行。
