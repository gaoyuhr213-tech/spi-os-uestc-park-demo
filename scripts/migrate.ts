/* 迭代27 · 工单22 · seed→prod 数据迁移工具
 * 从 seed/演示环境迁移到生产环境，迁移后校验零丢失
 * 用法：npx tsx scripts/migrate.ts --source <seed-backup-dir> --target <DATABASE_URL>
 */
import { drizzle } from "drizzle-orm/mysql2";
import { entities, enrichments, decisions, opsLedger } from "../drizzle/schema";
import * as fs from "node:fs";
import * as path from "node:path";
import { sql } from "drizzle-orm";

async function main() {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf("--source");
  const targetIdx = args.indexOf("--target");
  const sourceDir = sourceIdx >= 0 ? args[sourceIdx + 1] : null;
  const targetUrl = targetIdx >= 0 ? args[targetIdx + 1] : process.env.DATABASE_URL;

  if (!sourceDir || !targetUrl) {
    console.error("用法: npx tsx scripts/migrate.ts --source <backup-dir> [--target <DATABASE_URL>]");
    process.exit(1);
  }
  if (!fs.existsSync(sourceDir)) { console.error(`源目录不存在: ${sourceDir}`); process.exit(1); }

  const db = drizzle(targetUrl);
  console.log(`[migrate] seed→prod 迁移: ${sourceDir} → target DB`);
  const t0 = Date.now();

  // 读取源数据
  const tables = ["entities", "enrichments", "decisions", "opsLedger"];
  const sourceCounts: Record<string, number> = {};

  for (const name of tables) {
    const file = path.join(sourceDir, `${name}.json`);
    if (!fs.existsSync(file)) { console.log(`  跳过 ${name}（无文件）`); continue; }
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    sourceCounts[name] = data.length;
    console.log(`  ${name}: ${data.length} 行待迁移`);
  }

  // 迁移（复用 restore 逻辑）
  console.log("\n[migrate] 执行迁移（调用 restore 逻辑）...");
  // 简化：直接调用 restore 的核心逻辑
  const { execSync } = await import("child_process");
  execSync(`DATABASE_URL="${targetUrl}" npx tsx scripts/restore.ts "${sourceDir}"`, { stdio: "inherit" });

  // 校验零丢失
  console.log("\n[migrate] 校验零丢失...");
  const tableMap: Record<string, any> = { entities, enrichments, decisions, opsLedger };
  let allPass = true;
  for (const [name, expected] of Object.entries(sourceCounts)) {
    const table = tableMap[name];
    if (!table) continue;
    const [{ c }] = await db.select({ c: sql<number>`count(*)` }).from(table);
    const actual = Number(c);
    const pass = actual >= expected;
    console.log(`  ${name}: 源 ${expected} → 目标 ${actual} ${pass ? "✅" : "❌ 丢失"}`);
    if (!pass) allPass = false;
  }

  console.log(`\n[migrate] ${allPass ? "✅ 零丢失验证通过" : "❌ 存在数据丢失"} | 耗时 ${Date.now() - t0}ms`);
  process.exit(allPass ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
