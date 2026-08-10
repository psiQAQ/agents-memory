# Legacy Docker 运行资源精确清理

## Status

**Runtime Cleanup Passed（resource lifecycle only）**。经负责人明确授权，旧 Windows + Claude 路线的 3 个 Compose project、20 个 exited 容器、4 个网络和 27 个卷已不可恢复地删除；6 个旧镜像候选在清理后均不可 inspect，其中 5 个由本次删除，1 个在清理前已不存在。

本记录只证明资源生命周期清理，不证明四 Docker CLI 的服务健康、Mock、真实 API、TUI 或跨客户端业务流。Task 2 仍仅为 **Runtime Passed（build/assets only）**。

## Authorized scope and accepted consequence

- 保留四个 Task 2 产品镜像、Proxy RED 基线、当前 integration tools、Node 基础镜像、BuildKit frontend 和全部 BuildKit cache。
- 不执行 `docker image prune -a`、`docker system prune`、`docker volume prune`、`docker builder prune`、`down -v` 或任何 `--force`。
- 接受旧 `main` 的 `fork-69fd8b` Compose 栈不能再依赖原有运行资源原样启动；历史结论仅由 Git ref、ADR 和 append-only reproduction 保留。
- 未读取卷内容、Tencent ignored `.env`、settings、secret、home、`.runtime/` 或原始 runtime evidence。

## Before inventory

最终 fail-closed 预检确认：5 个保留镜像 ID 精确匹配；3 个 project 共 20 个容器均为 `exited`；4 个网络和 27 个卷的 `com.docker.compose.project` label 与允许清单一致；5 个实际存在的旧镜像对象与完整 ID 一致。旧 untagged integration-tools 对象 `3d4853b4...` 在删除开始前已经无法 `docker image inspect`，记为 `absent-before-cleanup`。

```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          15        4         9.99GB    6.067GB (60%)
Containers      20        0         11.86MB   11.86MB (100%)
Local Volumes   27        17        3.969MB   1.716MB (43%)
Build Cache     188       11        18.93GB   9.362GB
```

`docker buildx du` 的 before total 为 `18.93GB`。该数值只用于前后审计，没有触发 cache 清理。

## Retained images

| Tag | Image ID | Result |
| --- | --- | --- |
| `local/refine-memory-core:0a568c3-task2` | `sha256:063e247be20c83c2e4167a1b20fc4d0ebbd4a0266d2e7129c842b83aae023ec0` | Present |
| `local/refine-memory-proxy:3db2b7d-task2` | `sha256:39410138cf8a6b2742b0bfe99658b6f58b6c32693c2cd441a701b7e8ec3ab31a` | Present |
| `local/refine-memory-proxy:0a568c3-task2` | `sha256:e4877297d9b0a90ad35dda7794fdc4f48b4917e8e60981070f895c1076897862` | Present；Proxy RED 基线 |
| `local/refine-memory-hub:0a568c3-task2` | `sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4` | Present |
| `refine-memory-integration-tools:local` | `sha256:e2479306af4d59450b4518269096ba787cc6d027d2f79cd70ac1f09a79346cb2` | Present |

`node:22-slim`、`node:22-bookworm-slim` 仍为 `sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436`；`docker/dockerfile:1` 仍为 `sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89`。不在授权清单中的其他镜像未删除。

## Removed runtime resources

### Compose projects and containers

| Project | Removed containers |
| --- | ---: |
| `mem-it-20260810-033636` | 7 |
| `mem-win-20260810-093140-a664249f` | 6 |
| `mem-win-windows-mock-20260810-111850-93778ced` | 7 |

容器按精确 Compose project label 重新选取并复核 `exited` 后，以 20 个容器 ID 非强制删除。未解析旧 Compose secret，也未使用模糊 project 名或通配符。

### Networks

- `mem-it-20260810-033636_default`
- `mem-win-20260810-093140-a664249f_default`
- `mem-win-windows-mock-20260810-111850-93778ced_default`
- `mem-win-windows-mock-20260810-111850-93778ced_loopback-ingress`

删除前逐个复核完整名称、Compose project label 和零 endpoint。

### Volumes

| Compose project | Removed suffixes | Count |
| --- | --- | ---: |
| `mem-it-20260810-015646` | `bootstrap-state`, `core-data`, `runtime-config` | 3 |
| `mem-it-20260810-024419` | `bootstrap-state`, `core-data`, `runtime-config` | 3 |
| `mem-it-20260810-030443` | `bootstrap-state`, `core-data`, `runtime-config` | 3 |
| `mem-it-20260810-033636` | `bootstrap-state`, `claude-home-a`, `claude-workspace-a`, `core-data`, `hub-data`, `runtime-config` | 6 |
| `mem-win-20260810-093140-a664249f` | `bootstrap-state`, `claude-home-a`, `core-data`, `proxy-data`, `proxy-logs`, `runtime-config` | 6 |
| `mem-win-windows-mock-20260810-111850-93778ced` | `bootstrap-state`, `claude-home-a`, `core-data`, `proxy-data`, `proxy-logs`, `runtime-config` | 6 |

27 个卷在统一删除前全部通过完整名称、Compose project label、`docker system df -v` 的 `Links=0` 和零容器引用检查；随后逐个执行非强制删除。

### Images

| Previous tag or role | Image ID | Result |
| --- | --- | --- |
| `memory-proxy:task5-public-build-20260810` | `sha256:5a61871e8fb2925b0aebbea46a9659d84e49efe85bd072aeef99b03e3625c2a4` | Removed |
| `refine-memory-claude-code:2.1.207` | `sha256:62391ac2efa7f597c5cffa780fe27c1f96c5c2374d018db8af590fbac2b7fd4a` | Removed |
| `refine-memory-hub:fork-69fd8b` | `sha256:53defd81093d9aa983e3e20d1459b449837fb591d21b8931fee76c2419bec130` | Removed |
| `refine-memory-core:fork-69fd8b` | `sha256:84559ad02ae0b7e00e40dd64275f8e2229f7f8dd53d906576c71c6badc918bbe` | Removed |
| `refine-memory-proxy:fork-69fd8b` | `sha256:899d1d85e67773294547b1f75fce3d3e4909f0788c8bd1c2871abd5857d00f6d` | Removed |
| old untagged integration tools | `sha256:3d4853b4e098c6a163ff87f98c942a7d9f2a7d4fd1439ea755f61152a9b000bb` | Absent before cleanup |

## After verification

独立 after 查询确认：3 个 project 的容器均为 0；4 个网络和 27 个卷均不存在；6 个候选 image ID 均无法 `docker image inspect`；5 个保留镜像及 Node/BuildKit frontend 仍以原 ID 存在。

```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          10        0         6.052GB   5.68GB (93%)
Containers      0         0         0B        0B
Local Volumes   0         0         0B        0B
Build Cache     192       25        19.3GB    13.33GB
```

Images 的 `docker system df` 逻辑占用实际下降 `3.938GB`，低于计划中的约 `4.93GB` 估算。差异来自共享层计费，且 `3d4853b4...` 在清理前已不存在；未为追求估算值扩大删除范围。

Build Cache 没有执行任何 prune，after total 为 `19.3GB`，相较 before 的 `188 / 18.93GB` 观察到 `192 / 19.3GB`。本次没有执行 build 或 cache 删除命令；该上升可能来自并发构建或 Docker 的引用重分类，因此不把“数量和大小完全不变”写成已验证事实。可确认的是本次未主动减少 BuildKit cache。

## Remaining boundary

- 旧 runtime resources 和卷内容不可恢复；若要运行旧 `main` 的 `fork-69fd8b` 栈，必须从 Git 历史重新构建并创建新 project/volumes。
- Git ref、ADR 和既有 reproduction 原文仍保留，只能证明各自历史 run。
- 四 CLI 的下一 Gate 仍是 Task 3 原生 source/session/route RED；本清理不改变服务、Mock、真实 API 和 TUI 的 `Not Run` 状态。
