# 2026-08-09 Docker Compose 安全 Gate 静态复验

> **Static Passed**：测试、路径 Gate 与 Compose 展开检查通过；不代表镜像或服务已经运行。

> **Build Failed**：沿用前次构建结论；本轮没有重复下载，Docker Hub registry 网络阻塞仍未解除。

> **Runtime Not Run**：本轮没有执行 `docker compose up`、业务探针、Claude TUI 或真实模型请求。

## 证据身份

| 项目 | 值 |
| -- | -- |
| 变更基线 SHA | `f9adb5699c40135f41db2ab2b762770fc3f0561a` |
| 验证对象 SHA | `1b3ecc34e3aada52f04f63375d3057685dd8a752` |
| 验证对象 tree | `ab86f4f5a72a17b1f6c2474fabc45f0bdacf59e1` |
| Tencent fork submodule SHA | `c75ef5834eeacf17f2df8f84f7cf2d1747822de2` |
| 日期 | 2026-08-09 |

本报告在验证对象 commit 完成并以 clean worktree 复验后新增，因此可以绑定精确 SHA/tree，不产生“报告在同一 commit 内自引用”的内容寻址循环。前一份[静态记录](2026-08-09-docker-compose-static.md)中的“根仓库基线 SHA”表示当时的变更起点，并非验证结果 SHA；旧报告按 append-only 规则保持不变，本报告补充该歧义。

## RED → GREEN

1. 持久 home junction 测试先出现 `1 failed / 3`：旧 `prepare-agent.mjs` 会跟随 `.memory` junction。加入逐层 `lstat`、regular-file link-count 与显式 mode 检查后为 `3/3 passed`，外部目标未写入 key。
2. Paid Gate 的伪造 root 矩阵先出现 `1 failed / 4`：旧实现接受调用者缩窄的 `PROJECT_ROOT`。改为从工具位置推导真实 worktree root 后为 `4/4 passed`；窄 root、父 root、link alias、仓库内 secret 与 attestation 篡改均 fail-closed。
3. Windows host/runtime Gate 初始为 `0/2 passed`，Compose/wrapper 契约初始有 `2 failed`。新增 host attestation 与 runtime-before-render wrapper 后，Windows Gate 为 `2/2 passed`，相关定向套件为 `16/16 passed`。

## 完整验证结果

| 验证 | 结果 |
| -- | -- |
| `node --test tests/integration/test/*.test.mjs` | Passed：45/45 |
| Base `docker compose config --quiet` | Passed：exit 0 |
| Base + hardened `config --quiet` | Passed：exit 0 |
| Base + real + host paid attestation `config --quiet` | Passed：exit 0 |
| Base + hardened + Windows + host path attestation `config --quiet` | Passed：exit 0 |
| Git Bash `bash -n` 三个 shell entrypoint | Passed |
| 相关文件 LF、secret-shaped value、unsafe host/home mount scan | Passed |
| `git diff --check` 与验证后 worktree | Passed；clean |

Real 与 Windows 两组检查只使用系统临时目录中的 dummy 文件；secret、attestation、config/evidence 临时目录均在 `finally` 中删除。Compose 解析期间出现本机 Docker config 读取权限 warning，但命令 exit 0；没有保存展开后的 real config，也没有发起付费请求。

## 仍未解决

- Build 未重试；Docker Hub OAuth/registry 网络仍是镜像验证 blocker。
- MemoryPanel 缺少收窄 build context 的 `.dockerignore`，作为 Medium 项留到 Task 4 public fork commit；没有用 root preflight 掩盖它。
- Docker bind、Linux uid/gid、Windows Claude TUI、ACL、持久化和故障恢复仍为 Design Only / Runtime Not Run。
