/* 迭代28 · 数据环境隔离 · 压测数据清理服务
 * 按 testRunId 清理整批压测数据，覆盖：entities/enrichments/graphEdges/opsLedger 标记
 * 不删除审计记录（opsLedger），但标记为压测来源
 */
import { eq, and, like, sql } from "drizzle-orm";
import { entities, enrichments, graphEdges, opsLedger } from "../drizzle/schema";
import { getDb } from "./db";
import { appendLedger } from "./dataAdapter";

export type DataEnvironment = "production" | "demo" | "test" | "load_test";

/** 列出所有压测批次（testRunId 去重） */
export async function listTestRuns(): Promise<Array<{ testRunId: string; count: number; env: string }>> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(
    sql`SELECT testRunId, dataEnvironment, count(*) as cnt FROM entities WHERE dataEnvironment IN ('test', 'load_test') AND testRunId IS NOT NULL GROUP BY testRunId, dataEnvironment`
  );
  const rows = Array.isArray(result[0]) ? result[0] : result;
  return (rows as any[]).map(r => ({ testRunId: r.testRunId, count: Number(r.cnt), env: r.dataEnvironment }));
}

/** 按 testRunId 清理整批压测数据 */
export async function cleanupTestRun(testRunId: string, actor: string): Promise<{
  entitiesDeleted: number; enrichmentsDeleted: number; edgesDeleted: number; ledgerMarked: number;
}> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");

  // 1. 获取该批次所有 eid
  const eidRows = await db.select({ eid: entities.eid }).from(entities)
    .where(and(eq(entities.testRunId, testRunId)));
  const eids = eidRows.map(r => r.eid);
  if (eids.length === 0) return { entitiesDeleted: 0, enrichmentsDeleted: 0, edgesDeleted: 0, ledgerMarked: 0 };

  // 2. 删除 enrichments
  let enrichmentsDeleted = 0;
  for (const eid of eids) {
    const res = await db.delete(enrichments).where(eq(enrichments.eid, eid));
    enrichmentsDeleted++;
  }

  // 3. 删除 graphEdges（fromKey 或 toKey 属于该批次）
  let edgesDeleted = 0;
  for (const eid of eids) {
    await db.delete(graphEdges).where(eq(graphEdges.fromKey, eid));
    await db.delete(graphEdges).where(eq(graphEdges.toKey, eid));
    edgesDeleted++;
  }

  // 4. 删除 entities
  await db.delete(entities).where(eq(entities.testRunId, testRunId));

  // 5. 审计台账标记（不删除，标记为压测清理）
  await appendLedger(
    "load_test_cleanup",
    null,
    `清理压测批次 ${testRunId}：删除 ${eids.length} 实体及关联数据`,
    actor,
  );

  return { entitiesDeleted: eids.length, enrichmentsDeleted, edgesDeleted, ledgerMarked: 1 };
}

/** 获取当前数据环境统计 */
export async function getEnvironmentStats(): Promise<Record<DataEnvironment, number>> {
  const db = await getDb();
  const stats: Record<DataEnvironment, number> = { production: 0, demo: 0, test: 0, load_test: 0 };
  if (!db) return stats;
  const result = await db.execute(
    sql`SELECT dataEnvironment, count(*) as cnt FROM entities GROUP BY dataEnvironment`
  );
  // drizzle mysql2 execute returns [rows, fields] tuple
  const rows = Array.isArray(result[0]) ? result[0] : result;
  for (const r of rows as any[]) {
    if (r.dataEnvironment in stats) stats[r.dataEnvironment as DataEnvironment] = Number(r.cnt);
  }
  return stats;
}

/** 安全保护：生产环境禁止无授权写入压测数据 */
export function validateLoadTestWrite(env: DataEnvironment, userRole: string): { allowed: boolean; reason?: string } {
  if (env === "load_test" || env === "test") {
    if (userRole !== "admin") {
      return { allowed: false, reason: "仅管理员可写入压测/测试数据" };
    }
  }
  return { allowed: true };
}
