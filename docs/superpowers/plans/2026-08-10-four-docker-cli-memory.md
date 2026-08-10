# TencentDB Agent Memory 四 Docker CLI 共享记忆实施计划

> 本计划把仓库当前目标从 Legacy Windows + Claude 阶段迁移为 Claude Code、OpenCode、Pi、Codex 四个独立 Docker CLI 的共享记忆实验。实施以测试先行、精确源码 SHA、不可变运行证据和本地优先为原则。

## Global Constraints

- Tencent 产品基线固定为 upstream 默认全栈分支 `feat/server_team`；当前已核验 SHA 为 `0a568c328ea1aae3f22ed3656e7900da7ea565c1`。若实施时 upstream HEAD 前移，先审查增量，不盲目更新。
- 根仓库只承担跨仓库 Compose 编排、客户端容器、身份 bootstrap、证据 Gate、SOP 与企业评估；产品缺陷和原生适配在 Tencent fork 独立 branch/worktree 中修复。
- 不批量移植 Legacy `69fd8b3` 的 27 个提交。只有新基线上的可复现阻塞才能通过 RED→GREEN 最小修复重新引入。
- 四个 CLI 必须分别使用不同的 Memory user、Agent、Session、user key、home、workspace 和 evidence；只共享同一 Team、Task 与显式 team-visible memory。
- 不允许 OpenCode、Pi、Codex 冒充 `claude-code`、`openai` 或其他平台身份。
- Stage 1 使用 Anthropic Messages：`claude-code`、`opencode`、`pi`；Stage 2 为 Codex 增加 `/codex/<space>/v1/responses`。
- 主对话只由 Proxy 持有 DeepSeek Pro key；记忆提炼只由 Core/Hub 持有 DeepSeek Flash key；客户端只持有自己的 Memory user key。
- Tencent 原生 ignored `.env` 仅作为 Local-only 输入。任何 key 不得进入聊天、提交、日志、测试快照、稳定 fingerprint、客户端镜像或脱敏证据。
- 任何真实 API 调用都必须在完整 Mock Gate 后，最多 6 个 Pro turn、3 次 Flash 提炼、总预算 1 美元；任一上限先到即停。
- 失败项目保留供诊断；不执行模糊清理、`down -v`、prune、push、Issue 评论或 PR，除非负责人后续明确授权。
- 旧 specs/plans/ADR/reproduction 保持不可变并标为 Legacy；当前状态只由 active 入口文档和新 reproduction 更新。
- 每项行为变更严格 TDD；每个任务独立提交、独立 spec/quality review，最终执行全分支复审。

## Task 1：历史保全、upstream gitlink 与 active 文档基线

- 核对 legacy branch `codex/legacy-proxy-hardening-69fd8b` 精确指向 `69fd8b31e3fd4362af6c65407b92b26dfabebd0c`。
- 根 branch 使用 Tencent gitlink `0a568c328ea1aae3f22ed3656e7900da7ea565c1`。
- 重写 `CLAUDE.md`、根 README、`docs/README.md`、企业评估和集成 README 的 active 目标、状态与下一 Gate。
- 保留所有旧证据原文，在索引中归档为 Legacy Windows + Claude 阶段。
- 新增架构 ADR、baseline reproduction，并记录四 CLI 版本：Claude `2.1.226`、Codex `0.147.0`、OpenCode `1.18.16`、Pi `0.84.1`。
- 验证根 Legacy Node suite、Markdown links、UTF-8/LF、secret shape、gitlink 和两个工作树状态。

## Task 2：pristine upstream source-build Gate

- 从精确 upstream SHA 分别构建 Core、Proxy、Hub，不使用浮动产品镜像。
- 先记录每个 build 的 RED/Passed 证据；不得预先移植 legacy 修复。
- 若 Proxy `packages/cost-guard`、Shell LF 或 Hub combined context 阻塞，添加最小复现测试后在正确仓库修复：产品 Dockerfile/源码缺陷进入 fork，纯跨仓库 Compose context 留在根集成层。
- 固定 build image ID/digest，并验证运行镜像中的 native SQLite/必要 runtime asset。

## Task 3：Claude、OpenCode、Pi 原生平台路由

- 在 fork 中先写真实 handler/route RED，证明 `opencode`、`pi` 不能靠未知 prefix 或伪装通过。
- 增加最小平台注册、source/session 校验和 Anthropic Messages 路由；保留 `claude-code` 回归。
- 请求路径固定为：
  - `/claude-code/<space>/v1/messages`
  - `/opencode/<space>/v1/messages`
  - `/pi/<space>/v1/messages`
- 缺失、格式非法、合法但未绑定的 source 分别 fail closed；不放宽认证或 ACL。
- 完成 Proxy focused/full tests、typecheck 基线与 Docker build。

## Task 4：三客户端 Compose、清单与身份 bootstrap

- 建立 base Compose 及 `mock`、`real`、`claude`、`opencode`、`pi`、`management` profiles/overlays。
- 固定三个 CLI 镜像版本，不使用 `latest`；每个镜像非 root、独立 home/workspace、无模型 key。
- 新增无 secret 客户端清单，由 `ACTIVE_CLIENTS=claude,opencode,pi` 选择；bootstrap 迭代清单创建三个用户、Agent、Session、同一 Team/Task。
- 三个 owner 分别把自己的 Chat Memory 设为 team-visible，并给另外两个 Agent 建立 fixed binding。
- 创建不属于共享 Team 的 synthetic outsider，只用于 ACL/注入负测，不构建第四个 CLI。
- OpenCode 使用官方 Anthropic provider 自定义 baseURL；Pi 使用 `anthropic-messages` custom model；三者都向 Proxy 提供自己的 Memory key 和显式 identity headers。

## Task 5：Stage 1 Mock、管理与客户端 Gate

- Mock 支持三种真实 source 的 Anthropic text/stream/tool/count/error，并只保存脱敏观察值。
- 完成三写六读，逐项验证 source owner、Team、Agent、Task 与 marker 命中；不能只检查自然语言回复。
- outsider 对 `asset/list-accessible`、ACL check、binding 和 Proxy injection 均 denied/empty，且没有模型副作用。
- 验证三个客户端没有共享 writable home/workspace；只允许相同只读 seed fixture。
- 管理 API 强制验证 users、Team、members、Agents、Task、asset scope、bindings、ACL；Panel 仅发布 `127.0.0.1`，Knowledge 不发布宿主端口。
- 三个 headless Gate 通过后，分别启动三个 TUI，由用户确认界面、输入和共享召回。

## Task 6：双 key host-only 启动与限额真实 Stage 1

- host-only 启动器只解析固定 Tencent `.env` 的七项 allowlist，不回显值，不接受 CLI key 参数，不写新的 key 配置文件。
- 使用 environment-backed Compose secrets，将 Pro key 只挂给 Proxy，将 Flash key 只挂给 Core/Hub；Compose config、inspect 和 Mock 观察均不得出现 key。
- 非 key 值严格验证：Flash `https://api.deepseek.com/v1`、`deepseek-v4-flash`、`openai`；Pro `https://api.deepseek.com/anthropic/v1`、`deepseek-v4-pro[1m]`。
- Paid Gate 校验唯一 run/project/evidence、普通 host path、预算、turn/提炼上限和 fresh attestation。
- 在完整 Mock 通过后执行三次写入、三次合并召回和必要 Flash 提炼；证据只保存状态、计数、owner 匹配与 latency。

## Task 7：Codex Responses 契约与 fork adapter

- 固定 Codex `0.147.0`，用本地 deterministic fixture 记录其 Responses request/SSE 事件契约，不调用真实 OpenAI。
- 在 fork 新增 `/codex/<space>/v1/responses`，先覆盖 text、stream、tool、usage、errors 和 unsupported-field fail-closed。
- 把已观察到的最小 Responses 输入转换为 DeepSeek Anthropic Messages，再把返回转换为 Codex 所需 Responses 事件；未知字段不得静默丢弃。
- Codex provider 只写入容器私有用户级 `config.toml`，不依赖项目 `.codex/config.toml` 覆盖 provider。
- 保持认证、session identity、header hygiene、L0 写入和 upstream credential replacement 与现有 handler 一致。

## Task 8：四方 binding 上限与四写十二读

- 先用第四个 Agent 导入三份外部 Chat Memory 写 RED，证明上游 hard-coded 2 的限制。
- 在 Panel backend、web 与 Proxy 注入层增加同一项可配置上限：默认 2，实验设 3；覆盖非法值和默认回归。
- `ACTIVE_CLIENTS=claude,opencode,pi,codex` 时创建四个独立身份，完成四写十二读和 outsider isolation。
- 完成四个 headless、四个 TUI、Mock hygiene 和限额真实 smoke；自然语言回复不能单独作为通过证据。

## Task 9：收尾、运行证据与贡献准备

- Fresh 运行根 Node tests、fork tests/typecheck/build、Compose config matrix、Docker source builds、Bash syntax、EOL/BOM、links、secret scan、gitlink/worktree clean checks。
- 对 Stage 0、Stage 1、Stage 2 每次失败/通过写不可变 reproduction，并同步企业评估和 SOP。
- 最终全分支独立 review 清零 Critical/Important；处理或明确记录 Minor。
- 演示完成后精确清理本次 project/volumes；由负责人删除 Tencent `.env` 并轮换 key。
- 仅准备本地 PR 资料：OpenCode、Pi 独立中英双语，Codex Responses、binding 上限和安全修复按问题拆分；不 push、不创建 PR。
