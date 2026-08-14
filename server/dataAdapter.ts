/* ============================================================
 * 统一数据适配器（Data Adapter）
 * 目标：解耦数据源——DB 为主数据源，DB 不可用/为空时回退种子数据。
 * 输出统一 CalcInput，规则引擎不感知数据来源；
 * 前端所见数据一律先经 buildSnapshot 计算，再按脱敏配置输出。
 * ============================================================ */
import { and, desc, eq, inArray } from "drizzle-orm";
import { entities, enrichments, lifecycleEvents, opsLedger, ruleConfigs, taskCompletions } from "../drizzle/schema";
import { getDb } from "./db";
import { PARK_SEED, type SeedSignal } from "./parkData";
import {
  DEFAULT_RULES, STAGES, calcEntity, calcFunnel, calcKpis,
  buildExplain, buildTaskList, inferIntents, isoWeekKey, pipelineSignals,
  type CalcInput, type RuleSet, type Stage,
} from "./ruleEngine";

/* ---------- 规则加载（DB 覆盖默认） ---------- */
export async function loadRules(): Promise<RuleSet> {
  const db = await getDb();
  if (!db) return DEFAULT_RULES;
  try {
    const rows = await db.select().from(ruleConfigs);
    const merged: RuleSet = structuredClone(DEFAULT_RULES);
    for (const r of rows) {
      try {
        const cfg = JSON.parse(r.configJson);
        if (r.key === "scoring") merged.scoring = { ...merged.scoring, ...cfg };
        else if (r.key === "tiering") merged.tiering = { ...merged.tiering, ...cfg };
        else if (r.key === "pitch") merged.pitch = { ...merged.pitch, ...cfg };
        else if (r.key === "pipeMatch") merged.pipeMatch = { ...merged.pipeMatch, ...cfg };
        else if (r.key === "tasks") merged.tasks = { ...merged.tasks, ...cfg };
      } catch { /* 配置损坏时忽略该条 */ }
    }
    return merged;
  } catch {
    return DEFAULT_RULES;
  }
}

/* ---------- 规则保存 / 重置（管理员规则中心；写 ruleConfigs 即时生效） ---------- */
export type EditableRuleKey = "scoring" | "tiering" | "pipeMatch" | "tasks";

export async function saveRuleConfig(key: EditableRuleKey, cfg: Record<string, unknown>, actor: string | null) {
  const db = await getDb();
  if (!db) return { ok: false as const, error: "数据库不可用" };
  const existing = await db.select().from(ruleConfigs).where(eq(ruleConfigs.key, key)).limit(1);
  const configJson = JSON.stringify(cfg);
  const description = `规则中心在线修改 by ${actor ?? "admin"}`;
  const beforeJson = existing.length > 0 ? existing[0].configJson : null;
  if (existing.length > 0) {
    await db.update(ruleConfigs).set({ configJson, version: existing[0].version + 1, description }).where(eq(ruleConfigs.key, key));
  } else {
    await db.insert(ruleConfigs).values({ key, configJson, version: 1, description });
  }
  return { ok: true as const, error: null, beforeJson, afterJson: configJson };
}

export async function resetRuleConfig(key: EditableRuleKey) {
  const db = await getDb();
  if (!db) return { ok: false as const, error: "数据库不可用" };
  await db.delete(ruleConfigs).where(eq(ruleConfigs.key, key));
  return { ok: true as const, error: null };
}

/** 规则版本信息（规则中心展示当前生效版本） */
export async function loadRuleVersions() {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select({ key: ruleConfigs.key, version: ruleConfigs.version, updatedAt: ruleConfigs.updatedAt, description: ruleConfigs.description }).from(ruleConfigs);
  } catch { return []; }
}

/* ---------- 主体 + 富集读取（统一 CalcInput） ---------- */
export interface AdapterEntity extends CalcInput {
  floor: string;
  room: string;
  nature: string;
  note: string;
  demo: boolean;
  enrichFull: Record<string, string | number | null> | null;
}

export async function loadEntities(): Promise<AdapterEntity[]> {
  const db = await getDb();
  if (db) {
    try {
      const rows = await db.select().from(entities);
      if (rows.length > 0) {
        // 数据环境隔离：正式查询排除 test 和 load_test 数据
        const productionRows = rows.filter(r => r.dataEnvironment === "production" || r.dataEnvironment === "demo");
        if (productionRows.length === 0) {
          // 所有数据都是压测数据，回退种子
        } else {
        const enrichRows = await db.select().from(enrichments);
        const eMap = new Map(enrichRows.map((r) => [r.eid, r]));
        return productionRows.map((r) => {
          const en = eMap.get(r.eid) ?? null;
          return {
            eid: r.eid,
            name: r.name,
            ind: r.ind,
            floor: r.floor,
            room: r.room,
            nature: r.nature,
            note: r.note ?? "",
            baseScore: extractBaseScore(r.dimsJson),
            hiringBase: r.hiringBase,
            cross: !!r.cross,
            tierRole: r.tierRole,
            signals: parseSignals(r.signalsJson),
            referralPath: r.referralPath,
            entryPoint: r.entryPoint,
            demo: !!r.demo,
            enrich: en
              ? { jobs: en.jobs, patents: en.patents, insured: en.insured, funding: en.funding, hiTech: en.hiTech, verified: en.verified, keyContact: en.keyContact, topJobs: en.topJobs }
              : null,
            enrichFull: en ? { ...en, id: undefined, importedAt: undefined } as unknown as Record<string, string | number | null> : null,
          };
        });
        }
      }
    } catch (err) {
      console.warn("[DataAdapter] DB read failed, fallback to seed:", err);
    }
  }
  // 种子回退（demo 数据）
  return PARK_SEED.map((s) => ({
    eid: s.eid, name: s.name, ind: s.ind, floor: s.floor, room: s.room, nature: s.nature,
    note: s.note ?? "", baseScore: s.baseScore, hiringBase: s.hiringBase, cross: !!s.cross,
    tierRole: s.tierRole ?? "tenant", signals: s.signals, referralPath: s.referralPath ?? null,
    entryPoint: s.entryPoint ?? null, demo: true, enrich: null, enrichFull: null,
  }));
}

function parseSignals(json: string | null): SeedSignal[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}
function extractBaseScore(dimsJson: string | null): number {
  if (!dimsJson) return 0;
  try { return JSON.parse(dimsJson).baseScore ?? 0; } catch { return 0; }
}

/* ---------- 生命周期最新状态 ---------- */
export async function loadLatestStages(): Promise<Map<string, Stage>> {
  const db = await getDb();
  const map = new Map<string, Stage>();
  if (!db) return map;
  try {
    const rows = await db.select().from(lifecycleEvents).orderBy(desc(lifecycleEvents.createdAt), desc(lifecycleEvents.id));
    for (const r of rows) {
      if (!map.has(r.eid)) map.set(r.eid, r.stage as Stage);
    }
  } catch (err) {
    console.warn("[DataAdapter] lifecycle read failed:", err);
  }
  return map;
}

/* ---------- 生命周期最新事件（含时间，供触达任务清单推演） ---------- */
export async function loadLatestStageEvents(): Promise<Map<string, { stage: Stage; at: Date }>> {
  const db = await getDb();
  const map = new Map<string, { stage: Stage; at: Date }>();
  if (!db) return map;
  try {
    const rows = await db.select().from(lifecycleEvents).orderBy(desc(lifecycleEvents.createdAt), desc(lifecycleEvents.id));
    for (const r of rows) {
      if (!map.has(r.eid)) map.set(r.eid, { stage: r.stage as Stage, at: r.createdAt });
    }
  } catch (err) {
    console.warn("[DataAdapter] lifecycle events read failed:", err);
  }
  return map;
}

/* ---------- 脱敏 ---------- */
export function maskEntityName(name: string): string {
  // 保留前2字符与行业后缀特征，中间以 * 替代（对外路演口径）
  if (name.length <= 4) return name[0] + "*".repeat(name.length - 1);
  const head = name.slice(0, 2);
  const tail = name.slice(-4);
  return `${head}${"*".repeat(Math.min(6, Math.max(2, name.length - 6)))}${tail}`;
}

function maskEnrich(full: Record<string, string | number | null> | null) {
  if (!full) return null;
  const masked = { ...full };
  if (typeof masked.uscc === "string" && masked.uscc) masked.uscc = masked.uscc.slice(0, 4) + "****" + String(masked.uscc).slice(-4);
  if (masked.legalRep) masked.legalRep = String(masked.legalRep)[0] + "**";
  if (masked.keyContact) masked.keyContact = "已脱敏";
  if (masked.referralVia) masked.referralVia = "已脱敏";
  return masked;
}

/* ---------- 快照构建（全后端计算，前端仅渲染此结构） ---------- */
export async function buildSnapshot(opts: { maskSensitive: boolean }) {
  const [rules, ents, stages] = await Promise.all([loadRules(), loadEntities(), loadLatestStages()]);
  const results = ents.map((x) => ({ ...calcEntity(x, rules), signals: x.signals }));
  const rMap = new Map(results.map((r) => [r.eid, r]));
  const kpis = calcKpis(results, rules);

  const items = ents
    .map((x) => {
      const r = rMap.get(x.eid)!;
      const stage: Stage = stages.get(x.eid) ?? "未触达";
      return {
        eid: x.eid,
        name: opts.maskSensitive ? maskEntityName(x.name) : x.name,
        floor: x.floor, room: x.room, ind: x.ind, nature: x.nature,
        cross: x.cross, note: x.note, demo: x.demo,
        hiring: x.hiringBase,
        tier: r.tier, score: r.score, pipeMatch: r.pipeMatch,
        dims: r.dims, enriched: r.enriched, scoreDelta: r.scoreDelta,
        risk: r.risk, nba: r.nba,
        signals: x.signals,
        pipeSignals: pipelineSignals(x, rules),
        intents: inferIntents(x, rules),
        path: x.referralPath, entry: x.entryPoint,
        stage,
        enrich: opts.maskSensitive ? maskEnrich(x.enrichFull) : x.enrichFull,
      };
    })
    .sort((a, b) => b.score - a.score);

  const hvEids = items.filter((i) => i.tier === "P0" || i.tier === "P1").map((i) => i.eid);
  const funnel = calcFunnel(stages, hvEids);

  return { kpis, items, funnel, stagesEnum: STAGES, generatedAt: Date.now() };
}

/* ---------- DB 写入助手（种子灌库 / 导入 / 状态标记） ---------- */
export async function seedDatabase(): Promise<{ inserted: number } | { error: string }> {
  const db = await getDb();
  if (!db) return { error: "数据库不可用" };
  const existing = await db.select({ eid: entities.eid }).from(entities);
  const have = new Set(existing.map((r) => r.eid));
  let inserted = 0;
  for (const s of PARK_SEED) {
    if (have.has(s.eid)) continue;
    await db.insert(entities).values({
      eid: s.eid, name: s.name, floor: s.floor, room: s.room, ind: s.ind, nature: s.nature,
      cross: s.cross ? 1 : 0, tierRole: s.tierRole ?? "tenant",
      hiringBase: (s.hiringBase === "中高" ? "中" : s.hiringBase) as "高" | "中" | "低" | "无",
      note: s.note ?? null, referralPath: s.referralPath ?? null, entryPoint: s.entryPoint ?? null,
      signalsJson: JSON.stringify(s.signals), dimsJson: JSON.stringify({ baseScore: s.baseScore }), demo: 1,
    });
    inserted++;
  }
  return { inserted };
}

export async function upsertEnrichment(row: Record<string, unknown> & { eid: string }) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const { eid, ...rest } = row;
  const existing = await db.select({ id: enrichments.id }).from(enrichments).where(eq(enrichments.eid, eid)).limit(1);
  if (existing.length > 0) {
    await db.update(enrichments).set(rest).where(eq(enrichments.eid, eid));
  } else {
    await db.insert(enrichments).values({ eid, ...rest });
  }
}

export async function appendLifecycleEvent(eid: string, stage: Stage, note: string | null, actor: string | null) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(lifecycleEvents).values({ eid, stage, note, actor });
}

export async function loadLifecycleHistory(eid: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(lifecycleEvents).where(eq(lifecycleEvents.eid, eid)).orderBy(desc(lifecycleEvents.createdAt), desc(lifecycleEvents.id));
}

export async function findEntityByName(name: string): Promise<string | null> {
  const ents = await loadEntities();
  const clean = name.trim();
  const hit = ents.find((e) => e.name === clean) ?? ents.find((e) => e.name.includes(clean) || clean.includes(e.name));
  return hit?.eid ?? null;
}

/* ---------- 任务打卡（周报数据源） ---------- */
export async function markTaskDone(eid: string, taskType: "首触" | "复访" | "培育跟进", note: string | null, actor: string | null) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.insert(taskCompletions).values({ eid, taskType, weekKey: isoWeekKey(), note, actor });
}

/** 撤销本周某企业某类任务的打卡（追加式表，撤销=删除本周该记录） */
export async function unmarkTaskDone(eid: string, taskType: "首触" | "复访" | "培育跟进") {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  await db.delete(taskCompletions).where(and(
    eq(taskCompletions.eid, eid), eq(taskCompletions.taskType, taskType), eq(taskCompletions.weekKey, isoWeekKey()),
  ));
}

/** 本周打卡记录 */
export async function loadWeekCompletions(weekKey: string = isoWeekKey()) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db.select().from(taskCompletions).where(eq(taskCompletions.weekKey, weekKey)).orderBy(desc(taskCompletions.createdAt));
  } catch { return []; }
}

/** 本周生命周期推进事件（周报"作战动态"） */
export async function loadWeekStageMoves(sinceDays = 7) {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.select().from(lifecycleEvents).orderBy(desc(lifecycleEvents.createdAt), desc(lifecycleEvents.id));
    const cutoff = Date.now() - sinceDays * 86400000;
    return rows.filter((r) => r.createdAt.getTime() >= cutoff);
  } catch { return []; }
}

/* ---------- 操作台账（轻量 Decision Ledger：只增不改） ---------- */
export async function appendLedger(
  action: string,
  targetEid: string | null,
  detail: string | null,
  actor: string | null,
  diff?: { before?: string | null; after?: string | null },
) {
  const db = await getDb();
  if (!db) return; // 台账写失败不阻断业务
  try {
    await db.insert(opsLedger).values({
      action, targetEid, detail: detail?.slice(0, 500) ?? null, actor,
      beforeJson: diff?.before ?? null, afterJson: diff?.after ?? null,
    });
  } catch (err) {
    console.warn("[Ledger] append failed:", err);
  }
}

export async function loadLedger(opts: { limit?: number; action?: string; actor?: string; sinceDays?: number } = {}) {
  const db = await getDb();
  if (!db) return [];
  try {
    const rows = await db.select().from(opsLedger).orderBy(desc(opsLedger.createdAt), desc(opsLedger.id)).limit(500);
    let out = rows;
    if (opts.action) out = out.filter((r) => r.action === opts.action);
    if (opts.actor) out = out.filter((r) => (r.actor ?? "").includes(opts.actor!));
    if (opts.sinceDays) {
      const cutoff = Date.now() - opts.sinceDays * 86400000;
      out = out.filter((r) => r.createdAt.getTime() >= cutoff);
    }
    return out.slice(0, opts.limit ?? 100);
  } catch { return []; }
}

/* ---------- 周报聚合（路由 weeklyReview 与定时推送共用） ---------- */
export async function buildWeeklyReview(opts: { maskSensitive: boolean } = { maskSensitive: false }) {
  const [snap, stageEvents, rules, doneRows, moves, stages] = await Promise.all([
    buildSnapshot({ maskSensitive: opts.maskSensitive }),
    loadLatestStageEvents(),
    loadRules(),
    loadWeekCompletions(),
    loadWeekStageMoves(7),
    loadLatestStages(),
  ]);
  const hv = snap.items.filter((i) => i.tier === "P0" || i.tier === "P1");
  const openTasks = buildTaskList(hv, stageEvents, new Date(), rules.tasks);
  const doneSet = new Set(doneRows.map((d) => `${d.eid}|${d.taskType}`));
  const stillOpen = openTasks.filter((t) => !doneSet.has(`${t.eid}|${t.taskType}`));
  const byType: Record<string, { open: number; done: number }> = { 首触: { open: 0, done: 0 }, 复访: { open: 0, done: 0 }, 培育跟进: { open: 0, done: 0 } };
  stillOpen.forEach((t) => { byType[t.taskType].open++; });
  doneRows.forEach((d) => { if (byType[d.taskType]) byType[d.taskType].done++; });
  const nameMap = new Map(snap.items.map((i) => [i.eid, i.name]));
  const done = doneRows.length;
  const total = done + stillOpen.length;
  return {
    weekKey: isoWeekKey(),
    openTasks: stillOpen.length,
    doneTasks: done,
    completionRate: total ? Math.round((done / total) * 100) : 100,
    byType,
    doneList: doneRows.map((d) => ({ eid: d.eid, name: nameMap.get(d.eid) ?? d.eid, taskType: d.taskType, note: d.note, actor: d.actor, at: d.createdAt })),
    stageMoves: moves.map((m) => ({ eid: m.eid, name: nameMap.get(m.eid) ?? m.eid, stage: m.stage, note: m.note, actor: m.actor, at: m.createdAt })),
    funnelNow: calcFunnel(stages, hv.map((i) => i.eid)),
    generatedAt: Date.now(),
  };
}
/* ---------- 迭代9 · 可解释性七问视图组装（零新数据源） ---------- */
export async function buildExplainForEid(eid: string, opts: { maskSensitive: boolean }) {
  const [rules, ents, history] = await Promise.all([loadRules(), loadEntities(), loadLifecycleHistory(eid)]);
  const x = ents.find((s) => s.eid === eid);
  if (!x) return null;
  const now = new Date();
  const results = ents.map((s) => calcEntity(s, rules, now));
  const mine = results.find((r) => r.eid === eid)!;
  // 雷达排名：仅统计租户（有分数的）
  const ranked = results.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  const rankIdx = ranked.findIndex((r) => r.eid === eid);
  const rank = rankIdx >= 0 ? rankIdx + 1 : null;
  const timeline = history.map((h) => ({
    at: h.createdAt,
    event: `${h.stage}${h.note ? ` · ${h.note}` : ""}`,
    actor: opts.maskSensitive ? (h.actor ? "已脱敏" : null) : h.actor,
  }));
  const view = buildExplain(x, mine, rank, timeline, rules, now);
  if (opts.maskSensitive) {
    view.evidence.fields = view.evidence.fields.map((f) => (f.label === "融资/股改" ? { ...f, value: "已脱敏" } : f));
  }
  return { ...view, name: opts.maskSensitive ? maskEntityName(x.name) : x.name, intents: inferIntents(x, rules) };
}

/* ============================================================
 * 迭代10 · 因果时间线：聚合 4 类事件源为单一时间轴（倒序）
 * 事件源：信号命中（seed/富集信号日期）/ 富集写入（opsLedger）/ 生命周期触达 / 任务打卡
 * 每事件带因果注记（impact），规则变更为全局事件不入企业轴（v1 边界，规划中）
 * ============================================================ */
export interface TimelineEvent {
  at: Date;
  type: "signal" | "enrich" | "stage" | "task" | "ai_parse";
  title: string;
  detail: string | null;
  actor: string | null;
  impact: string | null;   // 因果注记，如 "评分构成 +6"
}

export async function buildTimelineForEid(eid: string, opts: { maskSensitive: boolean }) {
  const [rules, ents, history, ledgerRows] = await Promise.all([
    loadRules(), loadEntities(), loadLifecycleHistory(eid), loadLedger({ limit: 500, sinceDays: 365 }),
  ]);
  const x = ents.find((s) => s.eid === eid);
  if (!x) return null;
  const now = new Date();
  const r = calcEntity(x, rules, now);
  const events: TimelineEvent[] = [];

  // ① 信号命中（兼容两种日期：种子 MM-DD 推断年份 / DB 富集信号 YYYY-MM-DD 全日期）
  for (const s of x.signals) {
    let at: Date | null = null;
    const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.d);
    const short = /^(\d{2})-(\d{2})$/.exec(s.d);
    if (full) {
      at = new Date(parseInt(full[1]), parseInt(full[2]) - 1, parseInt(full[3]));
    } else if (short) {
      at = new Date(now.getFullYear(), parseInt(short[1]) - 1, parseInt(short[2]));
      if (at.getTime() > now.getTime()) at = new Date(now.getFullYear() - 1, parseInt(short[1]) - 1, parseInt(short[2]));
    }
    if (!at) continue;
    events.push({
      at, type: "signal", title: `信号命中：${s.t}`,
      detail: `Tier-${s.tier} 信号（${s.tier === 1 ? "强承诺动作" : "一般动态"}）`,
      actor: null,
      impact: `信号加分通道（T${s.tier}，随半衰期衰减）`,
    });
  }

  // ② 富集写入 / AI 解析（opsLedger 中 detail 含本企业 eid 的导入/解析记录）
  for (const l of ledgerRows) {
    const detail = l.detail ?? "";
    if (!detail.includes(eid)) continue;
    if (l.action === "import_enrichment" || l.action === "ai_parse_intel" || l.action === "ai_parse_intel_batch") {
      events.push({
        at: l.createdAt,
        type: l.action === "import_enrichment" ? "enrich" : "ai_parse",
        title: l.action === "import_enrichment" ? "情报富集写入（Excel 导入）" : "情报富集写入（AI 解析）",
        detail: opts.maskSensitive ? "已脱敏" : detail.slice(0, 120),
        actor: opts.maskSensitive ? (l.actor ? "已脱敏" : null) : l.actor,
        impact: r.enriched ? `富集修正 ${r.scoreDelta >= 0 ? "+" : ""}${r.scoreDelta}（当前口径）` : null,
      });
    } else if (l.action === "task_done" && detail.includes(eid)) {
      events.push({
        at: l.createdAt, type: "task", title: "任务打卡完成",
        detail: opts.maskSensitive ? "已脱敏" : detail.slice(0, 120),
        actor: opts.maskSensitive ? (l.actor ? "已脱敏" : null) : l.actor,
        impact: "作战节奏推进（计入周报完成率）",
      });
    }
  }

  // ③ 生命周期触达
  for (const h of history) {
    events.push({
      at: h.createdAt, type: "stage", title: `状态推进：${h.stage}`,
      detail: h.note,
      actor: opts.maskSensitive ? (h.actor ? "已脱敏" : null) : h.actor,
      impact: "转化漏斗位置更新",
    });
  }

  events.sort((a, b) => b.at.getTime() - a.at.getTime());
  return {
    eid,
    name: opts.maskSensitive ? maskEntityName(x.name) : x.name,
    score: r.score, tier: r.tier,
    intents: inferIntents(x, rules),
    events: events.slice(0, 60),
    note: "v1 边界：规则变更为全局事件（见规则中心台账），暂不并入单企业时间轴",
    generatedAt: Date.now(),
  };
}
