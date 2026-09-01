# agents-memory 工作规则

本仓库是企业 Agent 记忆方案的**文档型调研仓库**。根目录没有产品源码、可执行实验、Docker 编排、客户端运行配置或 submodule。

## 工作目标

- 维护可追溯的 Agent 记忆调研、项目参考和企业方案设计。
- 以身份、项目披露、记忆价值和 MCP 接入为核心约束；修改基本思想前先阅读 [负责人原则](docs/foundations/owner-principles.md)，并取得负责人确认。
- 把外部项目的当前实现、部署和运行验证留在外部源码或部署仓库；这里只记录可脱离运行环境阅读的结论与来源。

## 阅读顺序

1. 从 [docs/README.md](docs/README.md) 定位主题。
2. 阅读 [调研方法](docs/foundations/research-methodology.md)，确认状态和来源边界。
3. 研究外部项目时阅读对应项目参考；设计工作再阅读 [企业记忆方案](docs/design/enterprise-memory-design.md)。
4. 只有追溯历史时才进入 [history/](docs/history/)；不得把其中结果写成当前运行事实。

## 文档纪律

- 默认中文；代码、API、变量名、路径和必要术语保留英文。
- 每份新 Active 或 Snapshot 文档必须写明：更新日期、问题范围、来源、版本边界、关联文档、Fact、Inference、Recommendation 和待验证项。
- 外部源码分析必须记录仓库 URL 与检查日期；若引用代码行为，还必须记录 branch、tag 或 commit。
- 旧版本、厂商自报数据、单次实验和二手资料不得外推为通用事实。
- 目录按内容类型组织：`foundations/`、`research/reports/`、`references/projects/`、`design/`、`templates/` 和 `history/`。新增材料须同步更新 [docs/README.md](docs/README.md)。
- 新报告使用 [调研报告模板](docs/templates/research-report-template.md)；Markdown 相对链接必须在变更后校验。

## 明确禁止

- 不在本仓库新增或恢复产品源码、Docker Compose、运行脚本、测试代码、客户端 settings 或 submodule。
- 不在本仓库执行外部产品的部署、付费模型调用、客户端接入或运行时验证。
- 不把历史 `four-agent-memory-upstream`、历史 fork commit 或 2026-08 Mock 实验结论表述为当前实现状态。
- 不修改外部源码仓库的 branch、tag、remote 或工作树，除非用户单独明确授权。

## Git

- 修改前检查工作树，保留无关变更。
- 逻辑完整的文档整理使用独立 commit；未经明确授权不得 push。
- 删除文件或重组目录前确认目标路径；历史材料优先移动到 `docs/history/`，不删除其内容。
