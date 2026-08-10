# 2026-08-10 Docker Mock 运行被 WSL 资源故障阻塞

> **Append-only reproduction report**：只新增、不覆盖旧实验结果的复现记录，用来保留当时的输入、进度、失败点和安全恢复入口。

> **Run ID**：一次实验的唯一名称；它把 Compose project、证据目录和后续报告关联起来，避免误用另一轮实验的数据。

> **Docker engine / daemon**：实际构建镜像并运行容器的后台服务。Docker 命令行能够启动，不表示该后台服务仍可用。

> **WSL**：Windows Subsystem for Linux，Windows 上运行 Linux 环境的系统组件；Docker Desktop 的 Linux 容器后端依赖它，但这不等于本项目已经测试了 WSL 中的 Claude Code。

> **HCS**：Host Compute Service，Windows 用来创建和管理虚拟机及容器计算实例的系统服务。

> **Mock**：返回固定结果的模拟模型服务；默认实验用它避免真实模型费用。

> **TUI**：Claude Code 在终端中显示并接收键盘操作的交互界面。

> **Reparse point**：Windows 文件系统把目录重定向到其他位置的机制，例如 junction；证据目录要求是没有重定向的普通目录。

> **Committed memory / pagefile**：Windows 已承诺给进程使用的内存总量及其上限；上限由物理内存和分页文件共同提供。这里的 committed memory 不是 Git commit。

> **Docker image / Compose project**：image 是构建后用于启动容器的软件环境包；Compose project 是同一次实验的一组隔离容器、网络和数据卷。

> **Public fork / SHA**：public fork 是用户公开维护的 TencentDB Agent Memory 派生仓库；SHA 是固定某次 Git 提交内容的唯一标识。

> **Secret**：需要避免进入源码、日志和普通配置的敏感凭证，例如 DeepSeek API key。

- 类型：Append-only reproduction report
- 日期：2026-08-10
- Run ID：`docker-mock-20260810-002427`
- Compose project：`mem-it-20260810-002427`
- 文档落盘时根仓库 HEAD：`deee5cea2ade01750ad991677c6d27693d80dc97`
- Public fork SHA：`69fd8b31e3fd4362af6c65407b92b26dfabebd0c`
- 原始证据目录：`.runtime/runs/docker-mock-20260810-002427/`
- 结论：Docker Preflight Passed；单独 Proxy image Passed；Full Compose Build Blocked；Runtime/Mock/Claude/DeepSeek Not Run

## 已完成证据

以下结果在本次 run 进入完整 Compose build 前已实际取得：

| 检查 | 结果 | 事实边界 |
| -- | -- | -- |
| Docker client / server | Passed | client 与 server `29.6.2`，Docker Desktop `4.85.0`，context `desktop-linux` |
| Docker Compose | Passed | `5.3.1` 可执行 |
| `hello-world` | Passed | Linux 容器曾成功启动并退出 |
| 基础镜像拉取 | Passed | `node:22-bookworm-slim`、`node:22-slim` 与 `docker/dockerfile:1` 已拉取；不代表项目镜像完整构建 |
| Public Proxy image | Passed | Public fork `69fd8b31e3fd4362af6c65407b92b26dfabebd0c` 单独构建成功；运行时自检为 `better-sqlite3=ok cost-guard=passthrough-stub` |

上述结果证明 Docker Desktop 在预检阶段曾可用，也证明公开 Proxy Dockerfile 的无私有 `cost-guard` 构建回退可工作；它们不能证明 Core、Hub、完整 Compose、记忆业务或 Claude Code 已运行。

## 阻塞点

完整 Compose build 的首次尝试没有进入项目 Dockerfile 步骤。Docker Desktop engine 已停止，WSL 创建 `docker-desktop` 虚拟机失败：

```text
Wsl/Service/CreateInstance/CreateVm/HCS/0x800705aa
系统资源不足，无法完成请求的服务。
```

Docker Desktop 随后报告 `vpnkit-bridge handshake failed` 和 `bad magic string`；该消息中夹带的内容仍是“系统资源不足”。因此它是后端启动失败后的下游症状，不是一次项目协议或 Dockerfile 测试结果。

按官方排障方向执行的停止、重启和重新启动恢复流程仍然失败或挂起。本轮到此停止，没有继续重试 build，也没有通过修改系统设置、重装 Docker 或扩大任务范围来绕过故障。

## 故障时宿主快照

| 项目 | 观察值 |
| -- | -- |
| 物理内存 | `15.87 GB` 总量，`4.82 GB` 可用 |
| Windows committed memory | `21.26 / 30.87 GB` |
| 分页文件 | `15 GB` |
| 磁盘 | 空间充足；没有观察到磁盘容量不足 |
| `%USERPROFILE%\.wslconfig` | 空文件；没有自定义 WSL 资源上限 |
| WSL distributions | `docker-desktop` 与 `Ubuntu` 均为 stopped |
| 当前账户 | 非管理员账户 |

**Verified Fact：** HCS 返回 `0x800705aa`，并明确报告系统资源不足；Docker Desktop 当时无法创建 WSL 虚拟机。故障快照中的 Windows committed memory 为 `21.26 / 30.87 GB`，尚未达到 commit 上限；该快照既不能证明物理内存耗尽，也不能证明 commit 空间耗尽。

**Inference：** 可以把问题定位到当时的 HCS/WSL 系统资源分配失败，但现有证据不足以确定是哪一种资源。物理内存压力、分页文件或 commit 压力只是不确定假设，不能优先写成根因；项目源码和 Dockerfile 也尚未进入执行点。

## 未执行与安全边界

| 项目 | 状态 |
| -- | -- |
| 完整 Core/Hub/Proxy/Claude images | Blocked；未取得完整 build 结果 |
| Compose services / containers | Not Run |
| `mock-contract` | Not Run |
| `standalone-memory` | Not Run |
| Hub Panel / Knowledge 业务探针 | Not Run |
| Docker Claude headless / TUI | Not Run |
| Windows Claude 联动 | Not Run |
| DeepSeek | Not Run；未加载 secret，未发出真实模型请求 |

证据目录在停止时存在，是普通非 reparse 目录，且内容为空。没有运行 JSON、日志或响应可归档；本报告不包含 DeepSeek key、Memory 用户 key 或其他 secret。空目录不是成功证据。

## 安全恢复入口

**Recommendation：** 先保存其他工作并重启 Windows，使 WSL、HCS 与 Docker Desktop 从干净的宿主状态重新初始化。重启后先重复 Docker version/context/Compose/`hello-world` 预检；任一项失败就停止，不开始项目 build。

**后续状态（不改写本次结论）：** Windows 重启后，Docker client/server、`desktop-linux` context、Compose 与 `hello-world` 预检恢复通过；后续使用新的 run ID 完成了无付费 Mock、Standalone、Hub 只读业务探针和 Docker Claude headless 验证，见 [`docker-mock-20260810-033636`](2026-08-10-docker-mock-20260810-033636-no-paid-runtime-passed.md)。本报告对应的 `docker-mock-20260810-002427` 仍保持 **Blocked**，其空证据目录不能被后续 run 结果替代。

预检恢复后必须创建新的 run ID、Compose project 和证据目录，不复用 `docker-mock-20260810-002427`。新一轮仍只运行默认 Mock，不加载 `compose.real.yaml` 或 DeepSeek secret；先完成完整镜像 build，再依次运行 `mock-contract`、`standalone-memory`、Claude headless，最后由用户确认 TUI。

若 Windows 重启后仍出现 `0x800705aa`，应先收集新的系统资源与 Docker Desktop 诊断报告，再单独评估分页文件、其他虚拟机或高内存进程；不要把本次空证据目录或单独 Proxy image 结果升级为完整运行通过。

当前主状态见[企业智能体记忆系统评估](../enterprise-memory-system-evaluation.md)，恢复命令与排障入口见[Docker 多客户端记忆实验](../../tests/integration/README.md)。
