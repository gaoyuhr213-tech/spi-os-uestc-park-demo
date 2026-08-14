/* Decision Engine 2.0 · 九要素 Decision Card + Decision Provenance + Decision Health
   对标：Palantir Foundry（Decision Provenance / Learning Loop）、6sense（Evidence→Confidence→Action）、
        ServiceNow AI Platform（Workflow Closure）。
   设计公理：
   1) 九要素全部后端计算，纯规则+统计可解释，前端零硬编码；
   2) Confidence 分渠道（规则/数据回填/AI/人工）加权，来源可追溯；
   3) Counterfactual（不采纳会怎样）由信号时效窗口推演；
   4) Learning：历史同类型决策的实际命中率回流，参与当前决策置信度（Policy Update 闭环）。 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { decisions } from "../drizzle/schema";
import { loadEntities, loadLatestStages, loadRules, maskEntityName } from "./dataAdapter";
import { calcEntity } from "./ruleEngine";
import { buildNeedCanvas, inferLifecycle, DTYPE_LABEL, DTYPE_REVENUE, type DType, type NeedTag } from "./decisionEngine";

/* ============ 九要素 Decision Card ============ */
export interface EvidenceNode {
  kind: "signal" | "enrich" | "rule" | "ai" | "human" | "stage" | "learning";
  kindLabel: string;
  text: string;
  weight: number;      // 对本决策的贡献权重 0-100
  sourceNote: string;  // 数据来源说明（可追溯）
}
export interface DecisionCard9 {
  id: number;
  eid: string;
  name: string;
  dtype: DType;
  dtypeLabel: string;
  title: string;
  status: string;
  assignee: string | null;
  // ① Decision Score（决策优先分，非 Lead 分）
  score: number;               // 0-100
  stars: number;
  // ② Evidence（证据链，分渠道）
  evidence: EvidenceNode[];
  // ③ Reason（推理链：证据→规则→结论）
  reason: string[];
  // ④ Confidence（分渠道加权置信度）
  confidence: number;          // 0-100
  confidenceBreakdown: Array<{ channel: string; value: number; weight: number; note: string }>;
  // ⑤ Risk（不确定性与执行风险）
  risks: Array<{ text: string; severity: "high" | "mid" | "low" }>;
  // ⑥ Opportunity（机会窗口）
  opportunity: { window: string; text: string };
  // ⑦ Action（可执行下一步，含负责人建议与资源）
  action: { next: string; owner: string; resourceHint: string };
  // ⑧ Impact（预期影响：收入层/园区面）
  impact: { revenueTier: string; revenueTierLabel: string; estValue: string; parkEffect: string };
  // ⑨ Learning（历史命中回流 + 反事实）
  learning: { historyNote: string; hitRate: number | null; counterfactual: string };
}

const TIER_LABEL: Record<string, string> = {
  operation: "运营层（对接/触达服务）", marketplace: "Marketplace（撮合抽成）",
  consulting: "咨询层（申报/辅导）", saas: "SaaS 订阅", data: "数据服务", success: "成功费",
};

/** 历史命中率（Learning 回流）：同决策类型已完成决策的 won 占比 */
export async function typeHitRate(dtype: DType): Promise<{ hitRate: number | null; done: number; won: number }> {
  const db = await getDb();
  if (!db) return { hitRate: null, done: 0, won: 0 };
  const rows = await db.select().from(decisions).where(eq(decisions.dtype, dtype));
  const done = rows.filter((r) => r.status === "done");
  if (done.length === 0) return { hitRate: null, done: 0, won: 0 };
  const won = done.filter((r) => r.outcome === "won").length;
  return { hitRate: Math.round((won / done.length) * 100), done: done.length, won };
}

/** 构建单条决策的九要素卡（Provenance 全链） */
export async function buildDecisionCard9(decisionId: number, opts: { maskSensitive: boolean }): Promise<DecisionCard9 | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(decisions).where(eq(decisions.id, decisionId)).limit(1);
  if (!row) return null;
  const [rules, ents, stages] = await Promise.all([loadRules(), loadEntities(), loadLatestStages()]);
  const x = ents.find((e) => e.eid === row.eid);
  if (!x) return null;
  const calc = calcEntity(x, rules, new Date());
  const lc = inferLifecycle(x);
  const canvas = buildNeedCanvas(x, lc);
  const need = canvas.find((c) => c.tag === row.needTag);
  const dtype = row.dtype as DType;
  const en = (x.enrichFull ?? {}) as Record<string, string | number | null>;
  const enrichCount = Object.values(en).filter((v) => v !== null && v !== undefined && String(v) !== "").length;

  /* ② Evidence：分渠道证据链 */
  const evidence: EvidenceNode[] = [];
  for (const s of x.signals.slice(0, 4)) {
    evidence.push({ kind: "signal", kindLabel: "需求信号", text: `${s.t}（${s.d} · Tier-${s.tier}）`, weight: s.tier === 1 ? 30 : 15, sourceNote: "楼层实勘/公开信息采集" });
  }
  if (need) for (const b of need.basis.slice(0, 3)) {
    evidence.push({ kind: "enrich", kindLabel: "回填数据", text: b, weight: 20, sourceNote: "情报富集档案（L1/L2 回填）" });
  }
  evidence.push({ kind: "rule", kindLabel: "规则引擎", text: `Lead ${calc.score}/100 · ${calc.tier}（12维规则 v1）`, weight: 25, sourceNote: "规则中心 · 权重可审计" });
  evidence.push({ kind: "stage", kindLabel: "阶段先验", text: `生命周期=${lc.phase}（${lc.basis[0] ?? "保守推断"}）`, weight: 10, sourceNote: "决策引擎阶段推断" });
  const hit = await typeHitRate(dtype);
  if (hit.hitRate !== null) {
    evidence.push({ kind: "learning", kindLabel: "学习回流", text: `同类型决策历史成交率 ${hit.hitRate}%（${hit.won}/${hit.done}）`, weight: 15, sourceNote: "Outcome 回流（决策级学习）" });
  }
  if (row.assignee) {
    evidence.push({ kind: "human", kindLabel: "人工判断", text: `已由 ${row.assignee} 采纳指派（人在环确认）`, weight: 10, sourceNote: "决策状态机台账" });
  }

  /* ④ Confidence：分渠道加权 */
  const chRule = Math.min(100, calc.score);                       // 规则渠道 = Lead 分
  const chData = Math.min(100, Math.round((enrichCount / 12) * 100)); // 数据渠道 = 回填完整度
  const chSignal = x.signals.some((s) => s.tier === 1) ? 85 : x.signals.length > 0 ? 60 : 30;
  const chLearning = hit.hitRate ?? 50;                            // 学习渠道 = 历史命中（无历史=中性50）
  const breakdown = [
    { channel: "规则引擎", value: chRule, weight: 35, note: "12维 Lead 评分（权重可审计）" },
    { channel: "信号强度", value: chSignal, weight: 25, note: "Tier-1 强承诺信号提升置信" },
    { channel: "数据完整度", value: chData, weight: 20, note: `富集回填 ${enrichCount}/12 字段` },
    { channel: "学习回流", value: chLearning, weight: 20, note: hit.hitRate !== null ? `历史 ${hit.won}/${hit.done} 成交` : "暂无历史，中性 50" },
  ];
  const confidence = Math.round(breakdown.reduce((s, b) => s + b.value * b.weight, 0) / 100);

  /* ① Decision Score：星级×置信度合成（决策优先级，区别于 Lead 分） */
  const score = Math.round(row.stars * 14 + confidence * 0.3);

  /* ⑤ Risk */
  const risks: DecisionCard9["risks"] = [];
  if (enrichCount < 4) risks.push({ text: `富集档案仅回填 ${enrichCount}/12 字段，画像不完整（先补 L1 再重判）`, severity: "high" });
  if (hit.hitRate !== null && hit.hitRate < 40) risks.push({ text: `同类型历史成交率仅 ${hit.hitRate}%，建议复核切入点`, severity: "mid" });
  const staleSignal = x.signals.every((s) => {
    const days = (Date.now() - new Date(s.d).getTime()) / 86_400_000;
    return days > 45;
  });
  if (x.signals.length > 0 && staleSignal) risks.push({ text: "全部信号已超 45 天，需求窗口可能衰减（建议先电话验证）", severity: "mid" });
  if (!row.assignee && row.status === "suggested") risks.push({ text: "尚未指派负责人，窗口期内无人跟进即流失", severity: "low" });
  if (risks.length === 0) risks.push({ text: "无显著风险项（证据充分、窗口有效）", severity: "low" });

  /* ⑥ Opportunity */
  const t1 = x.signals.find((s) => s.tier === 1);
  const opportunity = t1
    ? { window: "0-30 天", text: `Tier-1 信号「${t1.t}」为强承诺动作，窗口期内触达成功率最高` }
    : { window: "30-60 天", text: "常规需求窗口，可按节奏培育触达" };

  /* ⑦ Action */
  const matches = (() => { try { return JSON.parse(row.matchedResources ?? "[]") as Array<{ name: string }>; } catch { return []; } })();
  const action = {
    next: dtype === "contact" ? "7 日内电话+拜访，携人才供给方案" :
      dtype === "hr_service" ? "发起高于人力批量招聘方案（30 分钟呈报）" :
      dtype === "mentor" ? "预约信软学院教授技术咨询（本周内）" :
      dtype === "policy" ? "启动高企/专精特新申报预评估" : "经校友会/园区股份发起暖引荐，7 日内约见",
    owner: row.assignee ?? "待指派（建议按「我的决策」分单）",
    resourceHint: matches[0]?.name ?? "待匹配",
  };

  /* ⑧ Impact */
  const tier = row.revenueTier ?? DTYPE_REVENUE[dtype];
  const impact = {
    revenueTier: tier,
    revenueTierLabel: TIER_LABEL[tier] ?? tier,
    estValue: dtype === "hr_service" ? "撮合费 3-8 万/单【假设：行业费率】" :
      dtype === "referral" ? "成功费 5-20 万/单【假设】" :
      dtype === "policy" ? "咨询费 2-5 万/单【假设】" : "关系资产（后续 Marketplace 转化前提）",
    parkEffect: "留驻强化 + 楼宇续租概率提升（企业服务黏性）",
  };

  /* ⑨ Learning + Counterfactual */
  const counterfactual = t1
    ? `若不采纳：Tier-1 窗口（${opportunity.window}）关闭后，该需求大概率被社招/竞对渠道满足，下次触达成本上升；同类历史流失案例将回流为负样本。`
    : "若不采纳：决策保留为培育池，30 天后信号衰减自动降星；流失原因将回流学习飞轮。";
  const learning = {
    historyNote: hit.hitRate !== null ? `同类型已完成 ${hit.done} 条，成交 ${hit.won} 条（${hit.hitRate}%），已作为置信度输入` : "该类型暂无完成样本，置信度按中性处理；本决策结果将成为首批学习样本",
    hitRate: hit.hitRate,
    counterfactual,
  };

  const rawName = x.name;
  return {
    id: row.id, eid: row.eid,
    name: opts.maskSensitive ? maskEntityName(rawName) : rawName,
    dtype, dtypeLabel: DTYPE_LABEL[dtype], title: row.title, status: row.status, assignee: row.assignee,
    score: Math.min(100, score), stars: row.stars,
    evidence, reason: row.reason.split("；"),
    confidence, confidenceBreakdown: breakdown,
    risks, opportunity, action, impact, learning,
  };
}

/* ============ Decision Health 五维北极星 ============ */
export interface DecisionHealth {
  velocity: { value: number; unit: string; note: string };   // 建议→采纳中位时长（天）
  quality: { value: number; unit: string; note: string };    // 已完成中 won 占比
  impact: { value: number; unit: string; note: string };     // 累计成交金额（万元）
  roi: { value: number; unit: string; note: string };        // 采纳率
  learning: { value: number; unit: string; note: string };   // 有 outcome 回流的决策占比
  overall: number; // 0-100 综合健康分
  note: string;
}
export async function buildDecisionHealth(): Promise<DecisionHealth> {
  const db = await getDb();
  const empty: DecisionHealth = {
    velocity: { value: 0, unit: "天", note: "" }, quality: { value: 0, unit: "%", note: "" },
    impact: { value: 0, unit: "万元", note: "" }, roi: { value: 0, unit: "%", note: "" },
    learning: { value: 0, unit: "%", note: "" }, overall: 0, note: "数据库不可用",
  };
  if (!db) return empty;
  const rows = await db.select().from(decisions);
  if (rows.length === 0) return { ...empty, note: "暂无决策数据" };
  const total = rows.length;
  const adopted = rows.filter((r) => r.status !== "suggested" && r.status !== "dismissed");
  const done = rows.filter((r) => r.status === "done");
  const won = done.filter((r) => r.outcome === "won");
  // Velocity：建议→非 suggested 的中位时长（createdAt→updatedAt 近似）
  const durations = adopted.map((r) => ((r.updatedAt ?? r.createdAt).getTime() - r.createdAt.getTime()) / 86_400_000).sort((a, b) => a - b);
  const median = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : 0;
  const velocity = Math.round(median * 10) / 10;
  const quality = done.length > 0 ? Math.round((won.length / done.length) * 100) : 0;
  const impactWan = Math.round(done.reduce((s, r) => s + (r.dealAmount ?? 0), 0) / 10000 * 10) / 10;
  const roi = Math.round((adopted.length / total) * 100);
  const withOutcome = rows.filter((r) => r.outcome !== null).length;
  const learning = Math.round((withOutcome / total) * 100);
  // Overall：五维归一加权（velocity 反向：越快越好，7 天内满分）
  const vScore = Math.max(0, Math.min(100, Math.round((1 - Math.min(velocity, 14) / 14) * 100)));
  const iScore = Math.min(100, impactWan >= 100 ? 100 : Math.round(impactWan));
  const overall = Math.round(vScore * 0.2 + quality * 0.25 + iScore * 0.15 + roi * 0.2 + learning * 0.2);
  return {
    velocity: { value: velocity, unit: "天", note: "建议→采纳中位时长（越短越好，7 天内为优）" },
    quality: { value: quality, unit: "%", note: "已完成决策中 won 占比" },
    impact: { value: impactWan, unit: "万元", note: "累计成交金额（金额口径）" },
    roi: { value: roi, unit: "%", note: "采纳率（进入执行链路的决策占比）" },
    learning: { value: learning, unit: "%", note: "有结果回流的决策占比（学习样本覆盖）" },
    overall,
    note: "Decision Health 五维：Velocity/Quality/Impact/ROI/Learning，综合分为加权归一（演示口径，权重可在规则中心审计）。",
  };
}
