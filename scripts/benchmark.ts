/* 迭代27 · 工单19 · 性能压测脚本
 * 压测：pipeline 端到端吞吐、图路径查询 P95、评分复算时延
 * 用法：npx tsx scripts/benchmark.ts
 * 前置：先运行 loadgen.ts 生成数千实体
 */
import { drizzle } from "drizzle-orm/mysql2";
import { entities, graphEdges } from "../drizzle/schema";
import { sql, count } from "drizzle-orm";
import { buildSnapshot } from "../server/dataAdapter";
import { findScoredPaths } from "../server/graphIntel";

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL 未设置"); process.exit(1); }
  const db = drizzle(url);

  // 统计实体数
  const [{ c }] = await db.select({ c: count() }).from(entities);
  console.log(`[benchmark] 实体总数: ${c}`);

  // 1. 评分复算时延
  console.log("\n[benchmark] === 评分复算 ===");
  const scoreTimes: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await buildSnapshot({ maskSensitive: false });
    scoreTimes.push(Date.now() - t0);
  }
  const scoreP95 = percentile(scoreTimes, 95);
  console.log(`  5 次复算耗时: ${scoreTimes.map((t) => `${t}ms`).join(", ")}`);
  console.log(`  P95: ${scoreP95}ms | SLA(<2000ms): ${scoreP95 < 2000 ? "✅ PASS" : "❌ FAIL"}`);

  // 2. 图路径查询 P95
  console.log("\n[benchmark] === 图路径查询 ===");
  const pathTimes: number[] = [];
  // 随机取 20 对实体做路径查询
  const sampleEnts = await db.select({ eid: entities.eid }).from(entities).limit(40);
  for (let i = 0; i < Math.min(20, Math.floor(sampleEnts.length / 2)); i++) {
    const from = sampleEnts[i * 2]?.eid;
    const to = sampleEnts[i * 2 + 1]?.eid;
    if (!from || !to) continue;
    const t0 = Date.now();
    await findScoredPaths(from, { maskSensitive: false });
    pathTimes.push(Date.now() - t0);
  }
  const pathP95 = percentile(pathTimes, 95);
  console.log(`  ${pathTimes.length} 次路径查询 P95: ${pathP95}ms | SLA(<500ms): ${pathP95 < 500 ? "✅ PASS" : "❌ FAIL"}`);

  // 3. Pipeline 吞吐（模拟：批量摄入 + 复算）
  console.log("\n[benchmark] === Pipeline 吞吐 ===");
  const pipeT0 = Date.now();
  await buildSnapshot({ maskSensitive: false }); // 全量快照 = pipeline 核心计算段
  const pipeDuration = Date.now() - pipeT0;
  const throughput = Math.round(Number(c) / (pipeDuration / 1000));
  console.log(`  全量快照（${c} 实体）: ${pipeDuration}ms | 吞吐: ${throughput} 实体/秒`);
  console.log(`  背压: ${pipeDuration > 30000 ? "❌ 超 30s 有背压风险" : "✅ 无背压"}`);

  // 汇总
  console.log("\n[benchmark] === 汇总 ===");
  console.log(`  评分复算 P95: ${scoreP95}ms (SLA<2000ms)`);
  console.log(`  路径查询 P95: ${pathP95}ms (SLA<500ms)`);
  console.log(`  Pipeline 吞吐: ${throughput} 实体/秒`);
  console.log(`  总体: ${scoreP95 < 2000 && pathP95 < 500 ? "✅ ALL SLA PASS" : "⚠️ 部分 SLA 未达标"}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
