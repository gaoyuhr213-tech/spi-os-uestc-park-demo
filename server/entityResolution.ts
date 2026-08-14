/* ============================================================
 * 迭代17 · 工单2 · 实体解析引擎（Entity Resolution）
 *
 * 手工 eid → 引擎：以 USCC 为主键锚点，归一化 + 规则/模糊匹配打分，
 * 高置信自动合并（写 mergeDecisions auto_merged + opsLedger 留痕），
 * 低置信进入人工消歧队列（pending），人工确认合并/拆分/存疑，可撤销。
 * ============================================================ */
import { eq, inArray } from "drizzle-orm";
import { entities, enrichments, mergeDecisions, opsLedger } from "../drizzle/schema";
import { getDb } from "./db";
import type { ResolvedEntityDraft } from "./aclTransform";

/* ---------- NormalizationService：名称归一化 ---------- */

/** 公司后缀词典（去后缀归一） */
const SUFFIXES = [
  "股份有限公司", "有限责任公司", "有限公司", "股份公司", "科技有限公司",
  "信息技术有限公司", "网络科技有限公司", "公司", "研究院", "中心", "事务所",
];
/** 地域前缀词典 */
const REGION_PREFIXES = ["成都", "四川", "北京", "上海", "深圳", "广州", "杭州", "重庆", "西南", "中国"];
/** 别名词典：简称 → 全称关键词（园区实勘口径，可配置扩充） */
const ALIAS_DICT: Record<string, string> = {
  "中科维讯": "中科维讯",
  "智汇广联": "智汇广联",
  "锦途": "锦途",
  "川天铖": "川天铖",
  "眸视": "眸视科技",
};

/** 名称归一化：去地域前缀 → 去公司后缀 → 去空白/括号注记 */
export function normalizeName(raw: string): string {
  let s = raw.trim().replace(/[（(].*?[)）]/g, "").replace(/\s+/g, "");
  for (const p of REGION_PREFIXES) if (s.startsWith(p)) { s = s.slice(p.length); break; }
  // 后缀按最长优先剥离
  for (const suf of [...SUFFIXES].sort((a, b) => b.length - a.length)) {
    if (s.endsWith(suf)) { s = s.slice(0, -suf.length); break; }
  }
  return s || raw.trim();
}

/** 别名归一：命中词典时返回规范核心名 */
export function aliasResolve(core: string): string {
  for (const [alias, canonical] of Object.entries(ALIAS_DICT)) {
    if (core.includes(alias)) return canonical;
  }
  return core;
}

/* ---------- MatchingService：规则 + 模糊匹配打分 ---------- */

/** 双字符 bigram Dice 相似度（中文名模糊匹配） */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = (s: string) => { const g: string[] = []; for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2)); return g; };
  const ga = grams(a), gb = new Set(grams(b));
  const hit = ga.filter((x) => gb.has(x)).length;
  return (2 * hit) / (ga.length + gb.size + (ga.length - new Set(ga).size));
}

export interface MatchCandidate {
  eid: string;
  name: string;
  confidence: number;      // 0-100
  rulesHit: string[];      // 命中的匹配规则（证据链）
}

/** 对一条外部实体草稿，在现有主数据中打分匹配 */
export async function matchEntity(draft: ResolvedEntityDraft): Promise<MatchCandidate[]> {
  const db = await getDb();
  if (!db) return [];
  const all = await db.select({ eid: entities.eid, name: entities.name }).from(entities);
  const usccMap = new Map<string, string>(); // uscc -> eid
  const enr = await db.select({ eid: enrichments.eid, uscc: enrichments.uscc }).from(enrichments);
  for (const e of enr) if (e.uscc) usccMap.set(e.uscc, e.eid);

  const coreIn = aliasResolve(normalizeName(draft.rawName));
  const out: MatchCandidate[] = [];

  for (const ent of all) {
    const rules: string[] = [];
    let conf = 0;
    // R1 · USCC 精确命中（主键锚点）：直接 100
    if (draft.uscc && usccMap.get(draft.uscc) === ent.eid) { rules.push(`USCC精确命中(${draft.uscc})`); conf = 100; }
    else {
      const coreEnt = aliasResolve(normalizeName(ent.name));
      // R2 · 归一化核心名全等
      if (coreIn === coreEnt) { rules.push(`归一化核心名全等(${coreIn})`); conf = Math.max(conf, 92); }
      // R3 · 简称包含（一方是另一方的子串，长度≥2）
      else if (coreIn.length >= 2 && (coreEnt.includes(coreIn) || coreIn.includes(coreEnt))) {
        rules.push(`简称包含(${coreIn}⊂${coreEnt})`); conf = Math.max(conf, 80);
      }
      // R4 · bigram 模糊相似
      else {
        const sim = diceSimilarity(coreIn, coreEnt);
        if (sim >= 0.6) { rules.push(`模糊相似 dice=${sim.toFixed(2)}`); conf = Math.max(conf, Math.round(sim * 85)); }
      }
    }
    if (conf > 0) out.push({ eid: ent.eid, name: ent.name, confidence: conf, rulesHit: rules });
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, 5);
}

/* ---------- 解析裁定：auto-merge / 消歧队列 / 未匹配 ---------- */

export const AUTO_MERGE_THRESHOLD = 90;   // ≥90 自动合并
export const QUEUE_THRESHOLD = 60;        // 60-89 人工消歧队列

export type ResolutionOutcome =
  | { kind: "auto"; eid: string; confidence: number; mergeId: number | null }
  | { kind: "queued"; eid: string; confidence: number; mergeId: number | null }
  | { kind: "unmatched"; confidence: 0 };

/** 摄入记录的实体解析入口（ACL 唯一调用方） */
export async function resolveIncoming(draft: ResolvedEntityDraft, actor: string): Promise<ResolutionOutcome> {
  const db = await getDb();
  if (!db) return { kind: "unmatched", confidence: 0 };
  const candidates = await matchEntity(draft);
  if (candidates.length === 0) return { kind: "unmatched", confidence: 0 };
  const top = candidates[0];

  const evidence = {
    rawName: draft.rawName, uscc: draft.uscc ?? null,
    normalized: aliasResolve(normalizeName(draft.rawName)),
    rulesHit: top.rulesHit, candidates: candidates.map((c) => ({ eid: c.eid, name: c.name, confidence: c.confidence })),
  };

  if (top.confidence >= AUTO_MERGE_THRESHOLD) {
    // 高置信：自动归属（auto_merged 决策留痕）
    await db.insert(mergeDecisions).values({
      sourceEids: JSON.stringify([draft.rawName]), targetEid: top.eid,
      confidence: top.confidence, evidenceJson: JSON.stringify(evidence),
      status: "auto_merged", decidedBy: "engine", decidedAt: new Date(),
    });
    const mergeId = await lastMergeId(top.eid);
    return { kind: "auto", eid: top.eid, confidence: top.confidence, mergeId };
  }
  if (top.confidence >= QUEUE_THRESHOLD) {
    // 低置信：进入人工消歧队列，先暂记到 top 候选（可人工拆分）
    await db.insert(mergeDecisions).values({
      sourceEids: JSON.stringify([draft.rawName]), targetEid: top.eid,
      confidence: top.confidence, evidenceJson: JSON.stringify(evidence), status: "pending",
    });
    const mergeId = await lastMergeId(top.eid);
    return { kind: "queued", eid: top.eid, confidence: top.confidence, mergeId };
  }
  return { kind: "unmatched", confidence: 0 };
}

async function lastMergeId(targetEid: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ id: mergeDecisions.id }).from(mergeDecisions).where(eq(mergeDecisions.targetEid, targetEid));
  return rows.length > 0 ? Math.max(...rows.map((r) => r.id)) : null;
}

/* ---------- 存量主数据扫描：跨楼层同名/简称重复 ---------- */

/** 扫描存量 entities，发现疑似重复对并生成合并决策（幂等：已有同 target+source 记录则跳过） */
export async function scanExistingDuplicates(actor: string): Promise<{ created: number; pairs: Array<{ a: string; b: string; confidence: number }> }> {
  const db = await getDb();
  if (!db) return { created: 0, pairs: [] };
  const all = await db.select({ eid: entities.eid, name: entities.name, floor: entities.floor, cross: entities.cross }).from(entities);
  const existing = await db.select().from(mergeDecisions);
  const seen = new Set(existing.map((m) => `${m.targetEid}|${m.sourceEids}`));
  let created = 0;
  const pairs: Array<{ a: string; b: string; confidence: number }> = [];

  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const coreA = aliasResolve(normalizeName(a.name)), coreB = aliasResolve(normalizeName(b.name));
      let conf = 0; const rules: string[] = [];
      if (coreA === coreB) { conf = 95; rules.push(`归一化核心名全等(${coreA})`); }
      else {
        const sim = diceSimilarity(coreA, coreB);
        if (sim >= 0.75) { conf = Math.round(sim * 88); rules.push(`模糊相似 dice=${sim.toFixed(2)}`); }
      }
      if (conf < QUEUE_THRESHOLD) continue;
      const key = `${a.eid}|${JSON.stringify([b.eid])}`;
      if (seen.has(key)) continue;
      const evidence = { rulesHit: rules, floors: [a.floor, b.floor], names: [a.name, b.name], note: "存量扫描：跨楼层/同名重复候选" };
      await db.insert(mergeDecisions).values({
        sourceEids: JSON.stringify([b.eid]), targetEid: a.eid, confidence: conf,
        evidenceJson: JSON.stringify(evidence),
        status: conf >= AUTO_MERGE_THRESHOLD ? "auto_merged" : "pending",
        decidedBy: conf >= AUTO_MERGE_THRESHOLD ? "engine" : null,
        decidedAt: conf >= AUTO_MERGE_THRESHOLD ? new Date() : null,
      });
      seen.add(key);
      created++; pairs.push({ a: a.name, b: b.name, confidence: conf });
      await db.insert(opsLedger).values({
        action: "entity_scan", targetEid: a.eid,
        detail: `实体解析扫描：${a.name} ~ ${b.name} 置信度${conf}${conf >= AUTO_MERGE_THRESHOLD ? "（自动合并）" : "（进入消歧队列）"}`,
        actor, afterJson: JSON.stringify(evidence),
      });
    }
  }
  return { created, pairs };
}

/* ---------- 人工消歧队列操作 ---------- */

export async function listDisambiguationQueue() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(mergeDecisions);
  const eids = new Set<string>();
  for (const r of rows) {
    eids.add(r.targetEid);
    try { for (const s of JSON.parse(r.sourceEids)) if (typeof s === "string" && s.startsWith("E")) eids.add(s); } catch { /* raw name */ }
  }
  const ents = eids.size > 0 ? await db.select({ eid: entities.eid, name: entities.name, floor: entities.floor }).from(entities).where(inArray(entities.eid, Array.from(eids))) : [];
  const nameMap = new Map(ents.map((e) => [e.eid, e]));
  return rows.sort((a, b) => b.id - a.id).map((r) => {
    let sources: string[] = [];
    try { sources = JSON.parse(r.sourceEids); } catch { sources = [r.sourceEids]; }
    let evidence: unknown = null;
    try { evidence = JSON.parse(r.evidenceJson); } catch { evidence = r.evidenceJson; }
    return {
      id: r.id, status: r.status, confidence: r.confidence,
      targetEid: r.targetEid, target: nameMap.get(r.targetEid) ?? null,
      sources: sources.map((s) => ({ key: s, entity: nameMap.get(s) ?? null })),
      evidence, decidedBy: r.decidedBy, decidedAt: r.decidedAt, createdAt: r.createdAt,
    };
  });
}

/** 人工裁定：confirm 确认合并 / split 拆分（保持独立） / dismiss 存疑搁置；revert 撤销回 pending */
export async function decideMerge(opts: { id: number; action: "confirm" | "split" | "dismiss" | "revert"; actor: string }) {
  const db = await getDb();
  if (!db) return { ok: false as const, error: "数据库不可用" };
  const [row] = await db.select().from(mergeDecisions).where(eq(mergeDecisions.id, opts.id)).limit(1);
  if (!row) return { ok: false as const, error: "记录不存在" };
  const map = { confirm: "confirmed", split: "split", dismiss: "dismissed", revert: "pending" } as const;
  const next = map[opts.action];
  const before = { status: row.status, decidedBy: row.decidedBy };
  await db.update(mergeDecisions).set({
    status: next,
    decidedBy: opts.action === "revert" ? null : opts.actor,
    decidedAt: opts.action === "revert" ? null : new Date(),
  }).where(eq(mergeDecisions.id, opts.id));
  await db.insert(opsLedger).values({
    action: "entity_merge", targetEid: row.targetEid,
    detail: `消歧裁定 #${opts.id}：${row.status} → ${next}（置信度${row.confidence}）`,
    actor: opts.actor, beforeJson: JSON.stringify(before), afterJson: JSON.stringify({ status: next }),
  });
  return { ok: true as const, status: next };
}
