/* 迭代18 · 工单3 · 真事件溯源 Ledger（ADR-01/16）
 *
 * 与 dataAdapter.appendLedger（尽力而为的运营台账）不同，本模块提供：
 * 1. appendOrAbort：append-or-abort 语义——决策类关键事件的台账写入失败时抛错中止业务动作，
 *    严禁静默成功（ADR-16 失败不得默认 Success）。
 * 2. buildBasedOn：决策创建时装配完整溯源链（signals/rules/ruleVersions/evidence/canvas/lifecycle）。
 * 3. traceDecision：给定 decisionId 回溯完整证据链：
 *    数据(信号/富集) → 规则(版本) → 评分 → 决策 → 执行(状态流转/任务) → 结果(outcome)。
 */
import { desc, eq, like, or } from "drizzle-orm";
import { getDb } from "./db";
import { decisions, opsLedger, ruleConfigs, lifecycleEvents } from "../drizzle/schema";
import { loadEntities, loadRules } from "./dataAdapter";
import { calcEntity } from "./ruleEngine";

/* ---------- 1. append-or-abort 台账 ---------- */

export class LedgerWriteError extends Error {
  constructor(cause: string) {
    super(`决策台账写入失败，业务动作已中止（append-or-abort）：${cause}`);
    this.name = "LedgerWriteError";
  }
}

/** 决策关键事件台账：写失败抛 LedgerWriteError，调用方必须让业务动作一并失败 */
export async function appendOrAbort(entry: {
  action: string;
  targetEid: string | null;
  detail: string | null;
  actor: string | null;
  before?: string | null;
  after?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new LedgerWriteError("数据库不可用");
  try {
    await db.insert(opsLedger).values({
      action: entry.action,
      targetEid: entry.targetEid,
      detail: entry.detail?.slice(0, 500) ?? null,
      actor: entry.actor,
      beforeJson: entry.before ?? null,
      afterJson: entry.after ?? null,
    });
  } catch (err) {
    throw new LedgerWriteError(err instanceof Error ? err.message : String(err));
  }
}

/* ---------- 2. basedOn 溯源链装配 ---------- */

export interface BasedOn {
  /** 命中的需求信号（决策依据的原始数据层） */
  signals: Array<{ t: string; d: string; tier: number }>;
  /** 命中的规则标识（决策引擎规则 ID） */
  rules: string[];
  /** 生成时刻的规则版本快照（key → version） */
  ruleVersions: Record<string, number>;
  /** 证据条目（reason 原因链） */
  evidence: string[];
  /** 需求画布快照（needTag → stars） */
  canvas: Record<string, number>;
  /** 生命周期阶段 */
  lifecycle: string;
  /** 评分快照 */
  score: { lead: number; tier: string };
  /** 装配时间 */
  at: string;
}

/** 读取当前 ruleConfigs 全部版本号（决策生成时的版本快照） */
export async function snapshotRuleVersions(): Promise<Record<string, number>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select({ key: ruleConfigs.key, version: ruleConfigs.version }).from(ruleConfigs);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.key] = r.version;
  return out;
}

/* ---------- 3. trace：决策全链回溯 ---------- */

export interface DecisionTrace {
  decision: {
    id: number; eid: string; name: string; dtype: string; title: string; stars: number;
    status: string; assignee: string | null; createdAt: Date;
  };
  /** ① 数据层：依据的信号与证据 */
  data: { signals: Array<{ t: string; d: string; tier: number }>; evidence: string[]; canvas: Record<string, number>; lifecycle: string };
  /** ② 规则层：规则 ID 与版本快照（含当前版本对照，可见漂移） */
  rules: { hit: string[]; versionsAtCreation: Record<string, number>; versionsNow: Record<string, number> };
  /** ③ 评分层 */
  score: { atCreation: { lead: number; tier: string } | null; now: { lead: number; tier: string } | null };
  /** ④ 执行层：状态流转台账 + 生命周期事件 */
  execution: Array<{ at: Date; action: string; detail: string | null; actor: string | null }>;
  /** ⑤ 结果层 */
  outcome: { status: string; outcome: string | null; note: string | null; dealAmount: number | null };
  /** basedOn 是否存在（旧决策可能无溯源链，明示而非伪造） */
  hasProvenance: boolean;
}

export async function traceDecision(decisionId: number, maskSensitive: boolean): Promise<DecisionTrace | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(decisions).where(eq(decisions.id, decisionId)).limit(1);
  if (rows.length === 0) return null;
  const d = rows[0];

  const ents = await loadEntities();
  const ent = ents.find((x) => x.eid === d.eid);
  const name = maskSensitive && ent ? `${ent.name.slice(0, 2)}**（脱敏）` : (ent?.name ?? d.eid);

  let based: BasedOn | null = null;
  if (d.basedOn) {
    try { based = JSON.parse(d.basedOn) as BasedOn; } catch { based = null; }
  }

  // 执行层：与该决策相关的台账（按 decision:<id> 标记或目标企业 + decision 关键字）
  const ledger = await db
    .select()
    .from(opsLedger)
    .where(or(like(opsLedger.detail, `%[D#${d.id}]%`), eq(opsLedger.targetEid, d.eid)))
    .orderBy(desc(opsLedger.createdAt))
    .limit(60);
  const execution = ledger
    .filter((l) => (l.action ?? "").startsWith("decision") || (l.detail ?? "").includes(`[D#${d.id}]`))
    .map((l) => ({ at: l.createdAt, action: l.action, detail: l.detail, actor: l.actor }));
  // 生命周期事件并入执行层（触达/约见/成交是决策执行的业务结果轨迹）
  const lifecycle = await db
    .select()
    .from(lifecycleEvents)
    .where(eq(lifecycleEvents.eid, d.eid))
    .orderBy(desc(lifecycleEvents.createdAt))
    .limit(20);
  for (const ev of lifecycle) {
    execution.push({ at: ev.createdAt, action: `lifecycle:${ev.stage}`, detail: `线索阶段推进 → ${ev.stage}`, actor: ev.actor });
  }
  execution.sort((a, b) => b.at.getTime() - a.at.getTime());

  // 评分层：当前实时评分对照
  let scoreNow: { lead: number; tier: string } | null = null;
  if (ent) {
    try {
      const rules = await loadRules();
      const r = calcEntity(ent, rules, new Date());
      scoreNow = { lead: r.score, tier: r.tier };
    } catch { scoreNow = null; }
  }

  const versionsNow = await snapshotRuleVersions();

  return {
    decision: {
      id: d.id, eid: d.eid, name, dtype: d.dtype, title: d.title, stars: d.stars,
      status: d.status, assignee: d.assignee, createdAt: d.createdAt,
    },
    data: {
      signals: based?.signals ?? (ent?.signals ?? []).map((s) => ({ t: s.t, d: s.d, tier: s.tier })),
      evidence: based?.evidence ?? (d.reason ? d.reason.split("；") : []),
      canvas: based?.canvas ?? {},
      lifecycle: based?.lifecycle ?? "—",
    },
    rules: {
      hit: based?.rules ?? [`decision-engine:${d.dtype}`],
      versionsAtCreation: based?.ruleVersions ?? {},
      versionsNow,
    },
    score: { atCreation: based?.score ?? null, now: scoreNow },
    execution: execution.slice(0, 30),
    outcome: { status: d.status, outcome: d.outcome, note: d.outcomeNote, dealAmount: d.dealAmount },
    hasProvenance: based !== null,
  };
}
