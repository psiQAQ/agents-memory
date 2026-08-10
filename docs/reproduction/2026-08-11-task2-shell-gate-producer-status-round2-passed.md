# Task 2 Shell Gate fix round 2：producer status Passed

## 结论

**Static/Runtime Gate Passed（shell enumeration only）**。产品提交 `c400a6f04bf0850583de99194bbe9e506da1cfe6` 修复了 tracked-shell producer 部分输出后 nonzero 状态被 process substitution 丢失的问题。Gate 现在先把完整 NUL manifest 写入临时文件，显式要求 producer 成功，再由主 shell 读取；失败只输出固定消息，不消费部分 manifest 或透传 producer 路径细节。

本轮没有修改 Core/Proxy 产品源码、Dockerfile、runtime shell 或 build-context 生成器，因此无需重建镜像。服务、Mock、真实 API、TUI 与跨客户端业务流仍为 **Not Run**。

## RED

行为回归通过 PATH 注入 fake `git`：`rev-parse` 成功，`ls-files -z` 输出一个合法 NUL 路径后向 stderr 写入私有诊断并 exit 7。修复前 Gate 实际结果：

```text
tracked=1 crlf_failures=0 syntax_failures=0
exit=0
```

因此 `tracked == 0` 只能拦截完全无输出，不能证明枚举完整；回归测试在旧实现上精确 Failed：

```text
partial tracked-shell enumeration must fail
exit=1
```

## GREEN

最小修复：

1. `mktemp` 创建 NUL manifest，`trap` 在 EXIT 删除。
2. `tracked_shells` 完成并返回 0 后才进入读取循环。
3. producer nonzero 时丢弃 partial manifest，输出固定 `tracked shell enumeration failed` 并 nonzero；producer stderr 不透传。
4. `while` 通过普通文件重定向在主 shell 运行，保留计数状态。

验证结果：

| 检查 | 结果 |
| --- | --- |
| partial NUL output + producer exit 7 | Rejected；回归 exit 0，固定输出约束 Passed |
| Git Bash normal path | `tracked=23 crlf_failures=0 syntax_failures=0` |
| WSL native Git | `tracked=23 crlf_failures=0 syntax_failures=0` |
| WSL 强制 `git.exe` fallback | `tracked=23 crlf_failures=0 syntax_failures=0` |
| Gate 与 regression `bash -n` | Passed |
| EOL | `.sh`、`.bash` 与 `.gitattributes` 均 `i/lf w/lf` |

## 镜像证据保持有效

`49c4536...c400a6f` 只包含 `.gitattributes`、Shell Gate 和 Gate regression。Core/Proxy Dockerfile、产品源码、runtime shell 与 build-context 生成器没有 blob 变化；新增 `.bash` 测试不属于 tracked `*.sh` 镜像输入，新增 attribute 只固定该测试的 Windows checkout EOL。因此 round 1 的镜像内容与构建输入没有变化，以下 immutable IDs 继续有效：

- Core：`sha256:fded9d48d76bf71d0652023be0e9aa5553d46c039cc04ace0ec7c1e370f95d44`
- Proxy：`sha256:14acf3c7d04b1b701159193b79e9989656f83d0ad24018cafcb37c1c171468aa`
- Hub（本轮同样未重建）：`sha256:a60377245cb4cfff6f5769910ff3a7f4b2fa7b0b64a756a69bf2c552408c44e4`

旧 reproduction 均未修改；本记录只补充 Gate 自身的 fail-closed 证据。

## 安全边界

- 未读取 `.env`、settings、secret、home、`.runtime/` 或原始 evidence。
- 未执行 Docker build、启动业务栈、Mock、真实 API、TUI 或端口探针。
- 未 push、建 PR、修改 remote、执行 `down -v`、prune 或 destructive cleanup。
