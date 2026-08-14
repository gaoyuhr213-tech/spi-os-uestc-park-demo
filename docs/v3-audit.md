# SPI-OS V3 产品审计报告 · Decision Intelligence OS

**审计基准**：Palantir Foundry（Ontology/Decision Provenance/Simulation）、Salesforce Agentforce（Autonomous Agent/Action-First）、ServiceNow AI Platform（Workflow Closure/Policy Engine）、6sense（Intent→Evidence→Action）、Microsoft Fabric / Databricks / Snowflake Cortex（Data-AI Fabric）。
**审计对象**：当前 V2.0（迭代15 · a9a35458），9 页面 / 18 后端模块 / 102 测试。
**总判断**：V2 已完成「决策对象化」（decisions 表 + 状态机 + ROI + 飞轮），但仍是**企业中心 + 单卡决策**架构；距 Decision Intelligence OS 缺五大件：Scenario OS、Evidence Graph、Graph 计算引擎、Simulation、Multi-Agent/Marketplace。

---

## 一、七视图审计

### ① Information Architecture（现状 → 问题）
```
现状：决策中心 → 屏一健康看板 → 屏二线索雷达 → 屏三暖引荐 → 任务 →（管理员）规则/资源库
```
**问题 P0-IA-1**：入口仍是「页面导航」而非「场景导航」——招商专班、人才服务、基金对接的用户走同一条动线，无 Scenario Workspace。
**问题 P1-IA-2**：决策中心与屏二职责重叠（都在做线索→行动），Decision Card 分散在两处，认知负荷高。
**问题 P1-IA-3**：管理域（规则/资源/台账）与作业域混在同一侧栏层级，缺「工作台 / 治理」分区。

### ② User Journey
现状动线：登录 → 看 KPI → 翻名单 → 打开企业360 → 复制话术 → 出门拜访 → 回来标记状态。
**问题 P0-UJ-1**：Journey 的起点是「看信息」，不是「领任务/领决策」。北美范式（Agentforce/6sense）：登录即见「今天系统替你做了什么 + 需要你拍板什么」。
**问题 P2-UJ-2**：跨页上下文丢失——从决策卡跳企业360再回来，筛选状态不保留。

### ③ Decision Journey（核心视图）
```
现状：Signal → Score → Decision(5类) → Adopt → Execute → Outcome → Flywheel建议
缺口：            ↑Hypothesis缺失        ↑Risk/Impact缺失      ↑Policy Update断链
```
**问题 P0-DJ-1**：Decision Card 只有 4 要素（原因链/星级/资源/状态），缺 Confidence、Risk、Impact、Counterfactual、Learning 引用——不满足九要素标准。
**问题 P0-DJ-2**：Learning 未参与下一次决策——飞轮建议需人工「应用」，且只校准评分权重，不校准决策生成规则本身（Policy Update 断链）。
**问题 P1-DJ-3**：无 Decision Provenance 单链视图：97 分 → 哪些证据 → 哪些规则 → 哪些 AI → 哪些人工 → 置信度，目前分散在 4 个 Tab。

### ④ Data Flow
```
现状：楼层索引/Excel/解析 → enrichments/signals → ruleEngine(12维) → decisions → outcomes → flywheel
```
**问题 P1-DF-1**：单向管道，无「结果数据回流到证据层」——成交/流失没有变成新 signal 参与下一轮评分。
**问题 P2-DF-2**：graphNodes/graphEdges 只服务屏三可视化，未进入评分与决策数据流。

### ⑤ AI Flow
**问题 P1-AI-1**：AI 仅两处（解析抽取、AI 助手问答），推荐主链路是纯规则。缺「规则 × AI 混合判断 + 分渠道置信度」。
**问题 P2-AI-2**：AI 助手回答不引用组织记忆（台账/解析历史/决策历史），是无状态问答。

### ⑥ Agent Flow
**问题 P0-AG-1**：无 Agent 概念。现有自动化（决策生成/预测/飞轮）是函数调用，无职责边界、无运行日志、无协作链，不可展示不可审计。

### ⑦ Scenario Flow
**问题 P0-SC-1**：完全缺失。系统只有一个隐含场景（园区招商-人才服务）；产业招商、企业培育、产业基金、低空经济等场景无法开箱表达，也无法打包复制给下一个园区（商业模式断点）。

---

## 二、问题清单（P0/P1/P2）

| 级别 | 编号 | 问题 | 对标差距 |
|---|---|---|---|
| P0 | DJ-1 | Decision Card 四要素 → 需九要素 | Palantir Decision Provenance |
| P0 | DJ-2 | Learning 不参与下次决策（Policy Update 断链） | Foundry Learning Loop |
| P0 | SC-1 | 无 Scenario OS，企业中心而非场景中心 | Foundry Workspace / 6sense Segments |
| P0 | AG-1 | 无 Multi-Agent 职责体系与运行日志 | Agentforce Autonomous Agents |
| P0 | IA-1 | 首页是 Dashboard 而非 Scenario | ServiceNow Workspaces |
| P0 | UJ-1 | Journey 起点是看信息而非领决策 | Agentforce "Work queue first" |
| P1 | DJ-3 | 无 Decision Provenance 单链视图 | Foundry Provenance |
| P1 | GR-1 | Graph 是可视化不是计算引擎（无 What-if） | Foundry Operational Graph |
| P1 | SM-1 | 无 Simulation（政策/招商/资源推演） | Foundry Scenario Simulation |
| P1 | NS-1 | 北极星单指标（决策数）→ 需 Decision Health 五维 | 北美 Decision Health 趋势 |
| P1 | AI-1 | 推荐主链路纯规则，无混合置信度 | 6sense AI+Rules 混合 |
| P1 | DF-1 | Outcome 不回流证据层 | Databricks feedback loop |
| P1 | MM-1 | Memory 是 Timeline 不是 Organizational Memory | Gong/Foundry Memory |
| P2 | MK-1 | 商业模式缺 Marketplace 网络效应层 | ServiceNow Store / AppExchange |
| P2 | IA-3 | 作业域/治理域未分区 | 企业级 SaaS IA 规范 |
| P2 | UJ-2 | 跨页上下文不保留 | — |
| P2 | DF-2 | 图谱未进评分数据流 | — |
| P2 | AI-2 | AI 助手无记忆引用 | — |

---

## 三、重构后 IA（Scenario-First）

```
SPI-OS Decision Intelligence OS
├── 场景中枢 Scenario OS（新首页）
│   ├── 产业招商 Workspace（默认演示场景）
│   ├── 企业培育 / 人才服务 / 产业基金 Workspace（数据驱动，可扩展低空经济/冷链/跨境）
│   └── 每个 Workspace = 决策队列 + 场景 KPI + 关联企业/政策/资源/Agent
├── 决策中心（Decision Engine 2.0：九要素卡 + Provenance + Health 五维）
├── 情报作业（屏一看板 / 屏二雷达 / 屏三图谱 —— 降为支撑视图）
├── 推演中心 Simulation（Graph What-if + 招商/政策/资源模拟）
├── 记忆与 Agent（Organizational Memory 检索 + Agent 运行台）
├── 任务执行（承接决策）
└── 治理域（管理员）：规则中心 / 资源库 / Marketplace / 台账
```

**导航原则**：作业域（场景/决策/推演/任务）与治理域（规则/资源/市场）分区；Dashboard 三屏降级为「情报作业」子视图，不再是入口。

---

## 四、分波实施蓝图（映射十阶段）

| 波次 | 覆盖阶段 | 交付物 | 新增/改造 |
|---|---|---|---|
| 波次一 | 阶段三/四/九 + North Star | Decision Engine 2.0：九要素卡、Evidence/Provenance 链、Counterfactual、Outcome 回流、Decision Health 五维 | decisionEngine 升级 + DecisionCard 组件 + provenance API |
| 波次二 | 阶段一/二/七(Scenario) | Scenario OS：scenarios 表 + 场景引擎 + Workspace 首页 + IA 导航重组 | 新页面 Scenarios.tsx（首页）+ 导航分区 |
| 波次三 | 阶段五/六 | Graph 计算引擎（What-if 传导：税收/就业/产业链/面积/人才）+ Simulation Center | graphCompute.ts + Simulation.tsx |
| 波次四 | 阶段七/八/十 | Organizational Memory（统一记忆检索 + AI 引用）+ Multi-Agent 运行台（8 Agent）+ Decision Marketplace | memory.ts + agents.ts + Marketplace 页 |

**Hard Constraints 落实**：无装饰动画；每个新模块回答「帮助完成哪个决策」（见各波次交付说明）；所有 AI 推荐带证据链+置信度+下一步；导航重组减少上下文切换（场景内聚合企业/政策/资源，免跨页跳转）。

**演示数据口径**：What-if/Simulation 的税收/就业等系数为行业基准演示值（标注【假设】），接入真实财税数据后自动替换——保持与全站「演示值声明」一致的合规口径。
