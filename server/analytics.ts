/* 迭代27 · 工单21 · 试点埋点
 *
 * 埋点关键行为：NBA 采纳/驳回、触达→回应、决策→成交
 * 运营度量：日活执行率、NBA 采纳率、各阶段转化率
 * 回流学习引擎：埋点数据作为训练/校准信号
 * 对照基线：A/B 或历史基线量化改进
 *
 * 原则：只记行为与口径，不采集个人隐私
 */
import { getDb } from "./db";
import { opsLedger } from "../drizzle/schema";
import { desc, gte, eq, sql } from "drizzle-orm";

/* ============================================================
 * 1. 行为埋点
 * ============================================================ */
export type EventType =
  | "nba_adopted"      // NBA 建议被采纳
  | "nba_rejected"     // NBA 建议被驳回
  | "touch_sent"       // 触达发出
  | "touch_responded"  // 触达收到回应
  | "decision_created" // 决策创建
  | "decision_won"     // 决策成交
  | "decision_lost"    // 决策失败
  | "workflow_started"  // 工作流启动
  | "workflow_done";   // 工作流完成

export interface AnalyticsEvent {
  type: EventType;
  decisionId?: number;
  eid?: string;
  actor: string;
  metadata?: Record<string, unknown>;
  ts: string;
}

/** 记录行为事件（写入 opsLedger，action=analytics_event） */
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(opsLedger).values({
    action: "analytics_event",
    targetEid: event.eid ?? null,
    detail: event.type,
    actor: event.actor,
    afterJson: JSON.stringify({ ...event, ts: event.ts }),
  });
}

/* ============================================================
 * 2. 运营度量看板
 * ============================================================ */
export interface OperationalMetrics {
  period: string; // "7d" | "30d"
  totalEvents: number;
  nbaAdopted: number;
  nbaRejected: number;
  nbaAdoptionRate: number;
  touchSent: number;
  touchResponded: number;
  touchResponseRate: number;
  decisionCreated: number;
  decisionWon: number;
  decisionConversionRate: number;
  dailyActiveRate: number; // 有行为的天数 / 总天数
}

export async function buildOperationalMetrics(days: number = 7): Promise<OperationalMetrics> {
  const db = await getDb();
  if (!db) return emptyMetrics(days);
  const since = new Date(Date.now() - days * 86400_000);
  const events = await db.select().from(opsLedger)
    .where(sql`${opsLedger.action} = 'analytics_event' AND ${opsLedger.createdAt} >= ${since}`)
    .orderBy(desc(opsLedger.id));

  const types = events.map((e) => e.detail as EventType);
  const nbaAdopted = types.filter((t) => t === "nba_adopted").length;
  const nbaRejected = types.filter((t) => t === "nba_rejected").length;
  const touchSent = types.filter((t) => t === "touch_sent").length;
  const touchResponded = types.filter((t) => t === "touch_responded").length;
  const decisionCreated = types.filter((t) => t === "decision_created").length;
  const decisionWon = types.filter((t) => t === "decision_won").length;

  // 日活：有事件的唯一天数
  const uniqueDays = new Set(events.map((e) => e.createdAt?.toISOString().slice(0, 10))).size;
  const dailyActiveRate = days > 0 ? uniqueDays / days : 0;

  return {
    period: `${days}d`,
    totalEvents: events.length,
    nbaAdopted, nbaRejected,
    nbaAdoptionRate: (nbaAdopted + nbaRejected) > 0 ? nbaAdopted / (nbaAdopted + nbaRejected) : 0,
    touchSent, touchResponded,
    touchResponseRate: touchSent > 0 ? touchResponded / touchSent : 0,
    decisionCreated, decisionWon,
    decisionConversionRate: decisionCreated > 0 ? decisionWon / decisionCreated : 0,
    dailyActiveRate,
  };
}

function emptyMetrics(days: number): OperationalMetrics {
  return { period: `${days}d`, totalEvents: 0, nbaAdopted: 0, nbaRejected: 0, nbaAdoptionRate: 0, touchSent: 0, touchResponded: 0, touchResponseRate: 0, decisionCreated: 0, decisionWon: 0, decisionConversionRate: 0, dailyActiveRate: 0 };
}

/* ============================================================
 * 3. 学习引擎回流
 * ============================================================ */
export interface LearningSignal {
  type: EventType;
  decisionId?: number;
  eid?: string;
  outcome: "positive" | "negative" | "neutral";
  weight: number;
}

/** 将埋点事件转化为学习信号（回流 learningEngine） */
export function eventToLearningSignal(event: AnalyticsEvent): LearningSignal {
  const positiveTypes: EventType[] = ["nba_adopted", "touch_responded", "decision_won", "workflow_done"];
  const negativeTypes: EventType[] = ["nba_rejected", "decision_lost"];
  const outcome = positiveTypes.includes(event.type) ? "positive" : negativeTypes.includes(event.type) ? "negative" : "neutral";
  const weight = outcome === "positive" ? 1.0 : outcome === "negative" ? -0.5 : 0;
  return { type: event.type, decisionId: event.decisionId, eid: event.eid, outcome, weight };
}

/* ============================================================
 * 4. 对照基线
 * ============================================================ */
export interface BaselineComparison {
  current: OperationalMetrics;
  baseline: OperationalMetrics;
  improvement: {
    adoptionRate: number; // 百分点变化
    responseRate: number;
    conversionRate: number;
  };
}

/** 对比当前周期与历史基线（前一个同等周期） */
export async function compareBaseline(days: number = 7): Promise<BaselineComparison> {
  const current = await buildOperationalMetrics(days);
  // 基线：前一个周期（days*2 到 days 之前的数据）
  const db = await getDb();
  if (!db) return { current, baseline: emptyMetrics(days), improvement: { adoptionRate: 0, responseRate: 0, conversionRate: 0 } };

  const baselineStart = new Date(Date.now() - days * 2 * 86400_000);
  const baselineEnd = new Date(Date.now() - days * 86400_000);
  const baselineEvents = await db.select().from(opsLedger)
    .where(sql`${opsLedger.action} = 'analytics_event' AND ${opsLedger.createdAt} >= ${baselineStart} AND ${opsLedger.createdAt} < ${baselineEnd}`);

  const bTypes = baselineEvents.map((e) => e.detail as EventType);
  const bAdopted = bTypes.filter((t) => t === "nba_adopted").length;
  const bRejected = bTypes.filter((t) => t === "nba_rejected").length;
  const bTouchSent = bTypes.filter((t) => t === "touch_sent").length;
  const bTouchResp = bTypes.filter((t) => t === "touch_responded").length;
  const bDecCreated = bTypes.filter((t) => t === "decision_created").length;
  const bDecWon = bTypes.filter((t) => t === "decision_won").length;

  const baseline: OperationalMetrics = {
    period: `${days}d-baseline`,
    totalEvents: baselineEvents.length,
    nbaAdopted: bAdopted, nbaRejected: bRejected,
    nbaAdoptionRate: (bAdopted + bRejected) > 0 ? bAdopted / (bAdopted + bRejected) : 0,
    touchSent: bTouchSent, touchResponded: bTouchResp,
    touchResponseRate: bTouchSent > 0 ? bTouchResp / bTouchSent : 0,
    decisionCreated: bDecCreated, decisionWon: bDecWon,
    decisionConversionRate: bDecCreated > 0 ? bDecWon / bDecCreated : 0,
    dailyActiveRate: 0,
  };

  return {
    current, baseline,
    improvement: {
      adoptionRate: (current.nbaAdoptionRate - baseline.nbaAdoptionRate) * 100,
      responseRate: (current.touchResponseRate - baseline.touchResponseRate) * 100,
      conversionRate: (current.decisionConversionRate - baseline.decisionConversionRate) * 100,
    },
  };
}
