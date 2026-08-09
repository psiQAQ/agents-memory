# 2026-08-09 Docker Compose 静态验证记录

> **Static Passed**：文件、渲染器、Gate 与 Compose 展开结果通过自动检查；不代表镜像或服务已经运行。

> **Build Failed**：镜像构建命令已尝试但未到达项目 Dockerfile 执行阶段，失败原因是镜像仓库认证网络超时。

> **Runtime Not Run**：本记录没有执行 `docker compose up`、业务探针、Claude TUI 或真实模型请求。

## 范围与基线

| 项目 | 值 |
| -- | -- |
| 根仓库基线 SHA | `3b6f0d578246f46bd9506d586e5aba62793587de` |
| Tencent fork submodule SHA | `c75ef5834eeacf17f2df8f84f7cf2d1747822de2` |
| Node.js | `v24.17.0` |
| Docker Compose | `v5.3.1` |
| Claude Code 镜像包 | `@anthropic-ai/claude-code@2.1.207` |
| 日期 | 2026-08-09 |

本次只验证 root repo 的编排、工具与文档；未修改 Tencent submodule，未使用真实 key，未执行付费调用、镜像构建重试或服务启动。

## 执行命令与结果

从仓库根目录执行：

```powershell
node --test tests/integration/test/*.test.mjs
```

结果：`41 passed, 0 failed`。

以下四组均使用 Docker CLI 的绝对路径执行 `docker compose ... config --quiet`，结果均为 exit `0`：

1. `compose.yaml`
2. `compose.yaml + compose.hardened.yaml`
3. `compose.yaml + compose.real.yaml`，先用工作区外 dummy secret 执行 host attestation
4. `compose.yaml + compose.hardened.yaml + compose.windows.yaml`

真实层静态检查所用 dummy secret、attestation 与临时 evidence 目录已在检查后删除；Compose 展开输出未包含 dummy key，也未保存展开后的 real config。

## 已验证的静态边界

- Base 只配置 Mock endpoint，默认不发布 host port。
- Claude A/B/C 仅是自动化隔离 fixture；每个客户端拥有独立 home/workspace，且不挂 bootstrap state。
- `agent-config-a/b/c` 只把对应 Memory 用户 key 分发到对应私有 home。
- Proxy 的 DeepSeek key 只进入受保护的运行时配置，不进入 Proxy environment 或 Compose 展开结果。
- Host attestation 能拒绝工作区内 secret、篡改、过期、路径不匹配和多行/首尾空白 key。
- Real profile 不再启动或等待 Mock/config-init；Proxy 不依赖 Hub。
- Windows 适配层只处理 agent-a 的项目专用配置，不挂共享凭证或 DeepSeek secret。

## 构建阻塞与限制

本轮未重复下载。此前构建首先发现 `docker-credential-desktop` 不在当前进程 `PATH`；使用 Docker Desktop CLI 的绝对路径并补充进程级工具路径后，构建仍在获取 `docker/dockerfile:1` 的 Docker Hub OAuth token 时发生 IPv6/网络超时，尚未执行到 Hub named-context `COPY` 或 Claude npm 安装。因此构建结论保持 **Build Failed（registry network blocker）**。

另有一个 Medium 级上下文问题留给下一次 public fork Task 4 commit：MemoryPanel 当前缺少收窄构建上下文的 `.dockerignore`。本轮按边界不修改 submodule，也没有用 root repo 的弱 preflight 掩盖该问题。

权限、ACL、文件所有权、持久化、故障恢复、Windows Claude TUI 和 DeepSeek 协议均为 **Design Only / Runtime Not Run**。下一步必须先解除镜像仓库网络阻塞，再进入 Task 5 的无付费运行验证。
