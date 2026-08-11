# Task 5 Claude cross-owner read fixed-phase diagnostic `1080bc3e` Ready

## 状态

**Ready / Not Run**。

这是 `full-6449fcf8` fixed step 11 Blocked/cleaned 后的全新唯一 diagnostic tuple。历史 Ready、Blocked、Passed 与 cleanup 记录保持 append-only。本记录只证明 fixed-phase implementation、静态合同和 freshness/preflight，不证明 Docker workload、Claude read success、完整三写六读/final、TUI 或真实模型。

## 固定输入与静态证据

| 项目 | 值 |
| --- | --- |
| Root preflight HEAD | `143a42db806c340e8a210c57d0d1dee76e766322`（clean） |
| Product/gitlink | `9e456a5b7bb47ae40596237d0f0b87c1edfc098f`（clean/exact） |
| `RUN_ID` | `task5-diag-claude-read-20260812-1080bc3e` |
| `COMPOSE_PROJECT_NAME` | `refine-memory-task5-diag-claude-read-20260812-1080bc3e` |
| `EVIDENCE_DIR` | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-diag-claude-read-20260812-1080bc3e` |
| Core image | `sha256:fded9d48d76bf71d0652023be0e9aa5553d46c039cc04ace0ec7c1e370f95d44` |
| Proxy image | `sha256:55fedae3f6a3a0a45ac8be45461d8cab23c52f11cc089c1c1e54c7d236de764b` |
| Hub image | `sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4` |
| tools image | `sha256:8ca1a2a82a585ecf477577db2308c09348b4c7a6ff6022693f3653ed20004d81` |
| Claude image | `sha256:261a917376f791d9b5e092040c2f488f23588b7103a27606226426f273b040dd` |
| OpenCode image | `sha256:263a6d0eade24b72b4b2627984a930fc69a3e621519b1ec050a0320398b890a1` |
| Pi image | `sha256:56582fd216db259342f4414ebdc6c9c9188229678d77eb2f360959c9af2e4538` |

- fixed coordinator 精确重放 full Mock steps 1–10：services、bootstrap、三 config、protocol/leak、management/outsider 与 Claude/OpenCode/Pi 三 writes；前置 action 不加 diagnostic overlay，只有最终 Claude read(owner=opencode) 使用它。
- TDD 为 focused `51/51`、fresh root Node `258/258`、Compose `8/8`；Claude-read diagnostic merged config exit `0`，独立 review 为 `Critical 0 / Important 0 / Minor 0`。
- exact Compose project labels 的 containers/networks/volumes 为 `0/0/0`；global containers `0`；evidence path 不存在；`127.0.0.1:8125` listeners `0`；active image refs/IDs `7/7` 精确匹配。
- 当前业务 Gate 仍是 `full-6449fcf8` step 11 **Blocked**。本 diagnostic 尚未运行，不得预写 `success` 或把静态结果扩写为完整 Mock 通过。

## 单次运行合同

在 root worktree 中只设置以下四个环境变量，并只调用一次 tracked launcher；disposable gateway 仅供本次 Mock/Core 服务鉴权，不是模型 key，不得输出或复用：

```powershell
$env:RUN_ID = 'task5-diag-claude-read-20260812-1080bc3e'
$env:COMPOSE_PROJECT_NAME = 'refine-memory-task5-diag-claude-read-20260812-1080bc3e'
$env:EVIDENCE_DIR = 'D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\runs\task5-diag-claude-read-20260812-1080bc3e'
$env:MEMORY_CORE_GATEWAY_API_KEY = "task5-$([guid]::NewGuid().ToString('N'))"

node tests/integration/tools/run-task5-claude-read-diagnostic.mjs
```

canonical stdout 必须是单行 `{"status":"classified","phase":"<phase>"}`。五种 phase 都以 launcher exit `0` 返回，但状态解释固定如下：

| `phase` | 本 diagnostic 状态 | 业务边界 |
| --- | --- | --- |
| `success` | Passed | 只证明该 Claude cross-owner read diagnostic；完整 Mock 仍 Blocked |
| `client` | Blocked | 不读取 raw child/log/evidence |
| `observation` | Blocked | 不读取 raw aggregate/evidence 推断 |
| `evidence` | Blocked | 不读取或修补 raw evidence |
| `setup` | Blocked | 不重试或复用 tuple |

launcher 非零时，唯一允许的失败面是空 stdout 与 stderr 精确单行 `Task 5 Claude read diagnostic coordinator failed`；任何其他输出均是 contract failure，不得解释为上述五种 phase。

## 唯一允许的下一步

只允许 tracked `tests/integration/tools/run-task5-claude-read-diagnostic.mjs` 对该 tuple 执行一次。禁止 build、retry、重跑 full Mock、复用旧 tuple、读取 raw child/log/evidence、TUI 或真实/Paid 模型。

若 freshness 通过且本次运行创建了 exact project，无论结果如何，都须先做脱敏盘点并新增 append-only result；随后使用精确 profiles `mock`、`management`、`claude`、`opencode`、`pi` 和以下七个 files，只对该 project 执行 cleanup：

```powershell
docker compose `
  --profile mock --profile management --profile claude --profile opencode --profile pi `
  -f tests/integration/compose.four-cli.yaml `
  -f tests/integration/compose.four-cli.mock.yaml `
  -f tests/integration/compose.four-cli.claude.yaml `
  -f tests/integration/compose.four-cli.opencode.yaml `
  -f tests/integration/compose.four-cli.pi.yaml `
  -f tests/integration/compose.four-cli.management.yaml `
  -f tests/integration/compose.four-cli.claude-read-diagnostic.yaml `
  down --volumes --remove-orphans
```

cleanup 后须独立复查 exact project 和 global container count，再删除上述四个进程环境变量。不得使用 `--rmi` 或全局 prune，active images 保留。若 preflight 或 label collision 失败，则保留碰撞或未知资源审计，不执行 cleanup。
