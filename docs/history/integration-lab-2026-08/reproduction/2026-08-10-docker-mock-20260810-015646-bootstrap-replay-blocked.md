> **状态：Historical** — 本记录只证明 2026-08 实验当时的状态，不是当前可执行流程。

# 2026-08-10 Docker Mock 运行被 Bootstrap 重放阻塞

> **One-shot**：只应执行一次并在完成后退出的容器任务，例如初始化配置或创建测试身份。

> **Bootstrap**：创建 Metadata user、team、agent、task、资产绑定与客户端配置材料的一次性初始化步骤。本实验故意让它拒绝覆盖已初始化的场景卷。

> **Local image ID**：本机 Docker 内容存储中镜像的内容标识；它不是远端 registry digest，也不能证明镜像已推送。

> **Gate**：进入下一阶段前必须通过的自动检查；失败后本次 run 停止，不用重试覆盖原始证据。

- 类型：Append-only reproduction report
- 日期：2026-08-10
- Run ID：`docker-mock-20260810-015646`
- Compose project：`mem-it-20260810-015646`
- 验证基线根仓库 HEAD：`deee5cea2ade01750ad991677c6d27693d80dc97`
- Public fork SHA：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 原始证据目录：`.runtime/runs/docker-mock-20260810-015646/`
- 结论：Full selected-image build Passed；初次 readiness Passed；Gate 1 runner 未启动；Standalone、Hub、Claude 与 DeepSeek Not Run

## 构建与启动证据

**Verified Fact：** Docker client/server 为 `29.6.2`，Docker Desktop 为 `4.85.0`，context 为 `desktop-linux`，Compose 为 `5.3.1`。Base、tools 和 Claude profile 的 `config --quiet` 均 exit 0。

从 public fork `69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 构建所选镜像的完整命令 exit 0。以下均为本机 image ID，不是 registry digest：

| 镜像 | Exact local image ID |
| -- | -- |
| `refine-memory-integration-tools:local` | `sha256:3ddcbf11de00bce248f3051e81aceee44714aab18013668289e7979ad5eca152` |
| `refine-memory-core:fork-69fd8b` | `sha256:84559ad02ae0b7e00e40dd64275f8e2229f7f8dd53d906576c71c6badc918bbe` |
| `refine-memory-hub:fork-69fd8b` | `sha256:53defd81093d9aa983e3e20d1459b449837fb591d21b8931fee76c2419bec130` |
| `refine-memory-proxy:fork-69fd8b` | `sha256:899d1d85e67773294547b1f75fce3d3e4909f0788c8bd1c2871abd5857d00f6d` |
| `refine-memory-claude-code:2.1.207` | `sha256:62391ac2efa7f597c5cffa780fe27c1f96c5c2374d018db8af590fbac2b7fd4a` |

初次显式启动 `mock-llm`、`config-init`、`memory-core`、`memory-proxy` 与 `bootstrap` exit 0。随后 readiness 检查确认：

- `config-init` 与第一次 `bootstrap` 均为 `exited|0`；
- Mock、Core 与 Proxy 均为 `running|healthy`；
- 该结果只证明准备阶段完成，不证明 runner 业务 Gate。

## 阻塞点与根因

运行第一个 `mock-contract` 时，文档中的旧命令为：

```powershell
& $dockerCli compose `
  --profile tools `
  -f tests/integration/compose.yaml `
  run --rm test-runner
```

Compose 根据 `depends_on` 再次启动已经成功退出的 `bootstrap`。第二次 Bootstrap 发现 `/state/run` 已初始化，按设计 fail-closed 并 exit 1；`test-runner` 本身没有启动。

**Verified Fact：** Gate 1 没有生成 `mock-contract.json`，证据目录保持为空。Gate 2、Hub、Docker Claude 和真实模型路径均未执行。

**Inference：** 这是 Compose one-shot 生命周期命令的问题，不是 Mock 协议、记忆业务或 Bootstrap 首次初始化失败。将 Bootstrap 改为可覆盖会削弱场景隔离，因此修复应让显式准备后的 runner 使用 `--no-deps`。

## 修复与复审

后续采用测试驱动方式修改集成说明，并新增 lifecycle regression test：

- 两个 runner、Windows config init 与 Docker Claude one-shot 均使用 `run --rm --no-deps`；
- 只有同一 Compose project 已显式完成 Bootstrap 和健康等待后，才允许使用 `--no-deps`；
- runner 前增加两分钟、按 project container name 检查的 fail-closed readiness loop；
- 两个 runner 通过后，`agent-config-a` 只以 `up --no-deps` 准备一次；
- focused lifecycle test 1/1、完整根 Node suite 58/58、base/tools/Claude Compose parse 均 Passed；两轮针对 readiness 与测试变异覆盖的独立复审最终为 Clean。

修复后的真实运行结果分别见 [forged contract 失败 run](2026-08-10-docker-mock-20260810-024419-forged-contract-failed.md)、[session 前置条件失败 run](2026-08-10-docker-mock-20260810-030443-session-precondition-failed.md) 与[最终无付费通过 run](2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)。

## 停止与保留状态

诊断完成后，对精确 project 执行 base/tools Compose `down --remove-orphans`，exit 0；没有使用 `-v`，也没有执行任何 prune。项目容器和网络均已移除，以下三个 named volumes 保留：

- `mem-it-20260810-015646_bootstrap-state`
- `mem-it-20260810-015646_core-data`
- `mem-it-20260810-015646_runtime-config`

这些卷仍按敏感项目状态管理，不得全局 prune。DeepSeek 请求数为 0（依据所选 profile/service 与项目日志；不是 packet capture 证明），没有读取或加载真实 secret。

**Recommendation：** 不复用本 run 的 project、volume 或空证据目录。后续验证必须使用新 run ID，并保留本报告的 **Blocked** 结论。
