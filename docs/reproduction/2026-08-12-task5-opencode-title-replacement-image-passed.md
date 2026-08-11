# Task 5 OpenCode fixed-title replacement image Passed

## 状态

**TDD / Build / Runtime Asset Passed；fresh full Mock Not Run**。

`stepfix-2df660d8` 在固定 launcher step 9，即首个 OpenCode write，fail-stop。静态源码审查确认 OpenCode `1.18.16` 在首次 `run` 且未传 title 时会并行生成 session title，产生与 Task 5 operation exact `+1` oracle 冲突的额外模型调用。修复只给 OpenCode headless argv 增加固定、非敏感的 `--title`；不改 Bearer `authToken`，不增加 tmpfs。

## RED → GREEN 与 review

- focused runner 在旧 argv 上为 `42/43`，新增 fixed-title contract 失败；最小修复后为 `43/43`。
- root Node suite 为 `233/233`，base + mock/real/claude/opencode/pi/management Compose config 为 `7/7`。
- 独立 review 为 Critical `0`、Important `0`；review 指出的 Minor 测试覆盖已补齐。
- fix commit 为 `840e5d0f43bdb7ed0ac0f042f0c5a119bd466420`。

## 唯一 OpenCode replacement build 与资产验证

| 项目 | 结果 |
| --- | --- |
| Build | 仅 `opencode-client`，单次 exit `0`，约 3 秒；无 pull、retry、并行 build 或 Compose up |
| 旧 image ID | `sha256:42bc38ead4c3de8ecd75152eeffe23f10f81c580d00e8a816e7b657cf7c57e9b` |
| 新 fixed tag/image ID | `refine-memory-opencode:1.18.16` → `sha256:263a6d0eade24b72b4b2627984a930fc69a3e621519b1ec050a0320398b890a1` |
| User/runtime | Config.User `agent`；actual UID `10001`；OpenCode `1.18.16`；help exit `0` |
| Source/assets | host/image headless-client hash match；fixed-title argv present；`/client-evidence` 为 10001:10001 且 UID10001 writable |
| Residue | verification 后 global containers `0` |

一次组合 shell 资产验证因 Windows quoting 以 exit `2` 结束；随后分开的 `stat`/`touch` probes 均 Passed，没有触发 build retry。临时验证容器使用 `--rm`。旧 exact image 在同 tag replacement 后已自动 absent，无需手工 image remove；未使用 prune。

当前只升级 OpenCode replacement image 与 runtime assets 为 **Ready（build/assets only）**。下一步必须使用全新的 run/project/evidence tuple 单次重跑完整 deterministic Mock；该 tuple 尚未创建或运行。`stepfix-2df660d8` 不得复用，三写六读、final、TUI 与真实/Paid 模型仍为 **Not Run**。
