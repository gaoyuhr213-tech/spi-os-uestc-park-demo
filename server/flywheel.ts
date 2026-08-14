/* ============================================================
 * 迭代11 · 学习飞轮 v1（Learning Flywheel）
 * 闭环：成交/流失结果回填（lifecycle + 原因编码）
 *   → 命中率统计（评分模型 vs 实际结果）
 *   → 校准建议（可解释的权重/阈值调整建议，非黑盒自动改）
 *   → 规则中心一键应用（复用 rules.preview 影响预览后落库）
 * 原则：模型校准始终"人在环"（宪法 P4），飞轮只产建议不自动改规则。
 * ============================================================ */
import { desc } from "drizzle-orm";
import { decisions, lifecycleEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { loadEntities, loadRules, maskEntityName } from "./dataAdapter";
import { calcEntity, type RuleSet } from "./ruleEngine";

export interface FlywheelStats {
  sample: { total: number; won: number; lost: number; inProgress: number };
  hit: {
    /** 成交样本中评分 Tier 为 P0/P1 的比例（模型召回质量） */
    wonHighTierRate: number | null;
    /** 成交样本平均评分 vs 全体高价值平均评分 */
    wonAvgScore: number | null;
    allHvAvgScore: number;
    /** 流失/回退样本中 P0 占比（P0 误判率信号） */
    lostP0Rate: number | null;
  };
  outcomes: { eid: string; name: string; tier: string; score: number; result: "成交" | "流失/回退"; reason: string | null; at: string }[];
  suggestions: FlywheelSuggestion[];
  /** 迭代13 · 决策级学习（Outcome Learning）：按决策类型的执行结果命中统计 */
  decisionLearning: {
    byType: Array<{ dtype: string; label: string; total: number; adopted: number; done: number; won: number; winRate: number | null; hint: string }>;
    note: string;
  };
  note: string;
  generatedAt: number;
}

export interface FlywheelSuggestion {
  id: string;
  title: string;
  rationale: string;          // 依据（可解释）
  action: "signalBoost" | "tiering" | "observe";
  patch: Record<string, number> | null; // 建议的规则修改片段（一键应用时带到规则中心）
  confidence: "高" | "中" | "低";
}

const WIN_RE = /成交/;

/** 从 note 提取原因编码（EntityDrawer 写入格式：`原因：xxx` 或纯文本） */
function extractReason(note: string | null): string | null {
  if (!note) return null;
  const m = note.match(/原因[:：]\s*(.+)/);
  return (m ? m[1] : note).slice(0, 60);
}

export async function buildFlywheel(opts: { maskSensitive: boolean }): Promise<FlywheelStats> {
  const db = await getDb();
  const [rules, ents] = await Promise.all([loadRules(), loadEntities()]);
  const now = new Date();
  const calc = new Map(ents.map((x) => [x.eid, calcEntity(x, rules, now)]));
  const nameOf = new Map(ents.map((x) => [x.eid, x.name]));

  // 每企业最新事件 = 当前结果态；成交=won；从更高状态回退（事件序列中出现过更高状态后回落）=lost
  const rows = db ? await db.select().from(lifecycleEvents).orderBy(desc(lifecycleEvents.createdAt), desc(lifecycleEvents.id)) : [];
  const ORDER = ["未触达", "已触达", "已约见", "已成交"];
  const byEid = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byEid.has(r.eid)) byEid.set(r.eid, []);
    byEid.get(r.eid)!.push(r);
  }

  const outcomes: FlywheelStats["outcomes"] = [];
  let won = 0, lost = 0, inProgress = 0;
  for (const [eid, evs] of Array.from(byEid.entries())) {
    const latest = evs[0]; // 已按时间倒序
    const c = calc.get(eid);
    if (!c) continue;
    const maxStageIdx = Math.max(...evs.map((e) => ORDER.indexOf(e.stage)));
    const latestIdx = ORDER.indexOf(latest.stage);
    let result: "成交" | "流失/回退" | null = null;
    if (WIN_RE.test(latest.stage)) { result = "成交"; won++; }
    else if (latestIdx < maxStageIdx) { result = "流失/回退"; lost++; }
    else inProgress++;
    if (result) {
      outcomes.push({
        eid,
        name: opts.maskSensitive ? maskEntityName(nameOf.get(eid) ?? eid) : (nameOf.get(eid) ?? eid),
        tier: c.tier, score: c.score, result,
        reason: extractReason(latest.note),
        at: latest.createdAt.toISOString().slice(0, 10),
      });
    }
  }

  const hv = Array.from(calc.values()).filter((c) => c.tier === "P0" || c.tier === "P1");
  const allHvAvgScore = hv.length > 0 ? Math.round(hv.reduce((s, c) => s + c.score, 0) / hv.length) : 0;
  const wonRows = outcomes.filter((o) => o.result === "成交");
  const lostRows = outcomes.filter((o) => o.result === "流失/回退");
  const wonHighTierRate = wonRows.length > 0 ? Math.round((wonRows.filter((o) => o.tier === "P0" || o.tier === "P1").length / wonRows.length) * 100) : null;
  const wonAvgScore = wonRows.length > 0 ? Math.round(wonRows.reduce((s, o) => s + o.score, 0) / wonRows.length) : null;
  const lostP0Rate = lostRows.length > 0 ? Math.round((lostRows.filter((o) => o.tier === "P0").length / lostRows.length) * 100) : null;

  const suggestions = buildSuggestions(rules, { won, lost, wonHighTierRate, wonAvgScore, allHvAvgScore, lostP0Rate });
  const decisionLearning = await buildDecisionLearning();

  return {
    sample: { total: byEid.size, won, lost, inProgress },
    hit: { wonHighTierRate, wonAvgScore, allHvAvgScore, lostP0Rate },
    outcomes: outcomes.slice(0, 30),
    suggestions,
    decisionLearning,
    note: "飞轮只产出校准建议，规则修改仍需管理员在规则中心经影响预览确认后应用（人在环，宪法 P4）。样本 < 5 时建议仅供参考。",
    generatedAt: Date.now(),
  };
}

/* 迭代13 · 决策级学习：哪类决策在实际执行中有效（决策结果 → 决策生成先验的反馈信号） */
const DL_LABEL: Record<string, string> = {
  contact: "立即联系", mentor: "安排导师", hr_service: "推荐 HR 服务", policy: "政策申报辅导", referral: "校友/暖引荐",
};
async function buildDecisionLearning(): Promise<FlywheelStats["decisionLearning"]> {
  const db = await getDb();
  const empty = { byType: [], note: "决策级学习：完成的决策回填 won/lost 后，按类型统计命中率，作为下一轮决策星级的校准依据（人在环）。" };
  if (!db) return empty;
  const rows = await db.select().from(decisions);
  if (rows.length === 0) return { ...empty, note: "尚无决策记录 · 在决策中心点击「生成今日决策」后，采纳→执行→回填结果即进入决策级学习。" };
  const byType = Object.keys(DL_LABEL).map((dt) => {
    const t = rows.filter((r) => r.dtype === dt);
    const adopted = t.filter((r) => ["adopted", "executing", "done"].includes(r.status)).length;
    const doneRows = t.filter((r) => r.status === "done");
    const won = doneRows.filter((r) => r.outcome === "won").length;
    const winRate = doneRows.length > 0 ? Math.round((won / doneRows.length) * 100) : null;
    let hint = "样本积累中";
    if (winRate != null && doneRows.length >= 3) {
      hint = winRate >= 70 ? `命中率 ${winRate}%，建议该类决策星级上调（下轮生成时优先）` : winRate <= 30 ? `命中率 ${winRate}%，建议复盘该类决策的触发条件` : `命中率 ${winRate}%，保持观察`;
    }
    return { dtype: dt, label: DL_LABEL[dt], total: t.length, adopted, done: doneRows.length, won, winRate, hint };
  }).filter((t) => t.total > 0);
  return { byType, note: empty.note };
}

/** 可解释校准建议：小样本期以观察建议为主，样本充足后给出具体 patch */
function buildSuggestions(
  rules: RuleSet,
  s: { won: number; lost: number; wonHighTierRate: number | null; wonAvgScore: number | null; allHvAvgScore: number; lostP0Rate: number | null },
): FlywheelSuggestion[] {
  const out: FlywheelSuggestion[] = [];
  const sample = s.won + s.lost;

  if (sample === 0) {
    out.push({
      id: "cold-start", title: "冷启动：先积累成交/流失样本",
      rationale: "尚无成交或流失回填。90 天作战期内每次标记「已成交/回退」并选择原因编码，即自动进入飞轮统计；建议优先完成 P0 七家首触并如实记录结果。",
      action: "observe", patch: null, confidence: "高",
    });
    return out;
  }

  // 建议1：成交样本评分低于高价值均值 → 信号权重可能低估（成交由信号驱动而非基线）
  if (s.wonAvgScore != null && s.wonAvgScore < s.allHvAvgScore) {
    const cur = rules.scoring.signalBoost;
    out.push({
      id: "raise-signal", title: "上调信号加分权重（成交企业评分低于高价值均值）",
      rationale: `成交样本平均分 ${s.wonAvgScore} < 高价值线索均值 ${s.allHvAvgScore}，说明实际成交更依赖动态信号而非静态基线；建议 Tier-1 信号加分 ${cur.tier1} → ${cur.tier1 + 1}，上限 ${cur.max} → ${cur.max + 2}。`,
      action: "signalBoost",
      patch: { tier1: cur.tier1 + 1, tier2: cur.tier2, max: cur.max + 2 },
      confidence: sample >= 5 ? "中" : "低",
    });
  }

  // 建议2：流失中 P0 占比高 → P0 阈值偏松或需强信号门槛
  if (s.lostP0Rate != null && s.lostP0Rate >= 50) {
    const cur = rules.tiering;
    out.push({
      id: "tighten-p0", title: "收紧 P0 门槛（流失样本中 P0 占比偏高）",
      rationale: `流失/回退样本中 P0 占比 ${s.lostP0Rate}%，存在高分误判迹象；建议 P0 阈值 ${cur.p0Min} → ${cur.p0Min + 3}（保持 P0>P1>P2），并保留"P0 须有活跃信号"约束。`,
      action: "tiering",
      patch: { p0Min: cur.p0Min + 3, p1Min: cur.p1Min, p2Min: cur.p2Min },
      confidence: sample >= 5 ? "中" : "低",
    });
  }

  // 建议3：模型召回良好 → 保持并扩大样本
  if (s.wonHighTierRate != null && s.wonHighTierRate >= 80) {
    out.push({
      id: "keep-going", title: `模型召回良好（成交中高价值占比 ${s.wonHighTierRate}%），保持当前权重`,
      rationale: "成交样本绝大多数命中 P0/P1 分层，评分模型与实际成交高度一致；建议维持规则，继续以真实结果扩大样本量（≥10 单后再做下一轮校准）。",
      action: "observe", patch: null, confidence: sample >= 5 ? "高" : "中",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "accumulate", title: "样本不足以支撑调参，继续回填",
      rationale: `当前结果样本 ${sample} 条（成交 ${s.won} / 流失 ${s.lost}），未触发任何校准规则；继续如实回填结果，飞轮将在样本充足时自动给出建议。`,
      action: "observe", patch: null, confidence: "高",
    });
  }
  return out;
}
