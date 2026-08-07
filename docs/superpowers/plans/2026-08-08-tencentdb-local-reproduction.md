# TencentDB Agent Memory Local Reproduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 原样部署 TencentDB Agent Memory，并验证 Windows Claude Code 与 WSL Claude Code 的共享记忆闭环。

**Architecture:** 使用 `deploy/global-images` 在一套 Docker 环境中运行 MemoryCore、Memory Hub/Knowledge 和 MemoryProxy。两个 Claude Code 客户端连接同一个 Proxy，但绑定不同 Agent；执行过程只新增一份脱敏复现报告，不修改 TencentDB 源码。

**Tech Stack:** Windows 10 专业版 10.0.19045、PowerShell、WSL 2 Ubuntu 24.04、Docker、Bash、Claude Code 2.1.207、TencentDB Agent Memory `fe3230f`。

## Global Constraints

- 用户确认 Windows Claude Code 启动正确前，禁止启动 Docker 服务或修改 Claude 配置。
- 安装 Docker、修改依赖、重启 Windows/WSL 服务必须由用户确认。
- 密钥仅保存在已忽略的 `.env`、`.admin-key` 或当前进程环境变量中。
- 不读取或输出现有 `~/.claude/settings.json` 的值。
- 不修改 TencentDB fork 源码；出现兼容问题时先记录证据并停止。
- 本计划不包含 Codex 接入。

---

### Task 1: 用户确认 Windows Claude Code 启动入口

**Files:** None.

**Produces:** 一个经用户确认的 Windows Claude Code 交互式启动命令。

- [ ] **Step 1: 确认版本与入口**

Run:

```powershell
& "$env:APPDATA\npm\claude.cmd" --version
```

Expected: `2.1.207 (Claude Code)`。

- [ ] **Step 2: 从仓库根目录启动原版交互会话**

由用户在自己的 PowerShell 窗口运行：

```powershell
Set-Location D:\workspace\refine-memory
& "$env:APPDATA\npm\claude.cmd"
```

Expected: Claude Code 进入交互界面，当前目录为 `D:\workspace\refine-memory`，能读取根目录 `CLAUDE.md`，未连接 TencentDB Proxy。

- [ ] **Step 3: 用户退出并确认**

用户使用 `/exit` 或 `Ctrl+C` 退出，并明确回复启动是否正确。未确认前停止执行本计划。

---

### Task 2: 恢复 WSL 与 Docker 前置条件

**Files:** None.

**Consumes:** Task 1 的用户确认。

**Produces:** 可运行 Bash 和 Docker 的 WSL 环境；若需要安装或重启则停在用户授权点。

- [ ] **Step 1: 复查 WSL 状态**

Run:

```powershell
wsl.exe --list --verbose
wsl.exe -d Ubuntu-24.04 -- bash -lc 'printf "WSL_OK\n"'
```

Expected: 第二条输出 `WSL_OK`。若仍为 `0x800705aa`，记录 `net helpmsg 1450` 的结果并停止，请用户释放系统资源或重启后再试。

- [ ] **Step 2: 定位 WSL Claude Code**

Run:

```powershell
wsl.exe -d Ubuntu-24.04 -- bash -lc 'command -v claude && claude --version'
```

Expected: 输出 WSL 内独立的 `claude` 路径和版本。若未安装，停止并请求用户确认安装方式。

- [ ] **Step 3: 检查 Docker**

Run:

```powershell
docker version
```

Expected: 同时显示 client 与 server。当前快照中 Docker 未安装；若状态未变化，停止并请求用户确认安装 Docker Desktop 或指定已有 Docker host。

- [ ] **Step 4: 确认秘密文件不会入库**

Run:

```powershell
Set-Location D:\workspace\refine-memory\submodules\TencentDB-Agent-Memory
git check-ignore -v deploy/global-images/.env deploy/global-images/.admin-key
```

Expected: 两个路径都匹配 `.gitignore`。

---

### Task 3: 配置并原样启动 TencentDB 服务

**Files:**

- Create locally, ignored: `submodules/TencentDB-Agent-Memory/deploy/global-images/.env`
- Generated locally, ignored: `submodules/TencentDB-Agent-Memory/deploy/global-images/.admin-key`

**Consumes:** 可用的 WSL、Docker 和用户提供的 LLM 配置。

**Produces:** 四个可从 Windows 与 WSL 访问的服务端口。

- [ ] **Step 1: 在 WSL 创建本地配置**

Run:

```bash
cd /mnt/d/workspace/refine-memory/submodules/TencentDB-Agent-Memory/deploy/global-images
cp .env.example .env
```

用户只在 `.env` 中填写以下字段，不在聊天或 Git 中粘贴值：

```text
MEMORY_LLM_BASE_URL
MEMORY_LLM_API_KEY
MEMORY_LLM_MODEL
MEMORY_LLM_PROTOCOL
PROXY_UPSTREAM_URL
PROXY_UPSTREAM_API_KEY
PROXY_UPSTREAM_MODEL
```

- [ ] **Step 2: 运行离线预检**

Run:

```bash
bash verify.sh --skip-llm
```

Expected: exit `0`；Docker、`.env`、必填字段和端口检查通过。

- [ ] **Step 3: 运行真实 LLM 通路预检**

Run:

```bash
bash verify.sh
```

Expected: exit `0`；memory 与 proxy 两组 LLM 通路通过。输出只记录状态码、协议与模型名，不记录 key。

- [ ] **Step 4: 启动服务**

Run:

```bash
bash start-all.sh
```

Expected: `tdai-memory-core`、`tdai-memory-hub`、`tdai-proxy` 均 healthy，并生成 `.admin-key`。

- [ ] **Step 5: 验证端口**

Run in WSL and Windows respectively:

```bash
curl -fsS http://127.0.0.1:8420/health
curl -fsS http://127.0.0.1:8424/health
curl -fsS -o /dev/null http://127.0.0.1:8125/
curl -fsS http://127.0.0.1:8096/health
```

Expected: 两侧访问均成功。若 Windows 或 WSL 只有一侧可达，记录地址与状态码后停止，不修改源码。

---

### Task 4: 建立试点身份并验证两个 Claude Code

**Files:** None.

**Consumes:** Task 3 的健康服务。

**Produces:** 两个独立 Agent 的会话、L0/pipeline 证据与双向共享结果。

- [ ] **Step 1: 在 Panel 建立固定身份**

打开 `http://127.0.0.1:8125`，用 `.admin-key` 登录后创建 normal user；再以 normal user 创建：

```text
Team:  refine-memory-lab
Agent: windows-claude
Agent: wsl-claude
Task:  phase0-cross-agent-smoke
```

Expected: normal user 的业务 key 只保存于本机安全位置，不写入仓库。

- [ ] **Step 2: Windows Claude Code 临时接入 Proxy**

在新的 PowerShell 窗口设置当前进程环境变量：

```powershell
Set-Location D:\workspace\refine-memory
$env:ANTHROPIC_BASE_URL = 'http://127.0.0.1:8096/claude-code/default'
if (-not $env:ANTHROPIC_AUTH_TOKEN) { throw 'Set ANTHROPIC_AUTH_TOKEN to the normal-user key in this terminal first.' }
if (-not $env:PROXY_UPSTREAM_MODEL) { throw 'Set PROXY_UPSTREAM_MODEL to the model configured in .env first.' }
& "$env:APPDATA\npm\claude.cmd" --model $env:PROXY_UPSTREAM_MODEL
```

Expected: 首次会话依次选择 `refine-memory-lab`、`windows-claude`、`phase0-cross-agent-smoke`。完成无敏感信息的小任务并产生 `WINDOWS_FACT_20260808`。

- [ ] **Step 3: 验证 L0 与 pipeline**

Run:

```bash
curl -fsS http://127.0.0.1:8420/health
```

Expected: Panel 中可见对应 L0；health 的 pipeline worker 至少出现一次完成事件。若后台尚未处理，保留时间戳并等待现有异步流程，不手工改数据库。

- [ ] **Step 4: WSL Claude Code 临时接入 Proxy**

Run in WSL:

```bash
cd /mnt/d/workspace/refine-memory
export ANTHROPIC_BASE_URL=http://127.0.0.1:8096/claude-code/default
: "${ANTHROPIC_AUTH_TOKEN:?export ANTHROPIC_AUTH_TOKEN to the normal-user key first}"
: "${PROXY_UPSTREAM_MODEL:?export PROXY_UPSTREAM_MODEL to the model configured in .env first}"
claude --model "$PROXY_UPSTREAM_MODEL"
```

Expected: 选择 `wsl-claude` 与同一 Task，能够使用权限允许的 Windows 侧共享资产，并产生 `WSL_FACT_20260808`。

- [ ] **Step 5: 验证反向读取与持久化**

重新启动一个 Windows Claude Code 会话，验证允许共享的 `WSL_FACT_20260808`。随后运行：

```bash
cd /mnt/d/workspace/refine-memory/submodules/TencentDB-Agent-Memory/deploy/global-images
bash stop-all.sh
bash start-all.sh
```

Expected: 重启后两个标记及其来源归属仍可验证。

---

### Task 5: 写入脱敏复现报告并提交

**Files:**

- Create: `docs/reproduction/2026-08-08-tencentdb-local-baseline.md`

**Consumes:** Tasks 1–4 的真实输出。

**Produces:** 可复核的 Phase 0 结论与下一阶段输入。

- [ ] **Step 1: 写入事实表**

报告记录以下字段：

```text
root_sha, submodule_sha
windows_claude_version, wsl_claude_version
wsl_distribution, docker_version
image_name, image_digest
command, exit_code, observed_result
windows_claude_result, wsl_claude_result
l0_result, pipeline_result, restart_result
known_failures, sanitized_error
```

- [ ] **Step 2: 扫描敏感值与本地链接**

Run:

```powershell
git diff --check
rg -l -i -- 'AKID[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----' docs/reproduction
```

Expected: `git diff --check` exit `0`；`rg` 无输出并 exit `1`（未找到敏感值）。

- [ ] **Step 3: 确认 submodule 源码未改**

Run:

```powershell
git -C submodules/TencentDB-Agent-Memory status --short
git status --short
```

Expected: submodule 无输出；根仓库只出现复现报告。

- [ ] **Step 4: 提交报告**

Run:

```powershell
git add docs/reproduction/2026-08-08-tencentdb-local-baseline.md
git commit -m "docs: record TencentDB local reproduction baseline"
```

Expected: commit 成功；不 push。
