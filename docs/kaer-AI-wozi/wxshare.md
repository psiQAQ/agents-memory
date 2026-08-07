分享2个让Codex和Claude跨机器共用记忆技巧刚买了第三台mac mini，是时候整理一下跨多台机器跨codex、claude code等Agent的记忆管理方案了。全部塞Agent.md的话上下文包爆炸的，你去X上搜会看到8月份Agent知识管理又多了很多词，分层记忆，时序图谱，Dreaming，CMEM，Mem0，Graphiti。

都安装下来发现重叠率太高，太难稳定在三台机器生效了。我烧了一周的codex额度做了个新方案，claude-mem负责本地记忆捕获，Mem0 负责跨设备共享。

claude-mem这个开源项目可以通过hook自动获取当前对话关键记忆，还可以筛选后再上传到远程的mem0，附上项目id，这样无论我是在MacBook上用Claude，还是换到Mac mini上打开Codex，Agent都会查询到当前项目的共享记忆，知道这个项目是啥，之前为啥这样设计，不用从头解释。

🔗 github. com/thedotmack/claude-mem
🔗 mem0. ai

第一次给Agent做知识管理的话，就把这提示语丢给codex，

【
搭建一套claude-mem本地捕获+Mem0跨机器跨Agent共享的记忆系统。

目标：
- 每台机器分别使用claude-mem记录本地会话。不复制或同步claude-mem.db。
- 只把架构决策，稳定偏好，重要发现和已验证的Bug修复上传到同一个Mem0账户。
- ClaudeCode和Codex都能通过Mem0MCP 检索这些共享记忆。
- Git同步代码，handoff同步当前进度，Mem0负责保存为什么和怎么做。

按以下步骤执行：
1. 审计本机的ClaudeCode，Codex，claude-mem，Mem0 MCP，Hook和数据库状态。
2. 安装或修复claude-mem，并验证新会话真的能生成observation。
3. 为ClaudeCode和Codex配置Mem0 MCP。
4. 确定一个所有机器共用的稳定user_id。

5. 建立claude-mem→Mem0的增量同步：
- 只同步decision、bugfix、discovery；排除临时进度、原始日志、未确认计划和敏感信息；
- 每条记忆带project、source_device、obs_id和唯一来源键；使用独立游标、文件锁、失败重试、dry-run和脱敏日志；
- 默认从当前最新observation开始，未经确认不得回填历史数据。

6. 检索规则预设
优先按user_id+metadata.project搜索，使用 top_k=5、threshold=0.4、rerank=true；项目找不到时才回退一次到用户级搜索。

7. 完成至少一次本地、跨Agent和跨机器盲测。
】

其实7月底，claude-mem还发布了cmem远程服务，比MEM0更原生支持跨设备同步。但我是真怕啊，同步范围会包括完整提示语的，也就是还没公开的项目信息或者临时贴进对话的材料都会同步到云端，

GPT-review:

这篇分享的核心思路其实和你前面调研的企业 Agent Memory 架构高度一致，但它针对的是**个人开发者多设备 Agent 协作场景**。我认为其中有几个非常值得吸收，也有几个风险点需要修正。

先给结论：

> “claude-mem 本地捕获 + Mem0 选择性共享”目前比“完整云端同步记忆”更符合工程实践。
> 关键不是同步记忆，而是建立一个 **Memory Firewall（记忆防火墙）**，决定什么能跨设备共享。

---

# 1. 这个方案本质架构是什么？

它实际上拆成两个不同职责：

```
                 本地机器A
              Claude Code
                  |
                  |
            claude-mem
                  |
          local observation DB
                  |
                  |
          Memory Filter
                  |
                  |
                Mem0
                  |
        -------------------
        |        |        |
    MacBook   Mac mini   Server

             |
       Claude Code / Codex
```

职责分离：

| 系统         | 负责什么    | 不负责什么    |
| ---------- | ------- | -------- |
| claude-mem | 捕获发生过什么 | 不负责长期知识  |
| Mem0       | 共享长期知识  | 不保存完整上下文 |
| Git        | 代码状态    | 不保存决策原因  |
| handoff文档  | 当前任务状态  | 不保存长期经验  |

这个划分是正确的。

---

# 2. 为什么不能把所有东西放 AGENTS.md？

这个判断非常正确。

很多 Agent 初期设计：

```
AGENTS.md

+
README

+
RULES

+
所有经验

+
所有Bug

```

最后结果：

```
Context Window:

50%规则
30%历史
20%真正任务
```

Agent性能下降。

原因：

LLM上下文不是数据库。

它适合：

* 当前约束
* 当前任务规则
* 少量高价值事实

不适合：

* 历史日志
* 大量经验
* 项目演化过程

---

# 3. claude-mem + Mem0 分工是否合理？

我认为合理，但需要修改一个地方：

不要：

```
claude-mem
    |
    |
    v
Mem0
```

直接同步。

应该：

```
claude-mem

    |
    |
Memory Extractor

    |
    |
Memory Firewall

    |
    |
Mem0

```

中间必须有过滤层。

---

# 4. 什么应该上传 Mem0？

建议采用四分类：

## A. Architecture Decision（必须上传）

例如：

```
项目选择PySCF作为量化计算后端。

原因：
1. Python生态最好
2. 开源许可友好
3. 与Blender pipeline兼容

日期：
2026-07-20

来源：
ADR-0042
```

价值：

★★★★★

---

## B. Debug Knowledge（必须上传）

例如：

```
Ubuntu 26.04下fcitx5无法启动原因：

缺少fcitx5-frontend-gtk3。

解决：

apt install xxx

```

价值：

★★★★★

---

## C. User Preference（可以上传）

例如：

```
用户喜欢：
- 中文回答
- 代码先给完整版本
- 注释写在代码前

```

价值：

★★★★

---

## D. Temporary State（禁止上传）

例如：

```
正在修改Wave3
剩余14个task
今天准备修复MOL2

```

不要上传。

原因：

一天后过期。

---

# 5. 关于 claude-mem cmem 云同步的担忧

你的担忧是合理的。

最大的风险：

## Prompt leakage（提示词泄露）

如果同步：

```
完整conversation

+
system prompt

+
tool调用

+
用户输入

```

风险非常高。

尤其企业环境：

可能包含：

* 未发布产品信息
* 客户资料
* 源代码片段
* 内部架构
* 商业计划

---

所以：

## 云端Memory必须是"知识化后的摘要"

不要：

```
Conversation

↓

Cloud

```

应该：

```
Conversation

↓

Extraction

↓

Sanitized Memory

↓

Cloud

```

---

# 6. 每条共享Memory建议Schema

不要只存：

```
text
```

至少：

```json
{
"id":"mem_001",

"content":
"选择PySCF作为量化后端",

"type":
"architecture_decision",

"project":
"ChemBlender",

"source":
"claude-mem",

"device":
"MacMini-01",

"confidence":
0.95,

"created":
"2026-08-01",

"expires":
null,

"visibility":
"team",

"provenance":
"conversation_20260801_xxx"
}
```

---

# 7. Codex + Claude Code 共用记忆最佳实践

我建议：

## Git负责：

```
What

代码是什么
配置是什么
接口是什么
```

---

## Memory负责：

```
Why

为什么这么设计
为什么不用另一个方案
踩过什么坑
```

---

## Handoff负责：

```
Now

现在做到哪里
下一步是什么
```

形成：

```
                Project Knowledge


        Git        Memory       Handoff

       What          Why          Now

```

这是目前最稳定的Agent协作模型。

---

# 8. 如果用于公司团队，需要进一步改造

个人方案：

```
claude-mem
    |
Mem0
```

企业方案：

```
                Agent

                  |

          Memory Gateway

                  |

      ----------------------

      |          |          |

 Project     User      Organization


      |

 Permission Layer


      |

 Memory Store

```

增加：

* 权限
* 审计
* 脱敏
* owner审批

---

# 9. 对你前面公司级调研的补充

这篇文章补充了一个非常重要的实践：

> Memory 不应该由 Agent 自己维护，而应该由独立 Memory Agent 捕获。

也就是：

错误：

```
Agent回答
 |
决定是否记忆
```

容易污染。

正确：

```
Agent工作

↓

Memory Observer

↓

Memory Candidate

↓

审核

↓

Long-term Memory

```

类似人类：

经历 → 反思 → 形成经验。

---

# 10. 如果让我设计你公司的第一版

我不会直接上 Mem0。

建议：

## V1

```
Git

+
AGENTS.md

+
ADR

+
handoff.md

+
memory.jsonl

```

---

## V2

增加：

```
Memory Extractor

+
Postgres

+
pgvector

```

---

## V3

再考虑：

```
Graphiti

Neo4j

Mem0

```

---

原因：

很多企业过早上 Graph Memory，最后发现：

90%的知识其实应该进入：

* 文档
* Git
* ADR

而不是图谱。

---

# 最终评价

这篇方案里面最值得保留的是：

1. **本地捕获，云端精选**
2. **不同设备不共享原始memory数据库**
3. **Mem0作为跨Agent共享层**
4. **Git同步代码，Memory同步Why**
5. **handoff同步当前状态**

需要修正的是：

1. 不要直接 claude-mem → Mem0
2. 必须增加 Memory Firewall
3. 云端禁止保存完整conversation
4. 所有Memory必须带 provenance
5. 临时状态和长期知识必须分离

如果落地到企业环境，这个方案可以演化成：

> Local Agent Observer + Enterprise Memory Gateway + Governed Knowledge Graph

这比单纯“AI记忆库”更接近未来企业 Agent 基础设施。
