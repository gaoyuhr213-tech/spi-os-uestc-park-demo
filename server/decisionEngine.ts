/* 迭代13 · 决策引擎（Decision Loop 核心）：
   Signal → Need Canvas（7维需求画布）→ Lifecycle Stage（生命周期阶段先验）
   → Decision（决策对象，5类，可解释原因链 + 星级）
   对标：Palantir（决策一等对象）/ 6sense（Intent→Buying Stage→Action）
   公理：全部后端规则计算、可解释、幂等生成（genKey 防重）。 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { decisions, resources, type DecisionRow } from "../drizzle/schema";
import { loadEntities, loadLatestStages, loadRules, maskEntityName, type AdapterEntity } from "./dataAdapter";
import { calcEntity, inferIntents, type Stage } from "./ruleEngine";
import { matchResources, type ResourceMatch } from "./resourceMatch";

/* ============ 1. 需求画布（Enterprise Need Canvas） ============ */
export type NeedTag = "talent" | "funding" | "policy" | "market" | "rnd" | "digital" | "legal";
export const NEED_LABEL: Record<NeedTag, string> = {
  talent: "人才", funding: "融资", policy: "政策", market: "市场", rnd: "研发", digital: "数字化", legal: "法务",
};
export interface NeedItem {
  tag: NeedTag;
  label: string;
  stars: number; // 1-5 需求强度
  basis: string[]; // 推断依据（可解释）
}

/** 由信号/富集/意图/生命周期推断 7 维需求强度（纯规则，可解释） */
export function buildNeedCanvas(x: AdapterEntity, stagePrior: LifecyclePhase): NeedItem[] {
  const sig = x.signals.map((s) => s.t).join("；");
  const en = (x.enrichFull ?? {}) as Record<string, string | number | null>;
  const items: NeedItem[] = [];
  const push = (tag: NeedTag, stars: number, basis: string[]) => {
    if (stars > 0) items.push({ tag, label: NEED_LABEL[tag], stars: Math.min(5, stars), basis });
  };

  /* 人才：招聘基线 + 在招岗位 + 批量招聘/高管信号 */
  {
    let s = x.hiringBase === "高" ? 3 : x.hiringBase === "中" ? 2 : x.hiringBase === "低" ? 1 : 0;
    const b: string[] = s > 0 ? [`基线招聘强度=${x.hiringBase}（楼层实勘）`] : [];
    const jobs = Number(en.jobs ?? 0);
    if (jobs >= 10) { s += 2; b.push(`在招岗位 ${jobs} 个（已回填）`); }
    else if (jobs >= 3) { s += 1; b.push(`在招岗位 ${jobs} 个（已回填）`); }
    if (/批量招聘/.test(sig)) { s += 1; b.push("批量招聘信号"); }
    if (/高管|合伙人|负责人/.test(sig)) { s += 1; b.push("高管寻访信号"); }
    push("talent", s, b);
  }
  /* 融资：融资/股改字段 + 融资类信号 + 阶段先验 */
  {
    let s = 0; const b: string[] = [];
    const funding = String(en.funding ?? "");
    if (/轮|融资/.test(funding)) { s += 2; b.push(`融资记录：${funding}（已回填）`); }
    if (/融资|轮/.test(sig)) { s += 2; b.push("融资类活跃信号"); }
    if (/股改|上市/.test(sig) || /股改/.test(funding)) { s += 2; b.push("股改/上市动作"); }
    if (stagePrior.phase === "Pre-A" || stagePrior.phase === "A轮") { s += 1; b.push(`阶段先验：${stagePrior.phase} 默认融资需求`); }
    push("funding", s, b);
  }
  /* 政策：高企资质 + 专利/软著 + 股改（政策申报窗口） */
  {
    let s = 0; const b: string[] = [];
    if (String(en.hiTech ?? "") === "是") { s += 2; b.push("高企资质（政策续期/叠加申报）"); }
    const pat = Number(en.patents ?? 0), soft = Number(en.softCopyrights ?? 0);
    if (pat + soft >= 5) { s += 2; b.push(`知识产权 ${pat + soft} 项（专精特新/高企申报基础）`); }
    else if (pat + soft >= 1) { s += 1; b.push(`知识产权 ${pat + soft} 项`); }
    if (/股改/.test(sig)) { s += 1; b.push("股改动作（上市奖补政策窗口）"); }
    push("policy", s, b);
  }
  /* 市场：扩张/异地设点/中标信号 */
  {
    let s = 0; const b: string[] = [];
    if (/异地|设点|分公司/.test(sig)) { s += 2; b.push("异地设点信号（市场扩张）"); }
    if (/扩租|独占|扩张/.test(sig)) { s += 1; b.push("空间扩张信号"); }
    if (String(en.bidAmount ?? "")) { s += 2; b.push(`中标记录 ${en.bidAmount}（政企市场活跃）`); }
    if (x.cross) { s += 1; b.push("跨楼层布局（业务扩张佐证）"); }
    push("market", s, b);
  }
  /* 研发：技术密度行业 + 研发招聘 + 知识产权增速 */
  {
    let s = 0; const b: string[] = [];
    if (["AI", "芯片", "软件", "通信"].includes(x.ind)) { s += 1; b.push(`技术密集行业（${x.ind}）`); }
    if (/算法|CV|研发|技术/.test(sig)) { s += 2; b.push("研发类招聘信号"); }
    if (Number(en.patents ?? 0) >= 3) { s += 1; b.push("专利储备（持续研发投入）"); }
    push("rnd", s, b);
  }
  /* 数字化：传统行业 + 无软著 + 规模化（参保多） */
  {
    let s = 0; const b: string[] = [];
    if (!["AI", "软件", "芯片", "通信"].includes(x.ind)) { s += 1; b.push(`非软件行业（${x.ind}），数字化空间大`); }
    if (Number(en.insured ?? 0) >= 50 && Number(en.softCopyrights ?? 0) === 0) { s += 2; b.push("规模化但无自研软件资产"); }
    push("digital", s, b);
  }
  /* 法务：股改/IPO 准备 + 融资协议 */
  {
    let s = 0; const b: string[] = [];
    if (/股改|上市/.test(sig)) { s += 3; b.push("股改/上市（券商/律所/财税刚需）"); }
    if (/融资|轮/.test(sig)) { s += 1; b.push("融资协议法务需求"); }
    if (stagePrior.phase === "IPO准备") { s += 2; b.push("阶段先验：IPO准备默认董秘/法务/券商需求"); }
    push("legal", s, b);
  }
  return items.sort((a, b) => b.stars - a.stars);
}

/* ============ 2. 企业生命周期阶段（Enterprise Lifecycle） ============ */
export type Phase = "种子期" | "初创期" | "成长期" | "Pre-A" | "A轮" | "B轮及后" | "IPO准备" | "已上市" | "产业龙头";
export interface LifecyclePhase {
  phase: Phase;
  basis: string[]; // 推断依据
  defaultNeeds: NeedTag[]; // 阶段默认需求先验
}
const PHASE_NEEDS: Record<Phase, NeedTag[]> = {
  种子期: ["talent", "funding"], 初创期: ["talent", "market"], 成长期: ["talent", "market", "policy"],
  "Pre-A": ["funding", "talent", "legal"], A轮: ["funding", "talent", "market"], B轮及后: ["market", "talent", "digital"],
  IPO准备: ["legal", "policy", "funding"], 已上市: ["market", "digital"], 产业龙头: ["digital", "rnd"],
};

/** 由富集数据 + 信号推断生命周期阶段（保守规则，无数据回退初创/成长） */
export function inferLifecycle(x: AdapterEntity): LifecyclePhase {
  const en = (x.enrichFull ?? {}) as Record<string, string | number | null>;
  const sig = x.signals.map((s) => s.t).join("；");
  const funding = String(en.funding ?? "");
  const insured = Number(en.insured ?? 0);
  const basis: string[] = [];
  let phase: Phase = "初创期";

  if (/股改|上市辅导|IPO/.test(sig) || /股改/.test(funding)) {
    phase = "IPO准备"; basis.push("股改/上市辅导动作");
  } else if (/B轮|C轮|D轮/.test(funding)) {
    phase = "B轮及后"; basis.push(`融资记录：${funding}`);
  } else if (/A轮/.test(funding)) {
    phase = "A轮"; basis.push(`融资记录：${funding}`);
  } else if (/天使|种子|Pre-?A/i.test(funding)) {
    phase = "Pre-A"; basis.push(`融资记录：${funding}`);
  } else if (insured >= 100) {
    phase = "B轮及后"; basis.push(`参保 ${insured} 人（规模推断，未见融资记录）`);
  } else if (insured >= 30) {
    phase = "成长期"; basis.push(`参保 ${insured} 人`);
  } else if (insured > 0) {
    phase = "初创期"; basis.push(`参保 ${insured} 人`);
  } else {
    basis.push("暂无融资/规模数据，默认初创期【待核验】");
  }
  if (x.tierRole === "operator") { phase = "产业龙头"; basis.length = 0; basis.push("园区运营方/龙头主体"); }
  return { phase, basis, defaultNeeds: PHASE_NEEDS[phase] };
}

/* ============ 3. 决策生成（Decision Generation） ============ */
export type DType = "contact" | "mentor" | "hr_service" | "policy" | "referral";
export const DTYPE_LABEL: Record<DType, string> = {
  contact: "立即联系", mentor: "安排导师", hr_service: "推荐 HR 服务", policy: "政策申报辅导", referral: "校友/暖引荐",
};
/** 决策类型 → 归因收入层（商业模式六层映射） */
export const DTYPE_REVENUE: Record<DType, string> = {
  contact: "operation", mentor: "operation", hr_service: "marketplace", policy: "consulting", referral: "marketplace",
};

export interface DecisionDraft {
  eid: string;
  dtype: DType;
  title: string;
  reason: string[];
  stars: number;
  needTag: NeedTag | null;
}

/** 决策生成规则（可解释）：需求画布 × 阶段 × 信号 → 决策草案 */
export function draftDecisions(x: AdapterEntity, tier: string, stage: Stage, canvas: NeedItem[], lc: LifecyclePhase): DecisionDraft[] {
  if (tier !== "P0" && tier !== "P1") return [];
  const out: DecisionDraft[] = [];
  const need = (t: NeedTag) => canvas.find((c) => c.tag === t);
  const sig = x.signals.map((s) => s.t).join("；");

  /* contact：P0 未触达 + 人才需求 ≥3 星 → 立即联系（融资窗口/扩张窗口加星） */
  const talent = need("talent");
  if (stage === "未触达" && talent && talent.stars >= 3) {
    let stars = tier === "P0" ? 4 : 3;
    const reason = [`${tier} 未触达`, ...talent.basis.slice(0, 2)];
    if (/扩租|独占|扩张|异地/.test(sig)) { stars += 1; reason.push("扩张窗口期（时效性）"); }
    out.push({ eid: x.eid, dtype: "contact", title: `立即联系：${talent.stars}星人才需求，处扩张窗口`, reason, stars: Math.min(5, stars), needTag: "talent" });
  }
  /* hr_service：人才需求 ≥4 星 → 推荐高于人力（Marketplace 核心） */
  if (talent && talent.stars >= 4) {
    out.push({
      eid: x.eid, dtype: "hr_service", title: "推荐 HR 服务：批量招聘/实习转化方案（高于人力）",
      reason: [...talent.basis.slice(0, 2), "信软学院管道可直供"], stars: talent.stars >= 5 ? 5 : 4, needTag: "talent",
    });
  }
  /* mentor：研发需求 ≥3 星 且 技术密集行业 → 安排导师/教授 */
  const rnd = need("rnd");
  if (rnd && rnd.stars >= 3) {
    out.push({
      eid: x.eid, dtype: "mentor", title: "安排导师对接：技术瓶颈/研发路线咨询（电子科大教授）",
      reason: rnd.basis.slice(0, 3), stars: rnd.stars >= 4 ? 4 : 3, needTag: "rnd",
    });
  }
  /* policy：政策需求 ≥3 星 → 政策申报辅导 */
  const policy = need("policy");
  if (policy && policy.stars >= 3) {
    out.push({
      eid: x.eid, dtype: "policy", title: "政策申报辅导：高企/专精特新/上市奖补窗口",
      reason: policy.basis.slice(0, 3), stars: policy.stars >= 4 ? 4 : 3, needTag: "policy",
    });
  }
  /* referral：融资/法务需求 ≥3 星 或 IPO准备阶段 → 校友/投资人暖引荐 */
  const funding = need("funding"); const legal = need("legal");
  if ((funding && funding.stars >= 3) || (legal && legal.stars >= 3) || lc.phase === "IPO准备") {
    const basis = [...(funding?.basis.slice(0, 2) ?? []), ...(legal?.basis.slice(0, 1) ?? [])];
    if (lc.phase === "IPO准备") basis.push("IPO准备阶段（券商/律所/董秘刚需）");
    out.push({
      eid: x.eid, dtype: "referral", title: `暖引荐：${lc.phase === "IPO准备" ? "券商/律所/财税生态" : "校友投资人/产业资本"}对接`,
      reason: basis.slice(0, 3), stars: lc.phase === "IPO准备" ? 5 : 4, needTag: funding && funding.stars >= 3 ? "funding" : "legal",
    });
  }
  return out;
}

/** 幂等键：eid:dtype:needTag（同企业同类型同需求维度只生成一条活跃决策） */
function genKeyOf(d: DecisionDraft): string {
  return `${d.eid}:${d.dtype}:${d.needTag ?? "na"}`;
}

/** 决策生成主流程：全量 P0/P1 扫描 → 草案 → 幂等入库（含资源匹配快照） */
export async function generateDecisions(actor: string): Promise<{ created: number; skipped: number }> {
  const db = await getDb();
  if (!db) return { created: 0, skipped: 0 };
  const [rules, ents, stages] = await Promise.all([loadRules(), loadEntities(), loadLatestStages()]);
  const { snapshotRuleVersions, appendOrAbort } = await import("./decisionLedger");
  const ruleVersions = await snapshotRuleVersions();
  const now = new Date();
  let created = 0, skipped = 0;

  const existing = await db.select({ genKey: decisions.genKey, status: decisions.status }).from(decisions);
  const activeKeys = new Set(existing.filter((e) => e.status !== "dismissed").map((e) => e.genKey));

  for (const x of ents) {
    const r = calcEntity(x, rules, now);
    if (r.tier !== "P0" && r.tier !== "P1") continue;
    const stage = stages.get(x.eid) ?? "未触达";
    const lc = inferLifecycle(x);
    const canvas = buildNeedCanvas(x, lc);
    const drafts = draftDecisions(x, r.tier, stage, canvas, lc);
    for (const d of drafts) {
      const key = genKeyOf(d);
      if (activeKeys.has(key)) { skipped++; continue; }
      const matches = await matchResources(d.needTag, x.ind, lc.phase, 3);
      /* 迭代18 · 工单3 · ADR-01：决策创建必带 basedOn 完整溯源链 */
      const basedOn = JSON.stringify({
        signals: (x.signals ?? []).slice(0, 6).map((s) => ({ t: s.t, d: s.d, tier: s.tier })),
        rules: [`decision-engine:${d.dtype}`, `need-canvas:${d.needTag ?? "na"}`, `lifecycle:${lc.phase}`],
        ruleVersions,
        evidence: d.reason,
        canvas: Object.fromEntries(canvas.map((c) => [c.tag, c.stars])),
        lifecycle: lc.phase,
        score: { lead: r.score, tier: r.tier },
        at: now.toISOString(),
      });
      await db.insert(decisions).values({
        eid: d.eid, dtype: d.dtype, title: d.title, reason: d.reason.join("；"),
        stars: d.stars, needTag: d.needTag, matchedResources: JSON.stringify(matches),
        status: "suggested", genKey: key, revenueTier: DTYPE_REVENUE[d.dtype], basedOn,
      });
      activeKeys.add(key);
      created++;
    }
  }
  /* 工单3 · append-or-abort：决策生成批次的台账写失败必须让整个动作失败（ADR-16 不静默） */
  if (created > 0) {
    await appendOrAbort({
      action: "decision_generate", targetEid: null,
      detail: `决策生成批次：新增 ${created} 条（均带 basedOn 溯源链）/ 幂等跳过 ${skipped} 条`, actor,
    });
  }
  return { created, skipped };
}

/* ============ 4. 决策中心聚合（Decision Center Feed） ============ */
export interface DecisionFeedGroup {
  dtype: DType;
  label: string;
  count: number;
  avgStars: number;
  items: Array<{
    id: number; eid: string; name: string; title: string; reason: string[]; stars: number;
    status: string; assignee: string | null; needTag: string | null;
    matches: ResourceMatch[]; outcome: string | null; outcomeNote: string | null; dealAmount: number | null; createdAt: Date;
  }>;
}

export async function buildDecisionFeed(opts: { maskSensitive: boolean; status?: string[] }): Promise<DecisionFeedGroup[]> {
  const db = await getDb();
  if (!db) return [];
  const ents = await loadEntities();
  const nameMap = new Map(ents.map((e) => [e.eid, e.name]));
  const statusFilter = opts.status && opts.status.length > 0 ? opts.status : ["suggested", "adopted", "executing"];
  const rows = await db.select().from(decisions)
    .where(inArray(decisions.status, statusFilter as never))
    .orderBy(desc(decisions.stars), desc(decisions.createdAt));

  const groups = new Map<DType, DecisionFeedGroup>();
  for (const r of rows) {
    const dt = r.dtype as DType;
    if (!groups.has(dt)) groups.set(dt, { dtype: dt, label: DTYPE_LABEL[dt], count: 0, avgStars: 0, items: [] });
    const g = groups.get(dt)!;
    const rawName = nameMap.get(r.eid) ?? r.eid;
    g.items.push({
      id: r.id, eid: r.eid,
      name: opts.maskSensitive ? maskEntityName(rawName) : rawName,
      title: r.title, reason: r.reason.split("；"), stars: r.stars, status: r.status,
      assignee: r.assignee, needTag: r.needTag,
      matches: safeParseMatches(r.matchedResources),
      outcome: r.outcome, outcomeNote: r.outcomeNote, dealAmount: r.dealAmount, createdAt: r.createdAt,
    });
    g.count++;
  }
  const out = Array.from(groups.values());
  out.forEach((g) => { g.avgStars = Math.round((g.items.reduce((s: number, i: { stars: number }) => s + i.stars, 0) / Math.max(1, g.count)) * 10) / 10; });
  return out.sort((a, b) => b.avgStars - a.avgStars);
}

function safeParseMatches(json: string | null): ResourceMatch[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

/* ============ 5. 决策状态机流转 ============ */
const TRANSITIONS: Record<string, string[]> = {
  suggested: ["adopted", "dismissed"],
  adopted: ["executing", "dismissed"],
  executing: ["done", "dismissed"],
  done: [], dismissed: [],
};

export async function transitionDecision(opts: {
  id: number; to: "adopted" | "executing" | "done" | "dismissed";
  assignee?: string; outcome?: "won" | "lost" | "partial"; outcomeNote?: string; dealAmount?: number;
  /** 迭代15 · executing 时指定占用的资源 ID（默认取匹配资源快照首选） */
  resourceId?: number;
  /** 迭代18 · 工单3 · 操作人（append-or-abort 台账留痕） */
  actor?: string;
}): Promise<{ ok: boolean; error?: string; row?: DecisionRow }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "数据库不可用" };
  const [row] = await db.select().from(decisions).where(eq(decisions.id, opts.id)).limit(1);
  if (!row) return { ok: false, error: "决策不存在" };
  if (!TRANSITIONS[row.status]?.includes(opts.to)) return { ok: false, error: `不允许 ${row.status} → ${opts.to}` };
  if (opts.to === "done" && !opts.outcome) return { ok: false, error: "完成决策必须回填结果（won/lost/partial）" };
  if (opts.dealAmount !== undefined && (opts.dealAmount < 0 || opts.dealAmount > 100_000_000)) {
    return { ok: false, error: "成交金额需在 0 – 1 亿元之间" };
  }
  /* 迭代15 · 资源容量自动扣减：
     - 进入 executing：锁定资源名额（decisions.resourceId），超容量拦截派单
     - 离开 executing（done/dismissed）：自动释放（resourceId 置空即释放，占用数按 executing 状态实时聚合） */
  let lockResourceId: number | null | undefined = undefined;
  if (opts.to === "executing") {
    // 解析待占用资源：显式传入 > 匹配快照首选
    let rid = opts.resourceId;
    if (rid === undefined && row.matchedResources) {
      try {
        const arr = JSON.parse(row.matchedResources) as Array<{ id?: number }>;
        rid = arr?.[0]?.id;
      } catch { /* 快照无 id 则不占用 */ }
    }
    if (rid !== undefined && rid !== null) {
      const [res] = await db.select().from(resources).where(eq(resources.id, rid)).limit(1);
      if (!res) return { ok: false, error: "占用资源不存在，请刷新后重试" };
      if (!res.active) return { ok: false, error: `资源「${res.name}」已停用，无法派单` };
      const inUseRows = await db.select().from(decisions).where(and(eq(decisions.resourceId, rid), eq(decisions.status, "executing")));
      if (inUseRows.length >= res.capacity) {
        return { ok: false, error: `资源「${res.name}」容量已满（${inUseRows.length}/${res.capacity}），请更换资源或等待释放` };
      }
      lockResourceId = rid;
    }
  } else if (opts.to === "done" || opts.to === "dismissed") {
    lockResourceId = null; // 释放占用
  }
  await db.update(decisions).set({
    status: opts.to,
    ...(opts.assignee ? { assignee: opts.assignee } : {}),
    ...(opts.outcome ? { outcome: opts.outcome } : {}),
    ...(opts.outcomeNote ? { outcomeNote: opts.outcomeNote.slice(0, 255) } : {}),
    ...(opts.dealAmount !== undefined ? { dealAmount: Math.round(opts.dealAmount) } : {}),
    ...(lockResourceId !== undefined ? { resourceId: lockResourceId } : {}),
  }).where(eq(decisions.id, opts.id));
  /* 迭代18 · 工单3 · append-or-abort：状态流转台账写失败必须回滚业务更新（ADR-16 不静默） */
  try {
    const { appendOrAbort } = await import("./decisionLedger");
    await appendOrAbort({
      action: `decision_${opts.to}`, targetEid: row.eid,
      detail: `[D#${row.id}] ${row.title.slice(0, 80)} · ${row.status}→${opts.to}` +
        (opts.assignee ? ` · 指派:${opts.assignee}` : "") +
        (opts.outcome ? ` · 结果:${opts.outcome}${opts.dealAmount ? ` ¥${opts.dealAmount}` : ""}` : ""),
      actor: opts.actor ?? opts.assignee ?? null,
      before: JSON.stringify({ status: row.status, assignee: row.assignee, outcome: row.outcome }),
      after: JSON.stringify({ status: opts.to, assignee: opts.assignee ?? row.assignee, outcome: opts.outcome ?? row.outcome }),
    });
  } catch (err) {
    // 回滚业务更新：恢复原状态（append-or-abort 语义——台账失败业务动作一并失败）
    await db.update(decisions).set({
      status: row.status, assignee: row.assignee, outcome: row.outcome,
      outcomeNote: row.outcomeNote, dealAmount: row.dealAmount, resourceId: row.resourceId,
    }).where(eq(decisions.id, opts.id));
    return { ok: false, error: err instanceof Error ? err.message : "台账写入失败，操作已回滚" };
  }
  const [updated] = await db.select().from(decisions).where(eq(decisions.id, opts.id)).limit(1);
  return { ok: true, row: updated };
}

/* ============ 迭代15 · 资源容量占用统计 ============ */
export async function buildResourceUsage(): Promise<Array<{ resourceId: number; used: number }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(decisions).where(eq(decisions.status, "executing"));
  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.resourceId != null) map.set(r.resourceId, (map.get(r.resourceId) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([resourceId, used]) => ({ resourceId, used }));
}

/* ============ 迭代15 · 月度经营报表 ============ */
export interface MonthlyReport {
  month: string; // YYYY-MM
  totals: { decisions: number; done: number; won: number; winRate: number; amount: number };
  byAssignee: Array<{ assignee: string; total: number; done: number; won: number; winRate: number; amount: number }>;
  byType: Array<{ dtype: string; label: string; total: number; done: number; won: number; winRate: number; amount: number }>;
  byResource: Array<{ resource: string; total: number; done: number; won: number; amount: number }>;
  note: string;
}
export async function buildMonthlyReport(month: string): Promise<MonthlyReport> {
  const db = await getDb();
  const empty: MonthlyReport = { month, totals: { decisions: 0, done: 0, won: 0, winRate: 0, amount: 0 }, byAssignee: [], byType: [], byResource: [], note: "" };
  if (!db) return empty;
  const all = await db.select().from(decisions);
  // 归属口径：决策更新时间（updatedAt）落在该月的记录（完成/流转发生在当月）
  const rows = all.filter((r) => {
    const d = r.updatedAt ?? r.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return key === month;
  });
  if (rows.length === 0) return { ...empty, note: `该月（${month}）暂无决策活动记录。` };
  const agg = (subset: typeof rows) => {
    const done = subset.filter((r) => r.status === "done");
    const won = done.filter((r) => r.outcome === "won");
    return {
      total: subset.length, done: done.length, won: won.length,
      winRate: done.length > 0 ? Math.round((won.length / done.length) * 100) : 0,
      amount: done.reduce((s, r) => s + (r.dealAmount ?? 0), 0),
    };
  };
  const t = agg(rows);
  // 按负责人
  const assignees = Array.from(new Set(rows.map((r) => r.assignee).filter(Boolean))) as string[];
  const byAssignee = assignees.map((a) => ({ assignee: a, ...agg(rows.filter((r) => r.assignee === a)) }))
    .sort((x, y) => y.amount - x.amount || y.done - x.done);
  // 按决策类型
  const byType = (Object.keys(DTYPE_LABEL) as DType[])
    .map((dt) => ({ dtype: dt, label: DTYPE_LABEL[dt], ...agg(rows.filter((r) => r.dtype === dt)) }))
    .filter((x) => x.total > 0)
    .sort((x, y) => y.amount - x.amount);
  // 按资源（含历史占用：从匹配快照首选资源名归组；executing 期占用 resourceId 优先）
  const resRows = await db.select().from(resources);
  const resName = (id: number | null) => resRows.find((r) => r.id === id)?.name;
  const byResourceMap = new Map<string, typeof rows>();
  for (const r of rows) {
    let name = resName(r.resourceId) ?? undefined;
    if (!name && r.matchedResources) {
      try { name = (JSON.parse(r.matchedResources) as Array<{ name?: string }>)?.[0]?.name; } catch { /* noop */ }
    }
    if (!name) continue;
    const list = byResourceMap.get(name) ?? [];
    list.push(r);
    byResourceMap.set(name, list);
  }
  const byResource = Array.from(byResourceMap.entries())
    .map(([resource, subset]) => { const a = agg(subset); return { resource, total: a.total, done: a.done, won: a.won, amount: a.amount }; })
    .sort((x, y) => y.amount - x.amount);
  return {
    month,
    totals: { decisions: t.total, done: t.done, won: t.won, winRate: t.winRate, amount: t.amount },
    byAssignee, byType, byResource,
    note: "口径：按决策最近更新时间归属月份；金额 = 已完成决策回填成交金额（元）；转化率 = won / 已完成。",
  };
}

/* ============ 6. Outcome 归因（决策级 ROI） ============ */
export interface DecisionRoi {
  total: number; adopted: number; executing: number; done: number; dismissed: number;
  adoptionRate: number; // 采纳率 %（adopted+executing+done / total）
  winRate: number; // 成交率 %（won / done，done>0）
  byType: Array<{ dtype: DType; label: string; total: number; done: number; won: number; winRate: number; revenueTier: string; amount: number }>;
  funnel: { suggested: number; adopted: number; executing: number; done: number };
  /** 迭代14 · 金额口径：累计成交额（元）+ 按收入层金额分布 */
  totalAmount: number;
  byRevenueTier: Array<{ tier: string; label: string; amount: number; count: number }>;
  note: string;
}
const REVENUE_TIER_LABEL: Record<string, string> = {
  marketplace: "Marketplace 撮合", operation: "运营服务", consulting: "咨询服务", ai_capability: "AI 能力订阅",
};
export async function buildDecisionRoi(): Promise<DecisionRoi> {
  const db = await getDb();
  const empty: DecisionRoi = { total: 0, adopted: 0, executing: 0, done: 0, dismissed: 0, adoptionRate: 0, winRate: 0, byType: [], funnel: { suggested: 0, adopted: 0, executing: 0, done: 0 }, totalAmount: 0, byRevenueTier: [], note: "" };
  if (!db) return empty;
  const rows = await db.select().from(decisions);
  if (rows.length === 0) return { ...empty, note: "尚无决策记录 · 点击「生成今日决策」启动决策引擎。" };
  const cnt = (s: string) => rows.filter((r) => r.status === s).length;
  const adopted = cnt("adopted"), executing = cnt("executing"), done = cnt("done"), dismissed = cnt("dismissed");
  const won = rows.filter((r) => r.status === "done" && r.outcome === "won").length;
  const byType: DecisionRoi["byType"] = (Object.keys(DTYPE_LABEL) as DType[]).map((dt) => {
    const t = rows.filter((r) => r.dtype === dt);
    const tDone = t.filter((r) => r.status === "done");
    const tWon = tDone.filter((r) => r.outcome === "won").length;
    return {
      dtype: dt, label: DTYPE_LABEL[dt], total: t.length, done: tDone.length, won: tWon,
      winRate: tDone.length > 0 ? Math.round((tWon / tDone.length) * 100) : 0,
      revenueTier: DTYPE_REVENUE[dt],
      amount: tDone.reduce((s, r) => s + (r.dealAmount ?? 0), 0),
    };
  }).filter((t) => t.total > 0);
  const doneRows = rows.filter((r) => r.status === "done");
  const totalAmount = doneRows.reduce((s, r) => s + (r.dealAmount ?? 0), 0);
  const tierMap = new Map<string, { amount: number; count: number }>();
  for (const r of doneRows) {
    const tier = r.revenueTier ?? "operation";
    const cur = tierMap.get(tier) ?? { amount: 0, count: 0 };
    cur.amount += r.dealAmount ?? 0;
    cur.count += 1;
    tierMap.set(tier, cur);
  }
  const byRevenueTier = Array.from(tierMap.entries())
    .map(([tier, v]) => ({ tier, label: REVENUE_TIER_LABEL[tier] ?? tier, amount: v.amount, count: v.count }))
    .sort((a, b) => b.amount - a.amount);
  return {
    total: rows.length, adopted, executing, done, dismissed,
    adoptionRate: Math.round(((adopted + executing + done) / rows.length) * 100),
    winRate: done > 0 ? Math.round((won / done) * 100) : 0,
    byType,
    funnel: { suggested: cnt("suggested"), adopted, executing, done },
    totalAmount,
    byRevenueTier,
    note: "决策级 ROI：采纳率 =（已采纳+执行中+已完成）/全部；成交率 = won/已完成；金额口径 = 已完成决策回填的成交金额（元）按收入层聚合，对齐商业模式六层报表。",
  };
}

/* ============ 7. 单企业决策画像（企业360 决策 Tab 用） ============ */
export async function buildEntityDecisionProfile(eid: string, opts: { maskSensitive: boolean }) {
  const [rules, ents, stages] = await Promise.all([loadRules(), loadEntities(), loadLatestStages()]);
  const x = ents.find((e) => e.eid === eid);
  if (!x) return null;
  const r = calcEntity(x, rules, new Date());
  const lc = inferLifecycle(x);
  const canvas = buildNeedCanvas(x, lc);
  const db = await getDb();
  let decisionRows: DecisionRow[] = [];
  if (db) {
    decisionRows = await db.select().from(decisions).where(eq(decisions.eid, eid)).orderBy(desc(decisions.stars));
  }
  return {
    eid, tier: r.tier,
    lifecycle: lc,
    canvas,
    decisions: decisionRows.map((d) => ({
      id: d.id, dtype: d.dtype, label: DTYPE_LABEL[d.dtype as DType], title: d.title,
      reason: d.reason.split("；"), stars: d.stars, status: d.status, assignee: d.assignee,
      matches: safeParseMatches(d.matchedResources), outcome: d.outcome, outcomeNote: d.outcomeNote,
    })),
  };
}
