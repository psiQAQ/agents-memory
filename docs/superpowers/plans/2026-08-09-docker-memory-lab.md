# Docker-first 多客户端记忆系统与 DeepSeek 适配实施计划

**状态：** 已批准，执行中  
**根仓库基线：** `213de48c6ae58cb158465f054758ace8ce8b5464`  
**TencentDB fork 基线：** `c75ef5834eeacf17f2df8f84f7cf2d1747822de2`

## Goal

在私有根仓库建立默认无付费、可显式切换到真实 DeepSeek 的 Docker Compose 多客户端记忆实验平台；在 public fork 中只保留可独立验证的 Claude Code / DeepSeek 通用修复，并形成面向开发者和管理者的持续评估证据。

## Global Constraints

- 不 push、不创建 PR、不删除 Codex turn-diff refs、不运行 Git GC。
- 不初始化 TencentDB 之外的其他 submodule，`.gitmodules` 中的参考 URL 全部保留。
- 不创建 `.bat`；宿主入口只使用文档化的 `docker compose` 命令。
- 默认 Compose 只能访问确定性 Mock；真实 DeepSeek 必须显式加载 `compose.real.yaml`、`real-claude` profile 和付费 Gate。
- DeepSeek key 不得出现在 Git 跟踪文件、Claude 客户端、Compose 展开结果、日志或实验报告中。
- 当前旧 key 不得调用；用户撤销并提供工作区外新 secret 文件后才能执行真实 LLM Gate。
- Claude 客户端通过 MemoryProxy 认证，使用的是 Memory 用户 key，不是 DeepSeek key。
- Proxy 上游使用 `https://api.deepseek.com/anthropic/v1` 和 `deepseek-v4-pro[1m]`；Core/Knowledge 使用 OpenAI-compatible `https://api.deepseek.com` 和 `deepseek-v4-flash`。
- 当前 standalone 基线不增加 PostgreSQL、独立 vector-db 或 Core Redis；Redis 只作为 Proxy 可选 profile。
- 新脚本和行为修复遵循 TDD；纯 YAML/Markdown 通过解析、构建和链接检查验证。
- 用户可读文档首次出现非程序员术语时用 `> **术语**：解释`，架构/流程用 Mermaid，并在图后附非技术说明。

## Task 1: 安全与文档基线

**Files:** 根 `.gitignore`、`.gitattributes`、Claude 脱敏模板、README、CLAUDE.md、规格/决策/企业评估文档。

1. 忽略 `.worktrees/`、`.claude/settings.json`、`.secrets/`、`.runtime/`、Claude homes、原始日志和本地 env；允许跟踪显式 template/example。
2. 增加 LF 规则，覆盖 Shell、dotenv、YAML、JSON 和 Markdown；不改变 fork 已有 CRLF/LF 修复。
3. 从现有 settings 的非敏感字段形成模板，删除所有真实 token；模板保留 DeepSeek 模型映射、中文、权限、TUI、关闭自动更新和非必要流量。
4. 创建 Docker-first 规格、决策记录和 `docs/enterprise-memory-system-evaluation.md` 初版；状态必须如实为 Static/Not Run，不声称 Docker 业务流已通过。
5. README 增加主评估入口并修正过时的 Windows Codex/WSL 当前执行顺序；CLAUDE.md 增加同 commit 更新规则。
6. 记录脱敏安全事件 `SEC-LOCAL-001`，不写 key、长度或 blob 内容。

**Verify:** JSON 可解析；Git status 不显示本地 secret；`git check-ignore` 命中敏感路径；Markdown 链接目标存在；`git diff --check` 通过。

## Task 2: TDD 实现集成测试工具

**Files:** `tests/integration/tools/`、`tests/integration/test/` 与最小 package manifest。

1. 先写失败测试，再实现 Node 22 标准库 Mock：同时提供 OpenAI `/chat/completions`、Anthropic `/v1/messages`、streaming、`count_tokens`、tool/thinking fixture、可控 4xx/5xx/timeout；默认绝不访问外网。
2. 先写失败测试，再实现 Claude settings renderer：将模板渲染到目标 `CLAUDE_CONFIG_DIR`，拒绝空占位符和任何 DeepSeek key，按 Windows/Docker 目标写入正确 MemoryProxy URL。
3. 先写失败测试，再实现真实 profile Gate：校验 `RUN_PAID_LLM=1`、secret 文件、预算、turn 上限、run ID 和 evidence 目录；输出只包含状态，不输出 secret。
4. 先写失败测试，再实现 bootstrap/test-runner 的最小 CLI 接口和脱敏 run manifest；运行期 ID 从 API 返回值捕获，display name 不充当 ID。
5. 不增加第三方 runtime 依赖；使用 Node 内建 `http`、`fetch`、`fs`、`node:test`。

**Verify:** 每项记录 RED 失败原因与 GREEN 输出；全套 `node --test` 通过；secret 变体和错误输入均 fail-closed。

## Task 3: Claude 镜像与三层 Compose

**Files:** `tests/integration/images/`、`compose.yaml`、`compose.hardened.yaml`、`compose.real.yaml`、非敏感配置模板。

1. Claude 镜像基于 `node:22-bookworm-slim`，npm registry 默认为 `https://registry.npmmirror.com`，固定安装 `@anthropic-ai/claude-code@2.1.207`，非 root，Compose `init: true`。
2. 基础 Compose 从当前 fork 源码构建 Core、Hub、Proxy；同时定义 Mock、config-init、bootstrap、test-runner、Claude agent 模板和可选 Redis。
3. 默认服务只连接 Mock。基础层保留 Tencent standalone 的 SQLite/Core/Hub/Proxy 语义；hardened 层增加 Proxy volume 与 loopback 最小端口暴露。
4. real 层通过工作区外 `DEEPSEEK_SECRET_FILE` 注入同一 key 给 Proxy/Core/Knowledge 服务端，客户端只拿 Memory 用户 key。
5. `docker compose up` 不得隐式启用真实 profile；任何真实服务缺 Gate 时立即退出。
6. 不挂 Docker socket，不挂用户真实 `~/.claude`，Agent workspace 使用隔离 volume。

**Verify:** 三个组合分别运行 `docker compose config --quiet`；脱敏后的 config 不包含 key；镜像构建可用时执行 build；不可用时记录具体 blocker。

## Task 4: Tencent public fork 的兼容性回归修复

**Files:** 仅 `submodules/TencentDB-Agent-Memory` 内通用源码与测试。

1. 在独立 fork 分支工作，以现有 `c75ef58` 为基线。
2. 对以下每项先定位现有测试和真实调用路径；只有能写出失败回归测试的项才改源码：
   - Proxy 拼接 DeepSeek Anthropic `/v1/messages` 的路径契约。
   - Claude setup 的认证 header 与 Proxy 入口契约。
   - `x-claude-code-session-id` 诊断提取。
   - Team/Agent/Task/session 内部 headers 不向上游泄漏。
   - 同 session 冲突身份 fail-closed。
   - streaming、thinking、tool use 与 `count_tokens` 兼容性。
3. 每个独立问题形成独立 commit；不混入 Compose 私有编排和未复现重构。

**Verify:** 每个修复展示 RED/GREEN；运行受影响 package 的完整测试、类型检查和构建；fork worktree clean 后更新根 gitlink。

## Task 5: 无付费 Docker 验证与证据

**Files:** `.runtime/runs/<run-id>/`（不跟踪）、`docs/reproduction/<run-id>.md`（脱敏）。

1. 验证 Docker client/server、context、Compose、`hello-world` 与 registry；记录版本和限制。
2. 构建镜像并启动默认 Mock standalone；执行业务 auth/metadata/session/memory/Panel/Knowledge 探针，不只看 health。
3. 执行 Mock 契约、A 写 B 读 fixture、未绑定隔离、Proxy/Core/Hub/Redis 故障与 volume 行为中当前可自动化的场景。
4. 不使用旧 DeepSeek key；若新 key 尚未提供，真实 Gate 保持 Blocked/Not Run。
5. 证据包含 SHA、digest、命令、退出码、时间、环境、预期/实际、脱敏检查和不能证明的内容。

**Verify:** 默认启动日志不存在 DeepSeek 域名请求；测试 runner exit 0；清理只针对本次 Compose project，不执行全局 prune。

## Task 6: 企业评估、总体验证与提交

1. 更新企业评估的管理层摘要、Mermaid、状态矩阵、证据索引、风险、评分和未来方向；不足 10 组成对任务时效率保持 `Not Rated`。
2. 明确 DeepSeek Anthropic 已知不兼容内容类型、统一费用硬上限缺失、Win11/LAN/Codex 未验证、public commit 未推送等限制。
3. 运行所有测试、Compose config/build/runtime 可行项、JSON/YAML/Markdown、secret、EOL、Git diff/status 检查。
4. 对根仓库和 fork 分别进行全分支审查；修复 load-bearing finding。
5. 一个逻辑阶段一个 commit；不 push、不建 PR。

**Verify:** 根仓库与 fork status 清晰；所有 Passed/Failed/Not Run 均有新鲜命令证据；README 主入口有效；最终报告列出未解决问题。
