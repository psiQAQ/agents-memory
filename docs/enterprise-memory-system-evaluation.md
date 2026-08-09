# 企业智能体记忆系统评估

**评估状态：** Static；运行验证为 Not Run
**更新时间：** 2026-08-09

本页是管理者与开发者的主评估入口：把架构假设、已验证证据、风险与下一步集中在同一处。详细设计见 [企业记忆管理方案](design/2026-08-06-enterprise-memory-design.md)，本轮实施范围见 [Docker-first 规格](specs/2026-08-09-docker-memory-lab.md) 和 [决策记录](decisions/2026-08-09-docker-memory-lab.md)。

> **记忆治理**：让知识写入、检索、共享、失效和追溯都受权限与审查约束，而不是把全部对话直接存入共享库。

```mermaid
flowchart TD
  A["开发任务与对话"] --> B["受权限约束的记忆服务"]
  B --> C["项目级可追溯知识"]
  C --> D["检索、评审与反馈"]
  D --> E["更新后的治理规则"]
  E --> B
```

这表示企业价值来自受控的知识循环：系统先判断谁能看到什么，再把可追溯的项目知识提供给合适的任务；管理者以证据决定是否扩大使用范围。

## 状态矩阵

| 评估项 | 状态 | 当前证据 | 不能证明的内容 |
| -- | -- | -- | -- |
| 架构和权限模型 | Static | 现有设计、Docker-first 规格与 ADR | 实际服务端 ACL 行为 |
| 默认 Mock 编排 | Not Run | 配置目标已定义 | Compose 解析、镜像构建和业务探针 |
| Windows 10 原生 Claude + Docker Linux Claude | Not Run | 客户端隔离与 Proxy 契约已定义 | 两客户端读写与身份隔离 |
| Codex / WSL / Win11 / LAN | Deferred / Not Run | 不在当前批准范围 | 跨客户端共享、Win11 和局域网行为 |
| 真实 DeepSeek 路径 | Blocked / Not Run | 显式 Gate 与秘密边界已定义 | 协议兼容、质量、延迟和费用 |
| 效率评分 | Not Rated | 尚无 10 组成对任务 | 生产力收益或 ROI |

## 风险与控制

| 风险 | 控制 | 状态 |
| -- | -- | -- |
| 模型 key 泄漏到配置、日志或报告 | 工作区外 secret、脱敏模板、忽略规则与 Gate | Static |
| 默认运行产生付费或访问外网模型 | 默认 Mock；真实层需显式 profile 与 Gate | Static |
| DeepSeek Anthropic 内容类型不兼容 | 以 Mock 契约和后续真实 Gate 分别记录 | Not Run |
| 统一费用硬上限缺失 | Gate 要求预算和 turn 上限，但尚未实现/验证 | Not Run |
| Public fork 变更不可审查 | 通用修复独立提交；当前未推送 | Not Run |

## 评分与后续证据

目前不得给出效率或 ROI 分数。后续至少收集 10 组成对任务，并同时记录任务类型、耗时、成功率、人工介入、检索命中、权限拒绝、费用和失败原因；在此之前保持 **Not Rated**。

优先顺序为：先验证 Docker 与默认 Mock 的端到端业务探针，再验证 Windows 10 原生 Claude 与 Docker Linux Claude 的隔离和共享，最后在用户提供工作区外新 secret 后执行受限真实 DeepSeek Gate。Codex、WSL、Win11 和 LAN 另行排期。每次结果应新增可复核的 reproduction 记录，不以 health check 代替业务流证据。
