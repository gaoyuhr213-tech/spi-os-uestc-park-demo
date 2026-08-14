/* ============================================================
 * 迭代12 · 解析历史与字段级溯源
 * - recordParseHistory：每次解析/导入写入时落历史快照（原文 + 结果 + 写入字段清单）
 * - listParseHistory：按企业查询历史（倒序）
 * - buildFieldSources：字段级溯源——每个富集字段最近一次由哪条记录写入
 * ============================================================ */
import { desc, eq } from "drizzle-orm";
import { parseHistory } from "../drizzle/schema";
import { getDb } from "./db";

export type ParseSourceType = "ai_parse" | "ai_parse_batch" | "excel_import";

export async function recordParseHistory(input: {
  eid: string;
  sourceType: ParseSourceType;
  rawText?: string | null;
  result: Record<string, unknown>;
  fieldsWritten: string[];
  confidence?: string | null;
  actor: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(parseHistory).values({
    eid: input.eid,
    sourceType: input.sourceType,
    rawText: input.rawText ? input.rawText.slice(0, 20000) : null,
    resultJson: JSON.stringify(input.result).slice(0, 20000),
    fieldsWritten: input.fieldsWritten.join(","),
    confidence: input.confidence ?? null,
    actor: input.actor,
  });
}

export interface ParseHistoryItem {
  id: number;
  eid: string;
  sourceType: ParseSourceType;
  sourceLabel: string;
  rawText: string | null;
  result: Record<string, unknown>;
  fieldsWritten: string[];
  confidence: string | null;
  actor: string;
  at: string; // ISO
}

const SOURCE_LABEL: Record<ParseSourceType, string> = {
  ai_parse: "AI 解析（单家）",
  ai_parse_batch: "AI 批量解析",
  excel_import: "Excel 导入",
};

export async function listParseHistory(eid: string, limit = 20): Promise<ParseHistoryItem[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(parseHistory).where(eq(parseHistory.eid, eid)).orderBy(desc(parseHistory.createdAt)).limit(limit);
  return rows.map((r) => ({
    id: r.id,
    eid: r.eid,
    sourceType: r.sourceType as ParseSourceType,
    sourceLabel: SOURCE_LABEL[r.sourceType as ParseSourceType],
    rawText: r.rawText,
    result: safeParse(r.resultJson),
    fieldsWritten: r.fieldsWritten ? r.fieldsWritten.split(",").filter(Boolean) : [],
    confidence: r.confidence,
    actor: r.actor,
    at: r.createdAt.toISOString(),
  }));
}

/** 字段级溯源：每个字段 → 最近一次写入它的历史记录（id/来源/时间/操作人） */
export async function buildFieldSources(eid: string): Promise<Record<string, { historyId: number; sourceLabel: string; at: string; actor: string }>> {
  const items = await listParseHistory(eid, 100);
  const out: Record<string, { historyId: number; sourceLabel: string; at: string; actor: string }> = {};
  // items 已按时间倒序：首个包含该字段的记录即最近写入者
  for (const it of items) {
    for (const f of it.fieldsWritten) {
      if (!out[f]) out[f] = { historyId: it.id, sourceLabel: it.sourceLabel, at: it.at, actor: it.actor };
    }
  }
  return out;
}

function safeParse(json: string): Record<string, unknown> {
  try { return JSON.parse(json); } catch { return {}; }
}

