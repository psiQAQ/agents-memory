# agents-memory：企业 Agent 记忆方案调研

本仓库是企业 Agent 记忆方案的文档型知识库，保存调研、项目参考、设计和方法论。它不承载产品源码、Docker 编排、客户端配置或可执行实验。

目标是形成可持续更新的证据链，回答：哪些记忆机制值得采用、它们如何受身份与项目关系约束、以及怎样以 Git 和治理流程降低长期风险。

## 从这里开始

1. 阅读 [文档索引](docs/README.md)，按问题进入对应主题。
2. 阅读 [负责人原则](docs/foundations/owner-principles.md) 和 [调研方法](docs/foundations/research-methodology.md)。
3. 需要对比外部项目时，使用 [项目参考](docs/references/projects/)；需要形成结论时，使用 [报告模板](docs/templates/research-report-template.md)。
4. 查阅已结束的 2026-08 实验时，只能从 [历史归档](docs/history/integration-lab-2026-08/README.md) 进入。

## 文档状态

| 状态 | 说明 |
| -- | -- |
| Active | 当前用于调研、比较或设计的材料。 |
| Snapshot | 有明确来源、日期和版本边界的静态观察。 |
| Historical | 已结束工作的记录，只供追溯，不是当前执行依据。 |

## 持续更新

- 新主题报告放入 `docs/research/reports/`，新项目分析放入 `docs/references/projects/`。
- 每份新材料必须记录来源、检查日期、版本边界、Fact / Inference / Recommendation 和局限。
- 外部源码、部署或运行验证应在其各自仓库完成；本仓库只保存脱离运行环境仍可阅读的调研与结论。

项目演变见 [历史时间线](docs/history/project-timeline.md)。
