/* 迭代28 · 数据来源服务 */
import { getDb } from "./db";
import { dataSources, type DataSourceRow } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export async function listSources(): Promise<DataSourceRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dataSources);
}

export async function getSource(sourceKey: string): Promise<DataSourceRow | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(dataSources).where(eq(dataSources.sourceKey, sourceKey));
  return row ?? null;
}

export async function getOrCreateSource(input: {
  sourceKey: string; name: string; category: DataSourceRow["category"];
  provider?: string; acquisitionChannel?: DataSourceRow["acquisitionChannel"];
  reliabilityLevel?: DataSourceRow["reliabilityLevel"];
  createdBy?: string;
}): Promise<DataSourceRow> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await getSource(input.sourceKey);
  if (existing) return existing;
  await db.insert(dataSources).values({
    sourceKey: input.sourceKey,
    name: input.name,
    category: input.category,
    provider: input.provider ?? null,
    acquisitionChannel: input.acquisitionChannel ?? "other",
    reliabilityLevel: input.reliabilityLevel ?? "ungraded",
    createdBy: input.createdBy ?? null,
  });
  return (await getSource(input.sourceKey))!;
}

/** 来源可靠性基础分（默认规则，可配置覆盖） */
export function reliabilityBaseScore(category: DataSourceRow["category"]): number {
  const MAP: Record<string, number> = {
    government: 100, company_official: 95, park_internal: 92,
    enterprise_submission: 90, commercial_database: 85,
    field_visit: 82, recruitment: 75, media: 65, other: 50,
  };
  return MAP[category] ?? 50;
}
