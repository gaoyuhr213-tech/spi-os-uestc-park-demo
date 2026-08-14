/* V3 波次四 · Multi-Agent 注册表与运行台
   对标：Salesforce Agentforce Agent Builder / ServiceNow AI Agents。
   8 个 Agent 的职责/输入/输出/协作关系显式注册；当前实现映射到既有引擎模块
   （规则/预测/图谱/决策/飞轮），状态=运行中；未接入的标注 planned。
   人在环约束：所有 Agent 只产出建议，采纳/执行/回填必须人工确认（宪法 P4）。 */
import { getDb } from "./db";
import { decisions, opsLedger, parseHistory } from "../drizzle/schema";
import { desc } from "drizzle-orm";

export interface AgentDef {
  aid: string;
  name: string;
  nameEn: string;
  role: string;              // 职责
  inputs: string[];          // 输入
  outputs: string[];         // 输出
  collaborators: string[];   // 协作 Agent
  engine: string;            // 当前映射引擎模块
  status: "running" | "planned";
  loopStage: string;         // 在 Decision Loop 中的位置
}

export const AGENTS: AgentDef[] = [
  {
    aid: "scout", name: "侦察 Agent", nameEn: "Scout Agent",
    role: "持续扫描企业公开信号（招聘/扩张/融资/股改），产出带置信度的信号流水",
    inputs: ["楼层索引", "公开招聘数据", "企查查/工商快照（人工回填通道）"],
    outputs: ["signals 信号流（来源/置信度/衰减）"],
    collaborators: ["research", "industry"], engine: "signalPipeline.ts + 信号衰减模型", status: "running", loopStage: "Signal",
  },
  {
    aid: "research", name: "研究 Agent", nameEn: "Research Agent",
    role: "对单企业做情报富集与解析（L1/L2 十二字段），写入带溯源的证据库",
    inputs: ["原文粘贴/Excel 导入", "信号流水"],
    outputs: ["enrichments 富集档案", "parseHistory 解析快照（字段级溯源）"],
    collaborators: ["scout", "execution"], engine: "LLM 解析（parseIntel）+ parseHistory.ts", status: "running", loopStage: "Evidence",
  },
  {
    aid: "industry", name: "产业 Agent", nameEn: "Industry Agent",
    role: "维护产业图谱与集聚分析，回答 What-if 产业链传导",
    inputs: ["graphNodes/graphEdges 图数据", "行业系数库"],
    outputs: ["引荐链路推演", "What-if 五维影响"],
    collaborators: ["investment", "policy"], engine: "graphData.ts + graphCompute.ts", status: "running", loopStage: "Evidence",
  },
  {
    aid: "policy", name: "政策 Agent", nameEn: "Policy Agent",
    role: "匹配政策窗口（高企/专精特新/股改），生成申报辅导决策与政策模拟",
    inputs: ["企业资质字段（专利/软著/高企）", "政策口径库【待接入】"],
    outputs: ["policy 类决策建议", "政策覆盖率模拟"],
    collaborators: ["industry", "execution"], engine: "decisionEngine.ts(policy) + simulatePolicy", status: "running", loopStage: "Decision",
  },
  {
    aid: "investment", name: "投资 Agent", nameEn: "Investment Agent",
    role: "识别融资/IPO 窗口企业，对接校友资本与产业基金",
    inputs: ["融资/股改信号", "产业基金资源池"],
    outputs: ["产业基金场景决策队列", "资本对接建议"],
    collaborators: ["industry", "review"], engine: "intents(ipo/funding) + 场景 fund", status: "running", loopStage: "Decision",
  },
  {
    aid: "execution", name: "执行 Agent", nameEn: "Execution Agent",
    role: "把已采纳决策转化为任务与话术，跟踪容量占用与执行节奏",
    inputs: ["adopted/executing 决策", "资源容量"],
    outputs: ["任务清单", "引荐话术", "分享卡片", "容量占用/释放"],
    collaborators: ["research", "review"], engine: "tasks 推演 + shareCard.ts + 容量扣减", status: "running", loopStage: "Execution",
  },
  {
    aid: "review", name: "复盘 Agent", nameEn: "Review Agent",
    role: "聚合 Outcome（成交/流失/金额），产出漏斗、ROI 与月度经营报表",
    inputs: ["决策 Outcome 回填", "stageEvents"],
    outputs: ["决策漏斗", "金额口径 ROI", "月度报表 Excel"],
    collaborators: ["execution", "learning"], engine: "buildDecisionRoi + buildMonthlyReport", status: "running", loopStage: "Outcome",
  },
  {
    aid: "learning", name: "学习 Agent", nameEn: "Learning Agent",
    role: "从结果反推评分/决策规则偏差，生成校准建议（人工确认后生效）",
    inputs: ["Outcome 明细", "决策类型命中率"],
    outputs: ["飞轮校准建议", "决策生成规则更新（人在环）"],
    collaborators: ["review"], engine: "flywheel.ts + 决策级学习统计", status: "running", loopStage: "Learning → Policy Update",
  },
];

/** Agent 运行台：注册表 + 近期活动（从台账/决策/解析推断各 Agent 的最近动作） */
export async function buildAgentBoard() {
  const db = await getDb();
  if (!db) return AGENTS.map((a) => ({ ...a, lastActivity: null as { ts: number; text: string } | null }));
  const [led, decs, parses] = await Promise.all([
    db.select().from(opsLedger).orderBy(desc(opsLedger.createdAt)).limit(200),
    db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(100),
    db.select().from(parseHistory).orderBy(desc(parseHistory.createdAt)).limit(50),
  ]);
  const lastActivity: Record<string, { ts: number; text: string } | null> = {};
  const set = (aid: string, ts: number | undefined, text: string) => {
    const t = ts ?? 0;
    if (!lastActivity[aid] || lastActivity[aid]!.ts < t) lastActivity[aid] = { ts: t, text };
  };
  for (const p of parses) set("research", p.createdAt?.getTime?.(), `解析写入 ${p.eid}`);
  for (const d of decs) {
    set("policy", d.dtype === "policy" ? d.createdAt?.getTime?.() : 0, `生成政策决策 ${d.eid}`);
    if (d.dtype === "referral") set("investment", d.createdAt?.getTime?.(), `生成引荐决策 ${d.eid}`);
    if (d.status === "executing" || d.status === "adopted") set("execution", d.updatedAt?.getTime?.() ?? d.createdAt?.getTime?.(), `跟进决策 ${d.title.slice(0, 30)}`);
    if (d.outcome) set("review", d.updatedAt?.getTime?.() ?? 0, `Outcome 回流 ${d.outcome}`);
  }
  for (const l of led) {
    if (l.action.includes("flywheel") || l.action.includes("rule")) set("learning", l.createdAt?.getTime?.(), l.action);
    if (l.action.includes("signal") || l.action.includes("seed")) set("scout", l.createdAt?.getTime?.(), l.action);
    if (l.action.includes("graph")) set("industry", l.createdAt?.getTime?.(), l.action);
  }
  return AGENTS.map((a) => ({
    ...a,
    lastActivity: lastActivity[a.aid]?.ts ? {
      ts: lastActivity[a.aid]!.ts, text: lastActivity[a.aid]!.text,
    } : null,
  }));
}
