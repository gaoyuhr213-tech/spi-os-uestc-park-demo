/* 迭代28 · 字段级证据服务 */
import { getDb } from "./db";
import { evidenceRecords, dataSources, type EvidenceRecordRow } from "../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { reliabilityBaseScore } from "./sourceService";

/** 为一个字段创建证据记录 */
export async function createEvidence(input: {
  eid: string; fieldName: string; normalizedValue: string; originalValue?: string;
  sourceId: number; batchId: number; evidenceExcerpt?: string;
  collectedAt?: Date; confidenceScore?: number; processingMethod?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const key = `${input.eid}:${input.fieldName}:${input.batchId}:${Date.now()}`;
  await db.insert(evidenceRecords).values({
    evidenceKey: key,
    eid: input.eid,
    fieldName: input.fieldName,
    normalizedValue: input.normalizedValue,
    originalValue: input.originalValue ?? input.normalizedValue,
    sourceId: input.sourceId,
    batchId: input.batchId,
    evidenceExcerpt: input.evidenceExcerpt ?? null,
    collectedAt: input.collectedAt ?? new Date(),
    confidenceScore: input.confidenceScore ?? 70,
    confidenceLabel: (input.confidenceScore ?? 70) >= 80 ? "high" : (input.confidenceScore ?? 70) >= 50 ? "medium" : "low",
    processingMethod: input.processingMethod ?? "direct_mapping",
    isCurrent: 0,
  });
  const [row] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.evidenceKey, key));
  return row.id;
}

/** 列出某企业某字段的全部证据（时间倒序） */
export async function listEvidenceByField(eid: string, fieldName: string): Promise<EvidenceRecordRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(evidenceRecords)
    .where(and(eq(evidenceRecords.eid, eid), eq(evidenceRecords.fieldName, fieldName)))
    .orderBy(desc(evidenceRecords.id));
}

/** 列出某企业全部证据 */
export async function listEvidenceByEntity(eid: string): Promise<EvidenceRecordRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(evidenceRecords).where(eq(evidenceRecords.eid, eid)).orderBy(desc(evidenceRecords.id));
}

/** 计算证据评分（加权：来源可靠性 + 核验 + 新鲜度 + 置信度） */
export async function scoreEvidence(ev: EvidenceRecordRow): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // 来源可靠性
  const [src] = await db.select().from(dataSources).where(eq(dataSources.id, ev.sourceId));
  const srcScore = src ? reliabilityBaseScore(src.category) : 50;
  // 核验权重
  const verifyBonus = ev.verificationStatus === "verified" ? 20 : ev.verificationStatus === "disputed" ? -20 : 0;
  // 新鲜度（简化：30天内满分，超过按天衰减）
  const ageDays = ev.collectedAt ? (Date.now() - new Date(ev.collectedAt).getTime()) / 86400_000 : 90;
  const freshness = Math.max(0, 100 - ageDays * 1.5);
  // 置信度
  const confidence = ev.confidenceScore ?? 50;
  // 加权
  return Math.round(srcScore * 0.35 + verifyBonus + freshness * 0.2 + confidence * 0.25);
}

/** 选出某字段当前最佳证据并标记 isCurrent */
export async function electCurrentEvidence(eid: string, fieldName: string): Promise<EvidenceRecordRow | null> {
  const all = await listEvidenceByField(eid, fieldName);
  const valid = all.filter((e) => e.verificationStatus !== "rejected" && e.verificationStatus !== "expired");
  if (valid.length === 0) return null;
  // 评分排序
  const scored = await Promise.all(valid.map(async (e) => ({ e, score: await scoreEvidence(e) })));
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0].e;
  // 标记
  const db = await getDb();
  if (!db) return winner;
  await db.update(evidenceRecords).set({ isCurrent: 0 }).where(and(eq(evidenceRecords.eid, eid), eq(evidenceRecords.fieldName, fieldName)));
  await db.update(evidenceRecords).set({ isCurrent: 1 }).where(eq(evidenceRecords.id, winner.id));
  return winner;
}

/** 核验证据 */
export async function verifyEvidence(evidenceId: number, actor: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(evidenceRecords).set({ verificationStatus: "verified", verifiedBy: actor, verifiedAt: new Date() }).where(eq(evidenceRecords.id, evidenceId));
}

/** 拒绝证据 */
export async function rejectEvidence(evidenceId: number, actor: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(evidenceRecords).set({ verificationStatus: "rejected", verifiedBy: actor, verifiedAt: new Date() }).where(eq(evidenceRecords.id, evidenceId));
}
