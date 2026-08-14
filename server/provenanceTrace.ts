/* 迭代23 · 工单12 · 溯源钻取（signal → connector → ingestionJob 原始证据）
 *
 * 回答演示现场最常被问的问题：「这个信号是哪来的？」
 * 钻取链：信号文本 → 匹配摄入批次（ingestionJobs.summaryJson 含该 eid 写入痕）
 *        → 连接器（connectors.cid/name/source）→ 原始行数/跳过数/触发人/时间
 * 找不到批次时明示「楼层索引实勘/手工录入」（不伪造连接器来源）。
 */
import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { connectorsTable, ingestionJobs, entities } from "../drizzle/schema";

export interface ProvenanceHop {
  layer: "signal" | "connector" | "ingestionJob";
  title: string;
  summary: string;
  detail: Record<string, unknown>;
}

export interface SignalProvenance {
  eid: string;
  signalText: string;
  found: boolean;          // 是否钻到摄入批次（false = 实勘/手工来源，明示）
  hops: ProvenanceHop[];
}

/** 对某企业的某条信号，逐跳回溯其来源证据链 */
export async function traceSignalProvenance(eid: string, signalText: string): Promise<SignalProvenance> {
  const db = await getDb();
  const hops: ProvenanceHop[] = [];
  if (!db) return { eid, signalText, found: false, hops };

  // 第一跳：信号本身（从 entities.signalsJson 取原始记录）
  const [ent] = await db.select().from(entities).where(eq(entities.eid, eid)).limit(1);
  let sigRecord: { t: string; d: string; tier: number } | null = null;
  if (ent?.signalsJson) {
    try {
      const sigs = JSON.parse(ent.signalsJson) as Array<{ t: string; d: string; tier: number }>;
      sigRecord = sigs.find((s) => s.t === signalText) ?? null;
    } catch { /* 非法 JSON 按无信号处理 */ }
  }
  hops.push({
    layer: "signal",
    title: sigRecord ? `信号：${sigRecord.t}` : `信号：${signalText}`,
    summary: sigRecord
      ? `观察日期 ${sigRecord.d} · Tier-${sigRecord.tier} · 存于企业主体信号轴（entities.signalsJson）`
      : "该信号未在主体信号轴中找到原始记录（可能已被清理或来自演示态计算）",
    detail: sigRecord ? { ...sigRecord, eid } : { eid, queried: signalText },
  });

  // 信号本身不存在于主体信号轴 → 不做批次归因（避免把无关批次伪造成该信号的来源）
  if (!sigRecord) {
    hops.push({
      layer: "connector",
      title: "来源：楼层索引实勘 / 手工录入",
      summary: "未匹配到任何连接器摄入批次——该信号来自园区楼层索引实勘或手工回填（明示，不伪造连接器来源）",
      detail: { reason: "signal_not_in_axis" },
    });
    return { eid, signalText, found: false, hops };
  }

  // 第二跳：摄入批次——倒序扫描 ingestionJobs，找 summaryJson 中写入痕含该 eid 且信号计数>0 的最近批次
  const jobs = await db.select().from(ingestionJobs).orderBy(desc(ingestionJobs.id)).limit(100);
  let hit: typeof jobs[number] | null = null;
  let hitWritten: string | null = null;
  for (const j of jobs) {
    if (!j.summaryJson) continue;
    try {
      const s = JSON.parse(j.summaryJson) as { written?: string[] };
      const w = (s.written ?? []).find((x) => x.startsWith(`${eid}:`) && x.includes("信号"));
      if (w) { hit = j; hitWritten = w; break; }
    } catch { /* 跳过坏 JSON */ }
  }

  if (!hit) {
    hops.push({
      layer: "connector",
      title: "来源：楼层索引实勘 / 手工录入",
      summary: "未匹配到任何连接器摄入批次——该信号来自园区楼层索引实勘或手工回填（明示，不伪造连接器来源）",
      detail: { scannedJobs: jobs.length },
    });
    return { eid, signalText, found: false, hops };
  }

  // 第三跳：连接器
  const [conn] = await db.select().from(connectorsTable).where(eq(connectorsTable.cid, hit.connectorId)).limit(1);
  hops.push({
    layer: "connector",
    title: `连接器：${conn?.name ?? hit.connectorId}`,
    summary: conn
      ? `${conn.ctype.toUpperCase()} 通道 · 状态 ${conn.status} · 数据来源：${conn.source ?? "未标注"}`
      : `连接器 ${hit.connectorId}（注册表未找到详情）`,
    detail: { cid: hit.connectorId, name: conn?.name, ctype: conn?.ctype, status: conn?.status, source: conn?.source, lastRunAt: conn?.lastRunAt },
  });

  // 第四跳：摄入批次原始证据
  let resolutions: unknown = null;
  try { resolutions = (JSON.parse(hit.summaryJson ?? "{}") as { resolutions?: unknown }).resolutions ?? null; } catch { /* noop */ }
  hops.push({
    layer: "ingestionJob",
    title: `摄入批次 #${hit.id}`,
    summary: `${hit.rowsIn} 行入 → ${hit.rowsOut} 行归属 / ${hit.rowsSkipped} 行跳过 · 状态 ${hit.status} · 触发人 ${hit.triggeredBy ?? "—"} · ${hit.startedAt?.toISOString().slice(0, 19).replace("T", " ")}`,
    detail: {
      jobId: hit.id, status: hit.status, rowsIn: hit.rowsIn, rowsOut: hit.rowsOut, rowsSkipped: hit.rowsSkipped,
      triggeredBy: hit.triggeredBy, startedAt: hit.startedAt, finishedAt: hit.finishedAt,
      writtenTrace: hitWritten, resolutions,
    },
  });

  return { eid, signalText, found: true, hops };
}
