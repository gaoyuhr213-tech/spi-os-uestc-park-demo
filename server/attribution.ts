/* 迭代26 · 工单16 · 归因引擎（Attribution Engine）
 *
 * 回答：「每一笔成交是怎么来的？」
 * 归因链：成交决策 → basedOn 溯源链（信号/规则/证据）→ 触点事件（lifecycle 标记）→ 连接器摄入
 * 输出：按 revenueTier 拆分的投入 vs 回款、趋势、漏斗、数字可点溯源回 decision
 *
 * 复用：
 * - flywheel.ts（飞轮效应指标）
 * - decisionEngine.ts buildDecisionRoi（决策级 ROI）
 * - provenanceTrace.ts（信号溯源钻取）
 */
import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { decisions, opsLedger, entities } from "../drizzle/schema";

export interface AttributionRecord {
  decisionId: number;
  eid: string;
  companyName: string;
  dtype: string;
  outcome: string;
  dealAmount: number;
  revenueTier: string;    // 按金额分档：<1万=micro / 1-10万=small / 10-50万=mid / >50万=large
  signals: string[];      // basedOn 中的信号文本
  touchpoints: number;    // lifecycle 事件数（触达深度）
  daysToClose: number;    // 从决策创建到完成的天数
  createdAt: string;
  completedAt: string;
}

export interface AttributionSummary {
  records: AttributionRecord[];
  byTier: Array<{ tier: string; count: number; amount: number; avgDays: number }>;
  totalAmount: number;
  totalDeals: number;
  avgDaysToClose: number;
  trend: Array<{ month: string; amount: number; deals: number }>;
}

function revenueTier(amount: number): string {
  if (amount >= 500_000) return "large";
  if (amount >= 100_000) return "mid";
  if (amount >= 10_000) return "small";
  return "micro";
}

export async function buildAttribution(): Promise<AttributionSummary> {
  const db = await getDb();
  if (!db) return { records: [], byTier: [], totalAmount: 0, totalDeals: 0, avgDaysToClose: 0, trend: [] };

  // 已完成且有成交金额的决策
  const doneDecisions = await db.select().from(decisions).where(eq(decisions.status, "done")).orderBy(desc(decisions.id));
  const wonDecisions = doneDecisions.filter((d) => d.outcome === "won" && (d.dealAmount ?? 0) > 0);

  // 企业名映射
  const eids = Array.from(new Set(wonDecisions.map((d) => d.eid)));
  const ents = eids.length > 0 ? await db.select({ eid: entities.eid, name: entities.name }).from(entities) : [];
  const nameMap = new Map(ents.map((e) => [e.eid, e.name]));

  const records: AttributionRecord[] = wonDecisions.map((d) => {
    let signals: string[] = [];
    try {
      const bo = JSON.parse(d.basedOn ?? "{}");
      signals = (bo.signals ?? []).map((s: { text?: string; t?: string }) => s.text ?? s.t ?? "");
    } catch { /* noop */ }
    const created = new Date(d.createdAt);
    const completed = d.updatedAt ? new Date(d.updatedAt) : created;
    const daysToClose = Math.max(0, Math.round((completed.getTime() - created.getTime()) / 86400_000));
    return {
      decisionId: d.id,
      eid: d.eid,
      companyName: nameMap.get(d.eid) ?? d.eid,
      dtype: d.dtype,
      outcome: d.outcome ?? "won",
      dealAmount: d.dealAmount ?? 0,
      revenueTier: revenueTier(d.dealAmount ?? 0),
      signals,
      touchpoints: 0, // 后续可从 lifecycle 事件计数
      daysToClose,
      createdAt: created.toISOString(),
      completedAt: completed.toISOString(),
    };
  });

  // 按 tier 汇总
  const tierMap = new Map<string, { count: number; amount: number; totalDays: number }>();
  for (const r of records) {
    const prev = tierMap.get(r.revenueTier) ?? { count: 0, amount: 0, totalDays: 0 };
    tierMap.set(r.revenueTier, { count: prev.count + 1, amount: prev.amount + r.dealAmount, totalDays: prev.totalDays + r.daysToClose });
  }
  const byTier = Array.from(tierMap.entries()).map(([tier, v]) => ({ tier, count: v.count, amount: v.amount, avgDays: v.count > 0 ? Math.round(v.totalDays / v.count) : 0 }));

  const totalAmount = records.reduce((s, r) => s + r.dealAmount, 0);
  const avgDaysToClose = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.daysToClose, 0) / records.length) : 0;

  // 月度趋势（按 completedAt 分月）
  const monthMap = new Map<string, { amount: number; deals: number }>();
  for (const r of records) {
    const m = r.completedAt.slice(0, 7); // YYYY-MM
    const prev = monthMap.get(m) ?? { amount: 0, deals: 0 };
    monthMap.set(m, { amount: prev.amount + r.dealAmount, deals: prev.deals + 1 });
  }
  const trend = Array.from(monthMap.entries()).sort().map(([month, v]) => ({ month, ...v }));

  return { records, byTier, totalAmount, totalDeals: records.length, avgDaysToClose, trend };
}
