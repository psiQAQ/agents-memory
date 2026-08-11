# Task 5 Claude `-p` diagnostic `92204e33` exact cleanup Passed

## 状态

**Runtime Cleanup Passed**。

用户已明确要求清理用完的 Docker 资源。仅针对 exact project `refine-memory-task5-diag-claude-p-20260812-92204e33` 操作；未使用模糊 project 名、全局 prune 或镜像删除。

对应诊断结果见 [92204e33 CLI unknown-before-Mock](2026-08-12-task5-diag-claude-p-20260812-92204e33-cli-unknown-before-mock-blocked.md)。

## 盘点与清理

| 阶段 | Containers | Networks | Volumes | Host evidence files |
| --- | ---: | ---: | ---: | ---: |
| Before | 5 | 1 | 9 | 0 |
| After | 0 | 0 | 0 | 0 |

第一次未显式启用 Compose profiles 的 exact `down --volumes --remove-orphans` 返回 `0`，但独立复查仍为 `5/1/9`，因此没有误记为成功。随后在相同 project 和四个固定 Compose files 上显式启用 `mock`、`claude` profiles，再执行同一 cleanup；独立 after-query 为 `0/0/0`。

host evidence directory 保留；当前 active Compose 仍精确引用的 Core、Proxy、Hub、tools、Claude、OpenCode 与 Pi images 均未删除。未读取 evidence 内容、runtime logs、settings、home、secret 或模型 key；未运行 TUI、真实/Paid 模型或其他 project。cleanup 只证明该 exact project 的资源生命周期已结束，业务 Gate 仍为 Blocked。
