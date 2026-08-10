# Windows Loopback Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Windows 10 宿主上的 Claude Code 通过 `127.0.0.1:8096` 访问仍处于 Docker internal 网络中的 MemoryProxy，并用确定性 Mock 完成真实 headless 往返、记忆写入与泄漏检查。

**Architecture:** hardened Compose 不再直接发布 MemoryProxy 端口，而是增加一个复用 integration-tools 镜像的 `loopback-gateway`。Gateway 同时加入 internal `default` 网络与非 internal `loopback-ingress` 网络，只把宿主 loopback TCP 字节流转发到固定目标 `memory-proxy:8096`；它不解析 HTTP、不持久化 secret 或业务数据。Windows config-init 前必须先由宿主 HTTP Gate 证明 Gateway 可达。

**Tech Stack:** Docker Compose 5、Node.js 22 `node:net`/`node:test`、PowerShell、Claude Code `2.1.207`、现有 TencentDB-Agent-Memory fork `69fd8b3`。

## Global Constraints

- 不修改 public fork、不安装依赖、不新增镜像、不访问真实 DeepSeek。
- 不读取或覆盖用户全局 `.claude/settings.json`；Windows Claude 只使用 run-specific、仓库外 `CLAUDE_CONFIG_DIR`。
- 不 push、不修改 remote、不删除或 prune 任何现有容器卷。
- 保留既有成功项目 `mem-it-20260810-033636` 与失败 Windows 项目 `mem-win-20260810-093140-a664249f`；runtime 修复必须创建唯一新 project/run。
- 所有新 JavaScript、YAML、Markdown 保持 UTF-8 无 BOM、LF；敏感值不得进入测试输出、diff、日志或跟踪报告。
- 每项行为修改都先运行能证明缺口的 RED 测试，再写最小实现并取得 GREEN；完成声明前运行 fresh verification。
- Gateway 的 `loopback-ingress` 会给 Gateway 自身提供非 internal 网络出口，这是已知剩余风险；不得将本机 Mock 通过外推为企业安全通过。

---

## Task 1: 用 TDD 实现最小 TCP 转发器

**Files:**

- Create: `tests/integration/test/tcp-forward.test.mjs`
- Create: `tests/integration/tools/tcp-forward.mjs`
- Reuse: `tests/integration/tools/runtime-lib.mjs`

- [ ] 1.1 在 `tcp-forward.test.mjs` 先写配置解析测试：只接受监听主机 `0.0.0.0`、目标主机 `memory-proxy`、十进制 `1..65535` 端口；空值、控制字符、空白、替代 host 和越界端口都必须 fail-closed，错误文本不得回显输入。

- [ ] 1.2 写真实 TCP 行为测试：启动本地 echo upstream，经 Gateway 双向传输二进制 payload；分别验证客户端主动断开、已连接 upstream 主动 close/error、初始 upstream 不可达时成对 socket 都被关闭，且进程不选择其他目标。

  再用真实 CLI 覆盖合法 ready、端口已占用和非法配置：ready stdout 必须精确为固定 JSON；失败必须非零退出且 stderr 为固定文本，输入 sentinel、host、port 与底层异常对象均不得出现。

- [ ] 1.3 运行 RED：

  ```powershell
  node --test tests/integration/test/tcp-forward.test.mjs
  ```

  预期：模块不存在或缺少导出，测试失败；把准确失败原因写入 ignored task report。

- [ ] 1.4 用 `node:net` 实现最小 API；配置校验保留在 `listenTcpForwarder` 内部，不额外导出 parser、类、重试或日志抽象：

  ```js
  export function createTcpForwardServer({ targetHost, targetPort }) { /* paired sockets */ }
  export async function listenTcpForwarder(environment = process.env) { /* validated fixed topology */ }
  ```

  CLI 使用 `isMain(import.meta)`；ready 时只输出固定 `{"status":"ready"}`，配置/监听/连接失败只输出固定分类，不输出地址、payload、header、异常对象或派生 fingerprint。

- [ ] 1.5 运行 GREEN：

  ```powershell
  node --test tests/integration/test/tcp-forward.test.mjs
  ```

- [ ] 1.6 运行范围检查并提交：

  ```powershell
  git diff --check
  git ls-files --eol tests/integration/tools/tcp-forward.mjs tests/integration/test/tcp-forward.test.mjs
  git add -- tests/integration/tools/tcp-forward.mjs tests/integration/test/tcp-forward.test.mjs
  git commit -m "feat(integration): add fixed TCP loopback forwarder"
  ```

---

## Task 2: 用 Compose 契约锁定双网络 Gateway

**Files:**

- Modify: `tests/integration/test/compose-contract.test.mjs`
- Modify: `tests/integration/compose.hardened.yaml`
- Modify: `tests/integration/compose.windows.yaml`

- [ ] 2.1 先改 hardened 契约测试，要求：唯一发布端口的 service 是 `loopback-gateway`；MemoryProxy 没有 `ports` 且只连接 internal `default`；Gateway 同时连接 `default` 与 `loopback-ingress`，后者不是 internal。

- [ ] 2.2 在同一测试锁定 Gateway 最小权限：复用 `refine-memory-integration-tools:local`、命令是 `tools/tcp-forward.mjs`、固定目标 `memory-proxy:8096`、`user: 10001:10001`、`init: true`、`read_only: true`、`cap_drop: [ALL]`、`no-new-privileges:true`、无 volumes/secrets、仅绑定 `127.0.0.1:8096`，并等待 Proxy healthy。

  同时断言除 Gateway 外没有服务加入 `loopback-ingress`，避免把非 internal 网络意外扩散给持数据服务。

- [ ] 2.3 恢复并锁定 `compose.windows.yaml` 作为显式 Windows override：它必须定义 `windows-config-init`，并以 mapping 形式声明 `depends_on.loopback-gateway.condition: service_healthy`。在 `compose-contract.test.mjs` 中展开 Windows 组合并静态断言该 service、依赖和 condition；不得只依赖运行时启动顺序，也不得把 Gateway health gate 放到宿主脚本中替代 Compose 契约。

- [ ] 2.4 运行 RED：

  ```powershell
  node --test tests/integration/test/compose-contract.test.mjs
  ```

  预期：旧 hardened 层仍由 `memory-proxy` 发布端口且没有 Gateway，测试失败。

- [ ] 2.5 最小修改 `compose.hardened.yaml`：保留 Proxy data/log volumes，移除其 `ports`；新增 Gateway 与 `loopback-ingress`。恢复的 `compose.windows.yaml` 保持 Windows-only 配置；其中 `windows-config-init` 必须等待 `loopback-gateway` 的 `service_healthy`。Gateway 使用固定非凭证环境：

  ```yaml
  environment:
    FORWARD_LISTEN_HOST: 0.0.0.0
    FORWARD_LISTEN_PORT: "8096"
    FORWARD_TARGET_HOST: memory-proxy
    FORWARD_TARGET_PORT: "8096"
  ```

  healthcheck 只做本地 TCP connect，不调用 Proxy 业务 API；发布规则为 `127.0.0.1:8096:8096`。

- [ ] 2.6 运行 GREEN：

  ```powershell
  node --test tests/integration/test/compose-contract.test.mjs
  ```

- [ ] 2.7 展开四组 Compose，确保 base 不出现 Gateway、hardened/Windows 出现 Gateway、Windows `windows-config-init` 依赖 Gateway healthy、real 仍保持既有 secret/egress 边界：

  ```powershell
  $env:MEMORY_CORE_GATEWAY_API_KEY = 'static-lab-gateway-key'
  docker compose -f tests/integration/compose.yaml config --quiet
  docker compose -f tests/integration/compose.yaml -f tests/integration/compose.hardened.yaml config --quiet
  node --test tests/integration/test/compose-contract.test.mjs
  ```

  不执行裸的 Windows `docker compose ... config --quiet`：`compose-contract.test.mjs` 是 Windows 展开 Gate。它会在系统临时目录创建一次性 dummy secret、evidence、仓库外 Windows config 与 attestation，设置 `PROJECT_ROOT`、`WINDOWS_CLAUDE_CONFIG_DIR`、`WINDOWS_CONFIG_ATTESTATION_FILE`，用 `windows-config-gate.mjs` 生成 attestation，再调用 Compose JSON 展开 real/Windows 组合并在 `finally` 清理；不得手工替换为真实 key。测试 exit 0 才算四组均通过。

- [ ] 2.8 提交 Compose 阶段：

  ```powershell
  git diff --check
  git add -- tests/integration/compose.hardened.yaml tests/integration/compose.windows.yaml tests/integration/test/compose-contract.test.mjs
  git commit -m "fix(integration): publish Proxy through loopback gateway"
  ```

---

## Task 3: 同步操作文档、ADR 与失败运行证据

**Files:**

- Create: `docs/decisions/2026-08-10-windows-loopback-gateway.md`
- Create: `docs/reproduction/2026-08-10-windows-mock-20260810-093140-loopback-blocked.md`
- Modify: `tests/integration/README.md`
- Modify: `README.md`
- Modify: `docs/enterprise-memory-system-evaluation.md`

- [ ] 3.1 写 ADR：记录为何不让 MemoryProxy 直接加入普通 bridge、不使用宿主转发，以及 Gateway 非 internal 网络出口与明文瞬时流量的剩余风险；首次技术术语用相邻 `>` 解释。

- [ ] 3.2 把 `windows-mock-20260810-093140-a664249f` 写成不可变 Failed/Blocked 报告：两级 Gate 和 agent-config Passed；宿主 loopback Failed；Windows config/headless/TUI Not Run；DeepSeek 0。不得记录 token、key、nonce 原文或稳定 fingerprint。

- [ ] 3.3 更新 integration README：hardened 层只由 Gateway 发布 loopback；启动命令显式包含 Gateway；readiness 同时要求 Proxy/Gateway healthy；宿主探针必须使用：

  ```powershell
  curl.exe --noproxy '*' --fail --silent --show-error http://127.0.0.1:8096/health
  ```

  说明不能以 `docker port` 或容器 health 代替宿主 HTTP 证明，也不能用裸 `up --build` 启动不需要的 Hub。首次运行必须显式 `--build` 更新 tools image；固定宿主端口意味着同一时刻只能有一个 hardened/Windows project 占用 `127.0.0.1:8096`。

- [ ] 3.4 根 README 与企业评估只先记录 Static Integrated、Windows runtime Pending；把端口路径图改为 Windows Claude → Gateway → MemoryProxy，并保持评分 `No-Go`，直到 Task 4 取得新鲜运行证据。

- [ ] 3.5 运行完整静态 Gate：

  ```powershell
  node --test tests/integration/test/*.test.mjs
  git diff --check
  ```

  另检查全部变更文件 UTF-8 无 BOM、LF、Markdown 相对链接存在、常见 DeepSeek/Memory key 形态为 0、`.gitmodules` 的 8 个 URL 全部保留、submodule clean。

- [ ] 3.6 提交文档阶段：

  ```powershell
  git add -- README.md tests/integration/README.md docs/enterprise-memory-system-evaluation.md docs/decisions/2026-08-10-windows-loopback-gateway.md docs/reproduction/2026-08-10-windows-mock-20260810-093140-loopback-blocked.md
  git commit -m "docs: record Windows loopback gateway boundary"
  ```

---

## Task 4: 新建 Windows Mock project 并取得真实运行证据

**Files:**

- Create ignored at runtime: `.runtime/runs/$RUN_ID/windows-headless-probe.json`
- Create from the generated run ID: `docs/reproduction/$RUN_ID-windows-claude-mock-passed.md`
- Modify: `README.md`
- Modify: `tests/integration/README.md`
- Modify: `docs/enterprise-memory-system-evaluation.md`

- [ ] 4.1 预检 Docker Desktop client/server、`desktop-linux`、Compose，并确认既有成功/失败 projects 的 containers、networks、volumes 未被改变。为新 run 创建唯一 `RUN_ID`、`COMPOSE_PROJECT_NAME`、普通非 reparse evidence 目录和一次性非 LLM gateway token。

  ```powershell
  $dockerCli = (Get-Command docker -ErrorAction SilentlyContinue).Source
  if (-not $dockerCli) { $dockerCli = "$env:LOCALAPPDATA\Programs\DockerDesktop\resources\bin\docker.exe" }
  & $dockerCli version
  if ($LASTEXITCODE -ne 0) { throw 'Docker engine preflight failed' }
  $env:RUN_ID = 'windows-mock-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
  $env:COMPOSE_PROJECT_NAME = "mem-win-$env:RUN_ID"
  $env:MEMORY_SPACE_ID = 'default'
  $env:MEMORY_CORE_GATEWAY_API_KEY = 'lab-gateway-' + [guid]::NewGuid().ToString('N')
  $env:EVIDENCE_DIR = Join-Path (Resolve-Path -LiteralPath .).Path ".runtime\runs\$env:RUN_ID"
  [IO.Directory]::CreateDirectory($env:EVIDENCE_DIR) | Out-Null
  if ((Get-Item -LiteralPath $env:EVIDENCE_DIR).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'EVIDENCE_DIR must be a normal directory' }
  ```

- [ ] 4.2 只 fresh build integration-tools（包含转发器），不 `--pull`；启动最小服务：`mock-llm config-init memory-core memory-proxy bootstrap loopback-gateway`。不得启动 Hub、Redis、Docker Claude 或 real profile。

  ```powershell
  $composeFiles = @('-f','tests/integration/compose.yaml','-f','tests/integration/compose.hardened.yaml')
  & $dockerCli compose @composeFiles build mock-llm
  if ($LASTEXITCODE -ne 0) { throw 'tools image build failed' }
  & $dockerCli compose --profile tools @composeFiles up -d --no-build mock-llm config-init memory-core memory-proxy bootstrap loopback-gateway
  if ($LASTEXITCODE -ne 0) { throw 'Windows Mock stack startup failed' }
  ```

- [ ] 4.3 fail-closed 等待：config-init/bootstrap `exited|0`，Mock/Core/Proxy/Gateway `running|healthy`；随后用 `run --rm --no-deps test-runner` 依次执行 `mock-contract` 与 `standalone-memory`，要求 11/11 与 12/12。

  状态查询必须使用同一个 `$env:COMPOSE_PROJECT_NAME`，在两分钟 deadline 内按 service 名逐项核对；任一 one-shot 非零、service 退出或超时立即停止。通过后执行：

  ```powershell
  foreach ($scenario in @('mock-contract','standalone-memory')) {
    $env:TEST_SCENARIO = $scenario
    & $dockerCli compose --profile tools @composeFiles run --rm --no-deps test-runner
    if ($LASTEXITCODE -ne 0) { throw "$scenario failed" }
  }
  ```

- [ ] 4.4 验证真实宿主边界：

  ```powershell
  curl.exe --noproxy '*' --fail --silent --show-error http://127.0.0.1:8096/health
  ```

  并用 `docker inspect` 断言 Proxy 无 HostConfig PortBindings、Gateway 只绑定 `127.0.0.1:8096`，无 secret/volume、capabilities 已 drop。

- [ ] 4.5 运行 agent-config-a；在仓库外新建 run-specific Windows config 目录，通过 host attestation 与 `windows-config-init` 原子生成 settings。记录全局 `.claude/settings.json` 的存在性、mtime、size 元数据前后不变，不读取内容。

  ```powershell
  & $dockerCli compose --profile windows @composeFiles up --no-deps agent-config-a
  if ($LASTEXITCODE -ne 0) { throw 'agent-config-a failed' }
  $env:PROJECT_ROOT = (Resolve-Path -LiteralPath .).Path
  $env:WINDOWS_CLAUDE_CONFIG_DIR = Join-Path $env:LOCALAPPDATA "refine-memory\runs\$env:RUN_ID\claude-agent-a"
  [IO.Directory]::CreateDirectory($env:WINDOWS_CLAUDE_CONFIG_DIR) | Out-Null
  $gateDir = Join-Path ([IO.Path]::GetTempPath()) ("refine-memory-$env:RUN_ID")
  [IO.Directory]::CreateDirectory($gateDir) | Out-Null
  $env:WINDOWS_CONFIG_ATTESTATION_FILE = Join-Path $gateDir 'windows-config-attestation.json'
  node tests/integration/tools/windows-config-gate.mjs --write-attestation $env:WINDOWS_CONFIG_ATTESTATION_FILE
  if ($LASTEXITCODE -ne 0) { throw 'Windows host attestation failed' }
  $windowsFiles = $composeFiles + @('-f','tests/integration/compose.windows.yaml')
  & $dockerCli compose --profile windows @windowsFiles run --rm --no-deps windows-config-init
  if ($LASTEXITCODE -ne 0) { throw 'Windows config init failed' }
  ```

- [ ] 4.6 在单独 PowerShell 进程运行 headless probe。先按 4.7 的 `Mock before` 程序取得 `$mockBefore`，再把下列脚本整体传给新的 `powershell.exe -NoProfile -Command`。脚本必须用 `try/finally` 保存并恢复 `MEMORY_CORE_GATEWAY_API_KEY`、`CLAUDE_CONFIG_DIR` 和所有列出的 `ANTHROPIC_*` 变量；因此父进程中的 `MEMORY_CORE_GATEWAY_API_KEY` 会继续存在，供 4.7 的 Compose probes 展开环境，不能以永久删除变量作为隔离手段。

  ```powershell
  $claudeProbeScript = @'
  $isolatedNames = @(
    'MEMORY_CORE_GATEWAY_API_KEY', 'CLAUDE_CONFIG_DIR',
    'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL',
    'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL'
  )
  $saved = @{}
  foreach ($name in $isolatedNames) {
    $item = Get-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    $saved[$name] = [pscustomobject]@{ Exists = ($null -ne $item); Value = if ($null -ne $item) { $item.Value } else { $null } }
  }
  try {
    $env:CLAUDE_CONFIG_DIR = $env:WINDOWS_CLAUDE_CONFIG_DIR
    foreach ($name in $isolatedNames | Where-Object { $_ -ne 'CLAUDE_CONFIG_DIR' }) {
      Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
    }
    $version = & claude --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^2\.1\.207(?:\s|$)') { throw 'claude-version' }
    if (-not $env:WINDOWS_PROBE_MARKER) { throw 'probe-marker' }
    $reply = & claude -p "$env:WINDOWS_PROBE_MARKER Reply exactly mock text; no tools" --max-turns 1
    if ($LASTEXITCODE -ne 0 -or $reply -notmatch '^\\s*mock text\\s*$') { throw 'claude-headless' }
  }
  finally {
    foreach ($name in $isolatedNames) {
      if ($saved[$name].Exists) { Set-Item -LiteralPath "Env:$name" -Value $saved[$name].Value }
      else { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
    }
  }
  '@
  $env:WINDOWS_PROBE_MARKER = 'WINDOWS_MOCK_MARKER_' + [guid]::NewGuid().ToString('N')
  & powershell.exe -NoProfile -Command $claudeProbeScript
  if ($LASTEXITCODE -ne 0) { throw 'Windows Claude headless probe failed' }
  ```

  要求版本精确为 `2.1.207`，headless 输出包含且只表达 `mock text`，exit 0。

- [ ] 4.7 通过独立的 Mock observation 和 Core oracle 程序证明：Anthropic `/messages` 请求增量至少 1；列明的 credential、sentinel、内部 identity/session header 泄漏布尔均为 false；Core L0 对本次非敏感 marker 的 owner 命中至少 1、owner mismatch 为 0。不得调用或依赖任何 ignored 旧脚本。两个 probe 都通过 `compose --profile tools @composeFiles run --rm --no-deps test-runner --input-type=module --eval` 在 internal 网络执行，stdout 仅输出脱敏的计数、HTTP status、耗时和布尔值；失败只输出 allowlisted stage 名。

  在 4.6 前立即执行 `Mock before`，并在其成功后立即执行 `Mock after`；两段均为可直接执行的独立程序：

  ```powershell
  $mockProgram = @'
  const response = await fetch('http://mock-llm:8080/__mock/requests');
  if (!response.ok) throw new Error('mock-fetch');
  const { requests } = await response.json();
  if (!Array.isArray(requests)) throw new Error('mock-shape');
  const forbiddenHeaders = new Set(['x-agent-id','x-conversation-id','x-task-id','x-team-id','x-claude-code-session-id','x-vertex-ai-session-id']);
  const messages = requests.filter(({ method, path }) => method === 'POST' && path === '/anthropic/v1/messages');
  const invalidObservation = messages.some((request) =>
    !['sensitive_value_seen', 'unexpected_credential_seen', 'memory_user_credential_seen'].every((name) => typeof request?.[name] === 'boolean') ||
    request.sensitive_value_seen || request.unexpected_credential_seen || request.memory_user_credential_seen ||
    !Array.isArray(request?.header_names) || request.header_names.some((name) => forbiddenHeaders.has(String(name).toLowerCase()) || String(name).toLowerCase().startsWith('x-tdai-'))
  );
  const result = {
    messages: messages.length,
    sensitive_value_seen: messages.some((request) => request.sensitive_value_seen),
    unexpected_credential_seen: messages.some((request) => request.unexpected_credential_seen),
    memory_user_credential_seen: messages.some((request) => request.memory_user_credential_seen),
    internal_identity_header_seen: messages.some((request) => Array.isArray(request.header_names) && request.header_names.some((name) => forbiddenHeaders.has(String(name).toLowerCase()) || String(name).toLowerCase().startsWith('x-tdai-')))
  };
  if (invalidObservation || Object.values(result).slice(1).some(Boolean)) throw new Error('mock-policy');
  console.log(JSON.stringify(result));
  '@
  $mockBeforeJson = & $dockerCli compose --profile tools @composeFiles run --rm --no-deps test-runner --input-type=module --eval $mockProgram
  if ($LASTEXITCODE -ne 0) { throw 'mock-before' }
  $mockBefore = ($mockBeforeJson | ConvertFrom-Json).messages
  # Run 4.6 here.
  $mockAfterJson = & $dockerCli compose --profile tools @composeFiles run --rm --no-deps test-runner --input-type=module --eval $mockProgram
  if ($LASTEXITCODE -ne 0) { throw 'mock-after' }
  $mockAfter = ($mockAfterJson | ConvertFrom-Json).messages
  if ($mockAfter -lt ($mockBefore + 1)) { throw 'mock-delta' }
  ```

  接着运行以下 Core oracle；它只在容器内读取 manifest、其受限 `credential_file` 和 gateway token，最多轮询 30 次。请求使用 manifest 的 service/team/user/agent/task/session，且程序不会回显任何 marker、credential、gateway token、ID 或响应正文：

  ```powershell
  $coreProgram = @'
  import { readFile } from 'node:fs/promises';
  import { dirname, resolve } from 'node:path';
  const manifestPath = '/state/run/run-manifest.json';
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const client = manifest.clients?.['agent-a'];
  if (!client?.credential_file) throw new Error('core-manifest');
  const credential = (await readFile(resolve(dirname(manifestPath), client.credential_file), 'utf8')).trim();
  const gatewayToken = (await readFile('/runtime-config/gateway.token', 'utf8')).trim();
  const marker = process.env.WINDOWS_PROBE_MARKER;
  if (!marker) throw new Error('core-marker');
  let status = 0, body, elapsed_ms = 0, owner_hits = 0, owner_mismatch = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const started = Date.now();
    const response = await fetch('http://memory-core:8420/v3/conversation/query', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${gatewayToken}`, 'x-tdai-service-id': manifest.service_id, 'x-tdai-user-key': credential },
      body: JSON.stringify({ team_id: manifest.team_id, user_id: client.user_id, agent_id: client.agent_id, task_id: manifest.task_id, session_id: client.session_id, limit: 100, offset: 0 })
    });
    status = response.status; elapsed_ms += Date.now() - started;
    body = await response.json();
    const rows = body?.data?.messages ?? [];
    owner_hits = rows.filter((row) => row?.content?.includes(marker) && row.team_id === manifest.team_id && row.user_id === client.user_id && row.agent_id === client.agent_id && row.task_id === manifest.task_id).length;
    owner_mismatch = rows.filter((row) => row?.content?.includes(marker) && (row.team_id !== manifest.team_id || row.user_id !== client.user_id || row.agent_id !== client.agent_id || row.task_id !== manifest.task_id)).length;
    if (status === 200 && body.code === 0 && owner_hits >= 1 && owner_mismatch === 0) break;
    if (attempt < 29) await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000));
  }
  const result = { http_status: status, core_code_zero: body?.code === 0, owner_hits, owner_mismatch, elapsed_ms };
  if (status !== 200 || !result.core_code_zero || owner_hits < 1 || owner_mismatch !== 0) throw new Error('core-oracle');
  console.log(JSON.stringify(result));
  '@
  $coreJson = & $dockerCli compose --profile tools @composeFiles run --rm --no-deps -e WINDOWS_PROBE_MARKER=$env:WINDOWS_PROBE_MARKER test-runner --input-type=module --eval $coreProgram
  if ($LASTEXITCODE -ne 0) { throw 'core-oracle' }
  ```

  最后仅以原子替换写入 ignored JSON；文件内容不含 marker、ID、token、credential、请求头或响应正文：

  ```powershell
  $result = [ordered]@{
    mock_messages_before = [int]$mockBefore
    mock_messages_after = [int]$mockAfter
    mock_messages_delta = [int]($mockAfter - $mockBefore)
    mock_policy_passed = $true
    core = ($coreJson | ConvertFrom-Json)
    completed = $true
  }
  $probePath = Join-Path $env:EVIDENCE_DIR 'windows-headless-probe.json'
  if (Test-Path -LiteralPath $probePath) { throw 'probe-path-exists' }
  $tempPath = "$probePath.$([guid]::NewGuid().ToString('N')).tmp"
  [IO.File]::WriteAllText($tempPath, ($result | ConvertTo-Json -Compress -Depth 4), [Text.UTF8Encoding]::new($false))
  [IO.File]::Move($tempPath, $probePath)
  ```

- [ ] 4.8 写不可变运行报告并更新主状态：本次新 run 只证明 Windows 10 native Claude Runtime Passed；双客户端汇总结论必须分别引用本次 Windows run 与既有 Docker Claude run `docker-mock-20260810-033636`，不得暗示同一新 project 重跑了 Docker Claude。streaming/tool/thinking、真实 DeepSeek、Win11/LAN/WSL、Gateway 故障恢复仍 Not Run，企业结论保持 No-Go/Conditional Go 边界。

- [ ] 4.9 请求用户在同一个 run-specific `CLAUDE_CONFIG_DIR` 中启动 Windows Claude TUI，确认界面与 `mock text`；用户确认后单独追加不可变 TUI 记录。未经确认不得声明 G5 Windows UX Passed。

- [ ] 4.10 final verification 后提交：完整 Node suite、四组 Compose config、Git Bash `bash -n`、EOL/BOM/links/secret/diff/submodule/status 全部 fresh Passed；保留所有本次 project 资源，不执行 `down -v` 或 prune。

  ```powershell
  $runReport = Join-Path 'docs/reproduction' "$env:RUN_ID-windows-claude-mock-passed.md"
  git add -- README.md tests/integration/README.md docs/enterprise-memory-system-evaluation.md $runReport
  git commit -m "test: verify Windows Claude through Mock gateway"
  ```

## Final Verification Matrix

| Gate | Required evidence | Pass condition |
| -- | -- | -- |
| TCP unit | Node `node:net` behavior tests | 双向字节一致；非法配置/上游失败 fail-closed；日志无原值 |
| Compose static | Parsed base/hardened/real/windows topology | 只有 Gateway 发布 loopback；Proxy 留在 internal；Gateway 无 secret/volume |
| Mock contract | Runtime JSON | 11/11、敏感布尔为 false |
| Standalone memory | Runtime JSON | 12/12、A 写/B 读/C 隔离、四项拒绝负测无模型副作用 |
| Host reachability | Windows `curl.exe --noproxy '*'` | `/health` HTTP 200 |
| Windows Claude | Native `claude` headless | `2.1.207`、exit 0、返回 `mock text` |
| Memory oracle | Mock/Core read-only probes | Anthropic 增量 ≥1；L0 owner ≥1；owner mismatch 0 |
| Windows TUI | User observation | 界面正确且文本往返正确 |
| Security | inspect/config/log/diff scans | key/sentinel/internal-header 泄漏 0；已知 Gateway egress 风险明确保留 |
