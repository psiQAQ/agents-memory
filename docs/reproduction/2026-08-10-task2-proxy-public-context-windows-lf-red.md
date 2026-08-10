# Task 2 Proxy public-context Windows LF RED

## Status

**Failed / Blocked**。固定 upstream 提供的 `deploy/dockerhub/publish.sh` 无法在当前 Windows checkout 通过 Bash 运行；失败发生在 public Proxy context 准备前。本记录保留修复前 RED，后续结果不得覆盖。

## Fixed inputs

- Tencent commit: `0a568c328ea1aae3f22ed3656e7900da7ea565c1`
- Script: `deploy/dockerhub/publish.sh memory-proxy`
- Mode: `DRY_RUN=1`，只准备/扫描 context，不 build、不 push
- Version: `0a568c3-task2`
- Unique context target: `.task2-build-contexts/proxy-0a568c3`（运行前不存在）
- Bash: WSL `/bin/bash 5.2.21`

没有传入或读取模型 key、Tencent ignored `.env`、settings、home 或 runtime evidence。

## RED

```text
DRY_RUN=1 VERSION=0a568c3-task2 bash deploy/dockerhub/publish.sh memory-proxy
exit code: 1
deploy/dockerhub/publish.sh: line 24: $'\r': command not found
deploy/dockerhub/publish.sh: line 25: set: pipefail\r: invalid option name
```

`git ls-files --eol` 与字节检查显示 repository/index 是 LF，但 Windows worktree 将本轮所需 shell scripts checkout 为 CRLF；upstream tree 没有 `.gitattributes` 为 Bash scripts 固定 `eol=lf`。因此 public-context 生成器在解析阶段稳定失败，没有创建 context，也没有启动 Proxy Docker build。

## Boundary

- 这是与缺失 cost-guard 内容不同的第二个 RED：前者阻塞原目录 Dockerfile，本文阻塞 upstream 已有的 public stub/context 路径。
- 未修改产品源码，未迁移 legacy commit。
- 未启动 Hub build、业务栈、监听端口或真实 API。
- 未执行 push、PR、remote 修改、`down -v` 或 prune。
