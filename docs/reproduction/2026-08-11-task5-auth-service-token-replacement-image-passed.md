# Task 5 auth service-token fix 与 replacement Proxy image Passed

## 状态

**Product tests/review + replacement image build/assets Passed / deterministic Mock rerun Not Run**。

本记录追加在 [`fixed-8d4802d5` protocol/leak Blocked](2026-08-11-task5-mock-20260811-fixed-8d4802d5-protocol-leak-blocked.md) 之后，不改写旧失败现场。产品对 Proxy→Core auth 的 service token 缺口已完成 TDD 修复、独立 review、唯一 replacement build 与离线镜像验证；active root 已固定新 gitlink 与精确 tag/digest。尚未使用新镜像启动业务栈或重跑 deterministic Mock，因此本记录不证明 protocol/leak、management/outsider、三写六读、final oracle 或真实 CLI headless 通过。

## 固定输入

| 项目 | 值 |
| --- | --- |
| Product commit | `codex/four-agent-memory-upstream@9e456a5b7bb47ae40596237d0f0b87c1edfc098f` |
| Root integration commit | `codex/four-agent-memory-compose@e49cf14580b9fc746c032bdfa87ae42336f9b5c9` |
| Replacement tag | `local/refine-memory-proxy:9e456a5-auth-fix` |
| Image ID / RepoDigest | `sha256:55fedae3f6a3a0a45ac8be45461d8cab23c52f11cc089c1c1e54c7d236de764b` |
| Active Compose pin | `local/refine-memory-proxy:9e456a5-auth-fix@sha256:55fedae3f6a3a0a45ac8be45461d8cab23c52f11cc089c1c1e54c7d236de764b` |
| Public context | `D:\workspace\refine-memory\.worktrees\four-agent-memory\.runtime\build-contexts\memory-proxy-9e456a5-auth-fix-6f3c21a8` |

product commit 与 submodule 工作树均 clean；该 commit 仍是 local-only，未经授权没有 push、PR 或 remote 修改。

## Product TDD 与 review

- RED：focused auth service-token suite 为 `1 passed / 2 failed`。旧实现丢弃 `${...}` `auth.serviceToken`，Core verify 请求也没有使用服务端 token 发送 `Authorization: Bearer`。
- GREEN：focused 为 `3/3`。`AuthConfig`、raw YAML 与 `buildConfig` 保留 optional `serviceToken`；仅当服务端 token 非空时发送 Bearer，`x-tdai-service-id` 保持正确；调用者 user key 只进入 JSON body，不作为 header 或 Bearer fallback。无 token 的外部 auth 配置保持不发送 `Authorization`。
- 独立 product review：`CLEAN`。
- `--network none` fresh full：`38/38` suites、`276/276` tests Passed。
- `tsc --noEmit` 仍为 exit 2 / 6 errors；修复前后 normalized error signature 完全相同，属于既有 baseline，**不是 typecheck green**。

## 唯一 build 与离线镜像 Gate

官方 public-context 流程生成上表唯一新 context；源码与 context secret scan、forbidden path、reparse、UTF-8 BOM 与 CRLF 检查均 Passed。context-only LF 规范化后，`161/161` source files normalized match。

随后只执行一次 `docker build --progress=plain -t local/refine-memory-proxy:9e456a5-auth-fix <context>`：exit 0，耗时 `463.3s`；没有 `--pull`、并发或 retry。构建 history 已检查；没有传入模型或用户 secret。

新镜像的离线检查均使用 `--network none`，没有连接业务服务：

- `Config.User=app`，实际 UID `10001`。
- auth focused `3/3`；fresh full `38/38` suites、`276/276` tests。
- `better-sqlite3`、`node-pty`、public cost-guard stub、`tsx` 与 `tini` 均存在并满足固定检查。
- 镜像内两个 shell script 均通过 `sh -n`。
- typecheck 仍精确保留上述 6-error baseline，不标为 Passed。

## Root pin 与静态验证

root TDD 先把测试期望前移到新 product SHA 与 tag/digest：旧 Compose/index 得到确定性 RED `7 passed / 2 failed`。最小更新 Compose pin 与 gitlink 后，focused 为 `9/9`；fresh root Node 为 `151/151`，base + `mock`、`real`、`claude`、`opencode`、`pi`、`management` Compose config 为 `7/7`。这些结果只证明 static/contract，不是业务 runtime。

## 明确未运行

- replacement image 下的 deterministic Mock rerun：**Not Run**。
- 24 个 protocol/leak cases、management/outsider、三次顺序写入、六次跨 owner 读取、final oracle 与三个真实 CLI headless：**Not Verified**。
- TUI、真实/Paid 模型、真实 API 与 Codex Stage 2：**Not Run**。
- 未启动 business stack，未读取 Tencent `.env`、settings、home、secret、`.runtime/` 或 raw evidence；未执行 image/container/volume cleanup、`down`、prune、push 或 PR。

## 下一 Gate

replacement Proxy image 已 **Ready**。下一步只能在新的唯一 run/project/evidence tuple 下重跑固定 17 步 deterministic Mock；旧 Blocked projects 与文档继续作为 append-only 历史。完整 Mock Gate 通过前不得进入 TUI 或真实模型。
