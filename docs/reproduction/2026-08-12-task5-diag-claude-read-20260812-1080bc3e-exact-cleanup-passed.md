# Task 5 Claude cross-owner read fixed-phase diagnostic `1080bc3e` exact cleanup Passed

## 状态

**Runtime Cleanup Passed**。

在 freshness 已通过且本次运行确实创建 exact project `refine-memory-task5-diag-claude-read-20260812-1080bc3e` 后，只使用 `mock`、`management`、`claude`、`opencode`、`pi` 五个 profiles 与 Ready 合同固定的七个 Compose files 执行 `down --volumes --remove-orphans`，命令 exit `0`。

| 检查项 | cleanup 前 | cleanup 后 |
| --- | ---: | ---: |
| exact project containers | 5 | 0 |
| exact project networks | 1 | 0 |
| exact project volumes | 15 | 0 |
| global containers | 5 | 0 |
| active fixed images | 7/7 | 7/7 retained |
| host evidence files | 2 | 2 retained |

第一次 after image verifier 使用四个陈旧 tag 名，只识别到 `3/7`；这是检查脚本的 tag 列表错误，不是镜像被删除。随后按七个文档固定的完整 image IDs 独立复核，最终依据为 `7/7 retained`。

未使用 `--rmi`、全局 prune 或模糊 project 名；没有 build、retry、读取 raw aggregate/log/named-volume evidence/secret、TUI 或真实/Paid 模型调用。host evidence path 与两个文件保留，只核对路径存在性和计数，未读取文件名或内容。

该 cleanup 不改变 diagnostic `phase=observation` 与业务 **Blocked** 状态。下一 Gate 是按 TDD 新增 observation 子阶段 fixed diagnostic，并使用全新 tuple；不得重跑 `1080bc3e` 或完整 Mock。
