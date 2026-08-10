# 2026-08-09 Docker Compose 安全 Gate 静态复验勘误

> **Gate**：受控操作前执行的检查；任一检查失败就拒绝执行。

> **Attestation**：宿主预检后交给容器复核的短期 JSON 记录，不是带签名的加密证明。

- 类型：Append-only erratum；不是一次新的实验运行
- 原记录：`2026-08-09-docker-compose-security-gates-static.md`
- 原验证对象：`1b3ecc34e3aada52f04f63375d3057685dd8a752`
- 原验证结果：45/45 Passed；本勘误不改变测试结果

## 更正

原记录第 24 行“attestation 篡改均 fail-closed”的表述过宽。准确边界是：在宿主账户、Compose 启动环境和实验证据目录可信的前提下，Gate 会拒绝与当前批准字段不一致或已经过期的记录。

当前 attestation 没有签名或消息认证码，不能抵御能同时改写记录、启动环境和挂载参数的本地操作者，也不应作为第三方可验证的防伪证明。详细决策见 `docs/decisions/2026-08-09-attestation-trust-boundary.md`。

原记录保持不变，以保留实验发生时的完整证据；后续评估必须同时引用本勘误。
