/* 迭代28 · 数据冲突服务 */
import { getDb } from "./db";
import { dataConflicts, evidenceRecords, type DataConflictRow } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { scoreEvidence } from "./evidenceService";

/** 检测并生成冲突（同 eid+fieldName 有不同有效值） */
export async function detectConflicts(eid: string, fieldName: string): Promise<DataConflictRow | null> {
  const db = await getDb();
  if (!db) return null;
  const all = await db.select().from(evidenceRecords)
    .where(and(eq(evidenceRecords.eid, eid), eq(evidenceRecords.fieldName, fieldName)));
  const valid = all.filter((e) => e.verificationStatus !== "rejected" && e.verificationStatus !== "expired");
  // 标准化后去重
  const uniqueValues = Array.from(new Set(valid.map((e) => (e.normalizedValue ?? "").trim().toLowerCase()))).filter(Boolean);
  if (uniqueValues.length <= 1) return null; // 无冲突

  // 已有冲突？
  const conflictKey = `${eid}:${fieldName}`;
  const [existing] = await db.select().from(dataConflicts).where(eq(dataConflicts.conflictKey, conflictKey));
  if (existing && existing.resolutionStatus !== "resolved") return existing;

  // 推荐最高分证据
  const scored = await Promise.all(valid.map(async (e) => ({ e, score: await scoreEvidence(e) })));
  scored.sort((a, b) => b.score - a.score);
  const recommended = scored[0]?.e;

  const current = valid.find((e) => e.isCurrent === 1);
  const candidates = scored.map((s) => ({ evidenceId: s.e.id, value: s.e.normalizedValue, score: s.score }));

  if (existing) {
    // 更新已有冲突
    await db.update(dataConflicts).set({
      evidenceIdsJson: JSON.stringify(valid.map((e) => e.id)),
      candidateValuesJson: JSON.stringify(candidates),
      recommendedEvidenceId: recommended?.id ?? null,
      recommendedReason: `来源可靠性+核验+新鲜度加权评分最高（${scored[0]?.score ?? 0}分）`,
      resolutionStatus: "suggested",
    }).where(eq(dataConflicts.id, existing.id));
    const [updated] = await db.select().from(dataConflicts).where(eq(dataConflicts.id, existing.id));
    return updated;
  }

  // 新建冲突
  await db.insert(dataConflicts).values({
    conflictKey,
    eid,
    fieldName,
    evidenceIdsJson: JSON.stringify(valid.map((e) => e.id)),
    currentValue: current?.normalizedValue ?? null,
    candidateValuesJson: JSON.stringify(candidates),
    recommendedEvidenceId: recommended?.id ?? null,
    recommendedReason: `来源可靠性+核验+新鲜度加权评分最高（${scored[0]?.score ?? 0}分）`,
    resolutionStatus: "suggested",
  });
  const [created] = await db.select().from(dataConflicts).where(eq(dataConflicts.conflictKey, conflictKey));
  return created;
}

/** 列出所有开放冲突 */
export async function listOpenConflicts(): Promise<DataConflictRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataConflicts).where(eq(dataConflicts.resolutionStatus, "open"));
}

/** 人工解决冲突：采用某条证据 */
export async function resolveConflict(conflictId: number, evidenceId: number, actor: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const [ev] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.id, evidenceId));
  if (!ev) throw new Error("证据不存在");
  await db.update(dataConflicts).set({
    resolutionStatus: "resolved",
    resolutionMethod: "manual",
    resolvedValue: ev.normalizedValue,
    resolvedEvidenceId: evidenceId,
    resolvedBy: actor,
    resolvedAt: new Date(),
  }).where(eq(dataConflicts.id, conflictId));
  // 标记采用的证据为 current
  await db.update(evidenceRecords).set({ isCurrent: 0 }).where(and(eq(evidenceRecords.eid, ev.eid), eq(evidenceRecords.fieldName, ev.fieldName)));
  await db.update(evidenceRecords).set({ isCurrent: 1 }).where(eq(evidenceRecords.id, evidenceId));
}
