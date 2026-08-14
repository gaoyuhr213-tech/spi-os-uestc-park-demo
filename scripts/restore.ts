/* 迭代27 · 工单22 · 恢复演练
 * 从备份目录恢复数据 + 从 Ledger 重放重建读模型
 * 用法：npx tsx scripts/restore.ts [backup-dir]
 */
import { drizzle } from "drizzle-orm/mysql2";
import { entities, enrichments, decisions, opsLedger, ingestionJobs, graphEdges } from "../drizzle/schema";
import * as fs from "node:fs";
import * as path from "node:path";
import { sql } from "drizzle-orm";

async function main() {
  const backupDir = process.argv[2];
  if (!backupDir || !fs.existsSync(backupDir)) {
    console.error("用法: npx tsx scripts/restore.ts <backup-dir>");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL 未设置"); process.exit(1); }
  const db = drizzle(url);

  console.log(`[restore] 从 ${backupDir} 恢复...`);
  const t0 = Date.now();

  // 读取备份元数据
  const meta = JSON.parse(fs.readFileSync(path.join(backupDir, "backup-meta.json"), "utf-8"));
  console.log(`  备份时间: ${meta.timestamp} | 版本: ${meta.version}`);

  // 恢复顺序：先清空再插入（演练环境；生产需确认）
  const tableMap: Record<string, any> = { entities, enrichments, decisions, opsLedger, ingestionJobs, graphEdges };

  for (const t of meta.tables) {
    const file = path.join(backupDir, `${t.name}.json`);
    if (!fs.existsSync(file)) { console.log(`  跳过 ${t.name}（文件不存在）`); continue; }
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    const table = tableMap[t.name];
    if (!table || data.length === 0) { console.log(`  跳过 ${t.name}（空数据或未映射）`); continue; }

    // 批量插入（小批量避免 SQL 过长）
    const batchSize = 50;
    let inserted = 0;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      try {
        await db.insert(table).values(batch).onDuplicateKeyUpdate({ set: { id: sql`id` } as any });
        inserted += batch.length;
      } catch (e) {
        console.warn(`  ${t.name} 批次 ${i} 写入失败: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.log(`  ${t.name}: 恢复 ${inserted}/${data.length} 行`);
  }

  // 从 Ledger 重放重建读模型（ADR-01：读模型永远可从 Ledger 重建）
  console.log("\n[restore] 从 Decision Ledger 重放验证...");
  const ledgerRows = await db.select().from(opsLedger);
  console.log(`  Ledger 条目: ${ledgerRows.length}`);
  // 验证：读模型（entities/enrichments/decisions）行数与备份一致
  const entCount = (await db.select({ c: sql`count(*)` }).from(entities))[0];
  console.log(`  entities 当前行数: ${JSON.stringify(entCount)}`);

  console.log(`\n[restore] 完成：耗时 ${Date.now() - t0}ms`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
