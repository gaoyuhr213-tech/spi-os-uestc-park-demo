/* V3 波次四 · Organizational Memory 组织记忆引擎
   对标：Palantir Foundry Ontology / Gong 会话记忆。
   将台账（ledger）、决策（decisions）、解析历史（parseHistory）、状态事件（stageEvents）、
   任务打卡（taskChecks）统一为可检索的组织记忆条目，AI 助手与决策生成可自动引用。 */
import { getDb } from "./db";
import { opsLedger, decisions, parseHistory, lifecycleEvents, taskCompletions } from "../drizzle/schema";
import { desc } from "drizzle-orm";
import { loadEntities, maskEntityName } from "./dataAdapter";

export interface MemoryItem {
  ts: number;
  kind: "ledger" | "decision" | "parse" | "stage" | "task";
  kindLabel: string;
  eid: string | null;
  entity: string | null;
  summary: string;
  detail: string | null;
  actor: string | null;
}

const KIND_LABEL: Record<MemoryItem["kind"], string> = {
  ledger: "台账", decision: "决策", parse: "情报解析", stage: "状态推进", task: "任务打卡",
};

/** 全局组织记忆检索：按关键词/企业过滤，倒序合并五源 */
export async function searchMemory(opts: { q?: string; eid?: string; limit?: number; maskSensitive: boolean }): Promise<MemoryItem[]> {
  const limit = Math.min(opts.limit ?? 60, 200);
  const db = await getDb();
  if (!db) return [];
  const ents = await loadEntities();
  const nameOf = (eid: string | null) => {
    if (!eid) return null;
    const e = ents.find((x) => x.eid === eid);
    if (!e) return eid;
    return opts.maskSensitive ? maskEntityName(e.name) : e.name;
  };

  const [led, decs, parses, stages, tasks] = await Promise.all([
    db.select().from(opsLedger).orderBy(desc(opsLedger.createdAt)).limit(300),
    db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(200),
    db.select().from(parseHistory).orderBy(desc(parseHistory.createdAt)).limit(120),
    db.select().from(lifecycleEvents).orderBy(desc(lifecycleEvents.createdAt)).limit(200),
    db.select().from(taskCompletions).orderBy(desc(taskCompletions.createdAt)).limit(200),
  ]);

  const items: MemoryItem[] = [];
  for (const r of led) {
    items.push({
      ts: r.createdAt?.getTime?.() ?? Date.now(), kind: "ledger", kindLabel: KIND_LABEL.ledger,
      eid: r.targetEid ?? null, entity: nameOf(r.targetEid ?? null),
      summary: `[${r.action}] ${r.detail?.slice(0, 120) ?? ""}`,
      detail: r.detail, actor: r.actor ?? null,
    });
  }
  for (const d of decs) {
    items.push({
      ts: d.createdAt?.getTime?.() ?? Date.now(), kind: "decision", kindLabel: KIND_LABEL.decision,
      eid: d.eid, entity: nameOf(d.eid),
      summary: `${d.title}（${d.status}${d.outcome ? ` · ${d.outcome}` : ""}${d.dealAmount ? ` · ¥${d.dealAmount}` : ""}）`,
      detail: d.reason, actor: d.assignee,
    });
  }
  for (const p of parses) {
    items.push({
      ts: p.createdAt?.getTime?.() ?? Date.now(), kind: "parse", kindLabel: KIND_LABEL.parse,
      eid: p.eid, entity: nameOf(p.eid),
      summary: `${p.sourceType} 写入 ${p.fieldsWritten.split(",").filter(Boolean).length} 字段`,
      detail: p.rawText?.slice(0, 200) ?? null, actor: p.actor,
    });
  }
  for (const s of stages) {
    items.push({
      ts: s.createdAt?.getTime?.() ?? Date.now(), kind: "stage", kindLabel: KIND_LABEL.stage,
      eid: s.eid, entity: nameOf(s.eid),
      summary: `状态 → ${s.stage}`, detail: s.note, actor: s.actor ?? null,
    });
  }
  for (const t of tasks) {
    items.push({
      ts: t.createdAt?.getTime?.() ?? Date.now(), kind: "task", kindLabel: KIND_LABEL.task,
      eid: t.eid, entity: nameOf(t.eid),
      summary: `任务打卡 ${t.taskType} ✓（${t.weekKey}）`, detail: t.note, actor: t.actor ?? null,
    });
  }

  let out = items;
  if (opts.eid) out = out.filter((m) => m.eid === opts.eid);
  if (opts.q && opts.q.trim()) {
    const q = opts.q.trim().toLowerCase();
    out = out.filter((m) =>
      m.summary.toLowerCase().includes(q) ||
      (m.entity ?? "").toLowerCase().includes(q) ||
      (m.detail ?? "").toLowerCase().includes(q) ||
      (m.actor ?? "").toLowerCase().includes(q));
  }
  out.sort((a, b) => b.ts - a.ts);
  return out.slice(0, limit);
}

/** 记忆统计：供 Memory 面板头部 */
export async function memoryStats() {
  const db = await getDb();
  if (!db) return { total: 0, byKind: [] as { kind: string; n: number }[] };
  const [led, decs, parses, stages, tasks] = await Promise.all([
    db.select().from(opsLedger), db.select().from(decisions), db.select().from(parseHistory),
    db.select().from(lifecycleEvents), db.select().from(taskCompletions),
  ]);
  return {
    total: led.length + decs.length + parses.length + stages.length + tasks.length,
    byKind: [
      { kind: "台账", n: led.length }, { kind: "决策", n: decs.length }, { kind: "情报解析", n: parses.length },
      { kind: "状态推进", n: stages.length }, { kind: "任务打卡", n: tasks.length },
    ],
  };
}
