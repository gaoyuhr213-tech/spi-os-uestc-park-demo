/* V3 波次四 · Decision Marketplace 商品目录
   对标：Salesforce AppExchange / ServiceNow Store。
   六类商品：Decision Playbook / AI Agent / Workflow / Industry Graph / Scenario Package / Decision Template。
   当前目录 = 平台已沉淀能力的商品化封装（真实引擎映射），状态分 live（本园区已运行）/ packaged（可复制交付）。 */

export interface MarketItem {
  mid: string;
  category: "playbook" | "agent" | "workflow" | "graph" | "scenario" | "template";
  categoryLabel: string;
  name: string;
  desc: string;
  contains: string[];        // 包含物
  buyer: string;             // 目标买家
  pricing: string;           // 定价模式【假设】
  status: "live" | "packaged";
  engine: string;            // 底层引擎映射
}

export const MARKET_CATALOG: MarketItem[] = [
  {
    mid: "pb-talent", category: "playbook", categoryLabel: "Decision Playbook",
    name: "园区人才服务 BD 打法包",
    desc: "从信号识别到成交回填的完整打法：双轴评分 → 暖引荐路径 → 话术模板 → 90 天漏斗",
    contains: ["12 维评分规则集", "四路径引荐 SOP", "双模板话术库", "90 天转化漏斗看板"],
    buyer: "园区运营方 / 人服机构", pricing: "按园区订阅 · 12 万/年【假设】", status: "live",
    engine: "ruleEngine + referral + funnel",
  },
  {
    mid: "ag-scout", category: "agent", categoryLabel: "AI Agent",
    name: "Scout 信号侦察 Agent",
    desc: "企业公开信号持续扫描与衰减管理，产出带置信度的信号流水",
    contains: ["信号流水线", "衰减模型", "Tier-1 信号告警"],
    buyer: "招商局 / 产业集团", pricing: "按企业数计费 · 200 元/家·年【假设】", status: "live",
    engine: "signalPipeline",
  },
  {
    mid: "ag-decision", category: "agent", categoryLabel: "AI Agent",
    name: "Decision 决策生成 Agent",
    desc: "五类决策自动生成（联系/导师/HR服务/政策/暖引荐），九要素可解释卡",
    contains: ["决策引擎", "九要素 Provenance", "反事实分析"],
    buyer: "园区决策层", pricing: "按决策量阶梯【假设】", status: "live",
    engine: "decisionEngine + decisionEngine2",
  },
  {
    mid: "wf-loop", category: "workflow", categoryLabel: "Workflow",
    name: "Decision Loop 闭环工作流",
    desc: "Signal→Evidence→Decision→Execution→Outcome→Learning 全链状态机与台账",
    contains: ["决策状态机", "容量扣减", "Outcome 强制回填", "学习飞轮"],
    buyer: "园区运营方", pricing: "随平台订阅附带", status: "live",
    engine: "decisions 状态机 + flywheel",
  },
  {
    mid: "gr-uestc", category: "graph", categoryLabel: "Industry Graph",
    name: "电子信息产业关系图谱（成都）",
    desc: "校友/供应链/投资/协会四类关系边 + What-if 传导计算",
    contains: ["35+ 节点图数据", "BFS 链路推演", "五维 What-if 引擎"],
    buyer: "投资机构 / 产业集团", pricing: "数据订阅 · 8 万/年【假设】", status: "live",
    engine: "graphData + graphCompute",
  },
  {
    mid: "sc-lowalt", category: "scenario", categoryLabel: "Scenario Package",
    name: "低空经济场景包",
    desc: "需求标签×行业×意图×决策类型的场景定义，数据接入即激活",
    contains: ["场景定义 JSON", "KPI 口径", "决策问题模板", "资源类型清单"],
    buyer: "其他园区 / 招商局", pricing: "场景包 · 3 万/个【假设】", status: "packaged",
    engine: "scenarioEngine（扩展位）",
  },
  {
    mid: "tp-report", category: "template", categoryLabel: "Decision Template",
    name: "月度经营决策报表模板",
    desc: "按成员/资源/决策类型的成交与转化汇总，Excel 一键导出",
    contains: ["三维聚合口径", "金额 ROI 模型", "Excel 模板"],
    buyer: "园区管理层", pricing: "随平台订阅附带", status: "live",
    engine: "buildMonthlyReport",
  },
  {
    mid: "tp-pitch", category: "template", categoryLabel: "Decision Template",
    name: "暖引荐话术模板库",
    desc: "正式版/轻量版双模板，按路径×信号×富集字段自动拼装",
    contains: ["双模板引擎", "字段插槽", "一键复制"],
    buyer: "BD 团队", pricing: "随打法包附带", status: "live",
    engine: "pitch 生成器",
  },
];

