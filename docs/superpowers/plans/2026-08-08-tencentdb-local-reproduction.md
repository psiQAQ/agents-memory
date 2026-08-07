# TencentDB Agent Memory Local Reproduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用包含 Windows LF 修复的 TencentDB fork 部署服务，并验证 Windows 原生 Claude Code 与 Docker 内 Claude Code 的共享记忆闭环。

**Architecture:** 使用 `deploy/global-images` 在一套 Docker 环境中运行 MemoryCore、Memory Hub/Knowledge 和 MemoryProxy。Windows Claude Code 通过宿主机端口连接 Proxy，Docker Claude Code 通过 `tdai-memory-stack` 内部网络连接同一个 Proxy，但绑定不同 Agent。

**Tech Stack:** Windows 10 专业版 10.0.19045、PowerShell、WSL 2 backend、Docker Desktop、Bash、Claude Code 2.1.207、TencentDB Agent Memory `c75ef58`。

## Global Constraints

- 用户确认 Windows Claude Code 启动正确前，禁止启动 Docker 服务或修改 Claude 配置。
- Docker Desktop 的下载、安装、协议确认、系统功能启用和重启均由用户执行。
- 密钥仅保存在已忽略的 `.env`、`.admin-key` 或当前进程环境变量中。
- 不读取或输出现有 `~/.claude/settings.json` 的值。
- 测试以 fork `c75ef58` 为最低基线；出现其他兼容问题时先记录证据，不顺带修改源码。
- 本计划不包含 WSL Claude、Codex、Windows 11 或局域网接入。

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

### Task 2: 用户安装并确认 Docker Desktop

**Files:** None.

**Consumes:** Task 1 的用户确认。

**Produces:** Windows PowerShell 与 Ubuntu-24.04 均连接同一个 Docker Desktop Linux daemon。

- [ ] **Step 1: 用户检查 WSL 与系统前置条件**

Run:

```powershell
wsl.exe --list --verbose
wsl.exe --version
```

Expected: Windows 为 10 专业版 22H2 build 19045，WSL ≥ 2.1.5，Ubuntu-24.04 为 WSL 2。若仍为 `0x800705aa`，用户先重启 Windows 并复查；Agent 不代替用户重启或启用系统功能。

- [ ] **Step 2: 用户安装并启动 Docker Desktop**

用户从 [Docker 官方 Windows 安装页](https://docs.docker.com/desktop/setup/install/windows-install/) 下载 x86_64 per-user installer，选择 WSL 2 backend、Linux containers，并在首次启动时接受适用的许可条款。随后在 Docker Desktop 的 `Settings → Resources → WSL Integration` 中启用 `Ubuntu-24.04`。

- [ ] **Step 3: 验证 Windows Docker daemon**

Run in PowerShell:

```powershell
docker version
docker context show
docker run --rm hello-world
```

Expected: `docker version` 同时显示 client/server，context 指向 Docker Desktop，`hello-world` exit `0`。

- [ ] **Step 4: 验证 WSL 使用同一个 daemon**

Run in PowerShell:

```powershell
wsl.exe -d Ubuntu-24.04 -- bash -lc 'docker version && docker context show'
```

Expected: WSL 也能看到 Docker Desktop server；不得在 Ubuntu 内另装第二套 Docker Engine。

- [ ] **Step 5: 确认 LF 修复和秘密文件边界**

Run:

```powershell
Set-Location D:\workspace\refine-memory\submodules\TencentDB-Agent-Memory
git rev-parse --short HEAD
git ls-files --eol deploy/global-images/_lib.sh deploy/global-images/.env.example
git check-ignore -v deploy/global-images/.env deploy/global-images/.admin-key
```

Expected: HEAD 至少包含 `c75ef58`；两个文件均显示 `i/lf w/lf attr/text eol=lf`；秘密文件都匹配 `.gitignore`。

---

### Task 3: 配置并启动 LF 修复版 TencentDB 服务

**Files:**

- Create locally, ignored: `submodules/TencentDB-Agent-Memory/deploy/global-images/.env`
- Generated locally, ignored: `submodules/TencentDB-Agent-Memory/deploy/global-images/.admin-key`

**Consumes:** 可用的 WSL、Docker Desktop、fork `c75ef58` 和用户提供的 LLM 配置。

**Produces:** 四个可从 Windows 访问的服务端口，以及 Docker 内部网络中的 `proxy` 服务。

- [ ] **Step 1: 在 WSL 创建本地配置**

Run:

```bash
cd /mnt/d/workspace/refine-memory/submodules/TencentDB-Agent-Memory/deploy/global-images
cp .env.example .env
if grep -q $'\r' .env; then printf '.env must use LF\n' >&2; exit 1; fi
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

- [ ] **Step 5: 从 Windows 验证端口与容器健康状态**

Run in PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8420/health
Invoke-RestMethod http://127.0.0.1:8424/health
Invoke-WebRequest http://127.0.0.1:8125/ -UseBasicParsing
Invoke-RestMethod http://127.0.0.1:8096/health
docker inspect --format '{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' tdai-memory-core tdai-memory-hub tdai-proxy
```

Expected: Windows 请求成功，三个容器均为 `running`，带 healthcheck 的容器为 `healthy`。Docker Claude 对 `proxy:8096` 的内部访问在 Task 4 实际验证。

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
Agent: docker-claude
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

- [ ] **Step 4: 用户在持久化 Docker home 中安装固定版本 Claude Code**

Run in WSL:

```bash
docker volume create refine-memory-claude-home
docker run --rm --user node \
  -v refine-memory-claude-home:/home/node \
  node:22-bookworm-slim \
  bash -lc 'npm config set prefix /home/node/.local && npm install -g @anthropic-ai/claude-code@2.1.207 && /home/node/.local/bin/claude --version'
```

Expected: 安装完成并输出 `2.1.207 (Claude Code)`；安装与 `~/.claude` 状态保存在独立 named volume，不与 Windows 配置目录共享。

- [ ] **Step 5: Docker Claude Code 交互式接入 Proxy**

Run in WSL after exporting the normal-user key and configured model in that terminal:

```bash
cd /mnt/d/workspace/refine-memory
: "${ANTHROPIC_AUTH_TOKEN:?export ANTHROPIC_AUTH_TOKEN to the normal-user key first}"
: "${PROXY_UPSTREAM_MODEL:?export PROXY_UPSTREAM_MODEL to the model configured in .env first}"
docker run --rm -it --name refine-memory-claude \
  --network tdai-memory-stack \
  --user node \
  -v refine-memory-claude-home:/home/node \
  -v /mnt/d/workspace/refine-memory:/workspace:ro \
  -w /workspace \
  -e ANTHROPIC_BASE_URL=http://proxy:8096/claude-code/default \
  -e ANTHROPIC_AUTH_TOKEN \
  -e PROXY_UPSTREAM_MODEL \
  -e DISABLE_AUTOUPDATER=1 \
  node:22-bookworm-slim \
  bash -lc 'exec /home/node/.local/bin/claude --model "$PROXY_UPSTREAM_MODEL"'
```

Expected: 选择 `docker-claude` 与同一 Task，能够使用权限允许的 Windows 侧共享资产，并产生 `DOCKER_FACT_20260808`。退出后容器删除，但独立 home volume 保留。

- [ ] **Step 6: 验证反向读取与持久化**

重新启动一个 Windows Claude Code 会话，验证允许共享的 `DOCKER_FACT_20260808`。随后运行：

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
windows_claude_version, docker_claude_version
windows_version, wsl_backend_version, docker_version
image_name, image_digest
command, exit_code, observed_result
windows_claude_result, docker_claude_result
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
