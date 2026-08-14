/* 迭代28 · 统一入库服务（端到端链路核心）
 * preview → commit → rollback
 */
import { getDb } from "./db";
import { ingestionBatches, evidenceRecords, enrichments, opsLedger, type IngestionBatchRow } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { createEvidence, electCurrentEvidence } from "./evidenceService";
import { detectConflicts } from "./conflictService";
import { resolveEntity } from "./entityResolutionV2.js";
import { getOrCreateSource } from "./sourceService";

export interface IngestionRecord {
  companyName: string;
  fields: Record<string, string>;
  rawText?: string;
}

export interface PreviewResult {
  batchKey: string;
  records: Array<{
    companyName: string;
    matchResult: { status: string; matchedEid?: string; score?: number; candidates?: Array<{ eid: string; name: string; score: number }> };
    fieldsToWrite: string[];
    conflicts: string[];
  }>;
  summary: { total: number; matched: number; unmatched: number; conflicts: number };
}

/** Step 1: 预览（不写主数据） */
export async function previewIngestion(input: {
  sourceKey: string; sourceName: string; sourceCategory: string;
  acquisitionChannel: string; processingMethod: string;
  records: IngestionRecord[]; actor: string;
}): Promise<PreviewResult> {
  const batchKey = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const results: PreviewResult["records"] = [];
  let matched = 0, unmatched = 0, conflicts = 0;

  for (const rec of input.records) {
    const matchResult = await resolveEntity({ companyName: rec.companyName });
    if (matchResult.status === "exact" || matchResult.status === "high_confidence") matched++;
    else unmatched++;

    // 预测冲突（只读不写）
    const conflictFields: string[] = [];
    if (matchResult.matchedEid) {
      const db = await getDb();
      if (db) {
        for (const [field, value] of Object.entries(rec.fields)) {
          const existing = await db.select().from(evidenceRecords)
            .where(and(eq(evidenceRecords.eid, matchResult.matchedEid), eq(evidenceRecords.fieldName, field), eq(evidenceRecords.isCurrent, 1)));
          if (existing.length > 0 && existing[0].normalizedValue?.trim().toLowerCase() !== value.trim().toLowerCase()) {
            conflictFields.push(field);
            conflicts++;
          }
        }
      }
    }

    results.push({
      companyName: rec.companyName,
      matchResult: { status: matchResult.status, matchedEid: matchResult.matchedEid, score: matchResult.score, candidates: matchResult.candidates },
      fieldsToWrite: Object.keys(rec.fields),
      conflicts: conflictFields,
    });
  }

  return { batchKey, records: results, summary: { total: input.records.length, matched, unmatched, conflicts } };
}

/** Step 2: 提交（真实写入） */
export async function commitIngestion(input: {
  batchKey: string; sourceKey: string; sourceName: string; sourceCategory: string;
  acquisitionChannel: string; processingMethod: string;
  records: IngestionRecord[]; actor: string;
}): Promise<IngestionBatchRow> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // 1. 确保来源存在
  const source = await getOrCreateSource({
    sourceKey: input.sourceKey, name: input.sourceName,
    category: input.sourceCategory as any,
    acquisitionChannel: input.acquisitionChannel as any,
    createdBy: input.actor,
  });

  // 2. 创建批次
  await db.insert(ingestionBatches).values({
    batchKey: input.batchKey,
    sourceId: source.id,
    acquisitionChannel: input.acquisitionChannel as any,
    processingMethod: input.processingMethod as any,
    status: "committed",
    totalRecords: input.records.length,
    actor: input.actor,
  });
  const [batch] = await db.select().from(ingestionBatches).where(eq(ingestionBatches.batchKey, input.batchKey));

  // 3. 逐条处理
  let matchedCount = 0, conflictCount = 0, updatedCount = 0;
  const beforeSnapshot: Record<string, Record<string, string | null>> = {};

  for (const rec of input.records) {
    const matchResult = await resolveEntity({ companyName: rec.companyName });
    if (!matchResult.matchedEid) continue;
    matchedCount++;
    const eid = matchResult.matchedEid;

    // 保存写入前快照
    const [enr] = await db.select().from(enrichments).where(eq(enrichments.eid, eid));
    if (enr) {
      beforeSnapshot[eid] = {};
      for (const field of Object.keys(rec.fields)) {
        beforeSnapshot[eid][field] = (enr as any)[field] ?? null;
      }
    }

    // 为每个字段创建证据
    for (const [field, value] of Object.entries(rec.fields)) {
      if (!value || value.trim() === "") continue;
      await createEvidence({
        eid, fieldName: field, normalizedValue: value.trim(),
        originalValue: value, sourceId: source.id, batchId: batch.id,
        confidenceScore: 75, processingMethod: input.processingMethod,
      });
      // 选举当前证据
      await electCurrentEvidence(eid, field);
      // 检测冲突
      const conflict = await detectConflicts(eid, field);
      if (conflict) conflictCount++;
    }
    updatedCount++;
  }

  // 4. 更新批次统计
  await db.update(ingestionBatches).set({
    matchedRecords: matchedCount,
    updatedRecords: updatedCount,
    conflictRecords: conflictCount,
    completedAt: new Date(),
    beforeSnapshotJson: JSON.stringify(beforeSnapshot),
  }).where(eq(ingestionBatches.id, batch.id));

  // 5. 写台账
  await db.insert(opsLedger).values({
    action: "ingestion_commit",
    detail: `批次 ${input.batchKey}: ${input.records.length} 条记录，匹配 ${matchedCount}，冲突 ${conflictCount}`,
    actor: input.actor,
    afterJson: JSON.stringify({ batchId: batch.id, batchKey: input.batchKey }),
  });

  const [finalBatch] = await db.select().from(ingestionBatches).where(eq(ingestionBatches.id, batch.id));
  return finalBatch;
}

/** Step 3: 批次回滚 */
export async function rollbackBatch(batchId: number, actor: string): Promise<{ rolledBack: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [batch] = await db.select().from(ingestionBatches).where(eq(ingestionBatches.id, batchId));
  if (!batch) throw new Error("批次不存在");
  if (batch.status === "rolled_back") throw new Error("批次已回滚，不可重复操作");
  if (batch.status !== "committed") throw new Error("仅已提交批次可回滚");

  // 1. 将该批次所有证据标记为 expired + isCurrent=0
  const batchEvidence = await db.select().from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId));
  for (const ev of batchEvidence) {
    await db.update(evidenceRecords).set({ verificationStatus: "expired", isCurrent: 0 }).where(eq(evidenceRecords.id, ev.id));
    // 重新选举该字段的当前证据
    await electCurrentEvidence(ev.eid, ev.fieldName);
  }

  // 2. 更新批次状态
  await db.update(ingestionBatches).set({ status: "rolled_back", rolledBackAt: new Date(), rolledBackBy: actor }).where(eq(ingestionBatches.id, batchId));

  // 3. 写台账
  await db.insert(opsLedger).values({
    action: "ingestion_rollback",
    detail: `批次 ${batch.batchKey} 回滚：${batchEvidence.length} 条证据失效`,
    actor,
    beforeJson: JSON.stringify({ batchId, status: "committed" }),
    afterJson: JSON.stringify({ batchId, status: "rolled_back" }),
  });

  return { rolledBack: batchEvidence.length };
}

/** 列出批次 */
export async function listBatches(): Promise<IngestionBatchRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(ingestionBatches).orderBy(ingestionBatches.id);
}
