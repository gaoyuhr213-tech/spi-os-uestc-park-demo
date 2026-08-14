/* 迭代27 · 工单19 · 数据生成器（迭代28 改造：数据环境隔离）
 * 造数千实体 + 关系边 + 信号，贴近真实分布（行业/楼层/评分/信号密度）
 * 用法：npx tsx scripts/loadgen.ts [count=2000]
 * 清理：npx tsx scripts/loadgen.ts --cleanup <testRunId>
 * 每次运行生成唯一 testRunId，写入 dataEnvironment=load_test
 */
import { drizzle } from "drizzle-orm/mysql2";
import { entities, enrichments, graphEdges } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const INDUSTRIES = ["软件", "AI", "芯片", "通信", "制造", "生物医药", "新材料", "教育", "金融科技", "文创"];
const FLOORS = ["1F", "2F", "3F", "4F", "5F", "6F", "7F", "8F", "9F", "10F", "11F", "12F", "13F"];
const NATURES = ["有限责任", "股份有限", "合伙企业", "个人独资"];
const HIRING = ["高", "中", "低"] as const;
const SIGNAL_TEMPLATES = [
  "扩张：新增办公面积", "股改：完成B轮融资", "招聘：高管岗位发布",
  "专利：新增发明专利", "资质：获高新技术认定", "合作：与头部企业签约",
  "搬迁：计划异地设点", "营收：季度增长超30%", "裁员：缩减非核心业务",
];

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)]; }

async function cleanup(testRunId: string) {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL 未设置"); process.exit(1); }
  const db = drizzle(url);

  console.log(`[loadgen] 清理压测批次 ${testRunId}...`);
  // 获取该批次 eid
  const rows = await db.select({ eid: entities.eid }).from(entities).where(eq(entities.testRunId, testRunId));
  const eids = rows.map(r => r.eid);
  console.log(`[loadgen] 找到 ${eids.length} 条实体`);

  // 删除 enrichments
  for (const eid of eids) {
    await db.delete(enrichments).where(eq(enrichments.eid, eid));
  }
  // 删除 graphEdges
  for (const eid of eids) {
    await db.delete(graphEdges).where(eq(graphEdges.fromKey, eid));
    await db.delete(graphEdges).where(eq(graphEdges.toKey, eid));
  }
  // 删除 entities
  await db.delete(entities).where(eq(entities.testRunId, testRunId));

  console.log(`[loadgen] 清理完成：${eids.length} 实体及关联数据已删除`);
  process.exit(0);
}

async function main() {
  // 清理模式
  if (process.argv.includes("--cleanup")) {
    const idx = process.argv.indexOf("--cleanup");
    const testRunId = process.argv[idx + 1];
    if (!testRunId) { console.error("用法：npx tsx scripts/loadgen.ts --cleanup <testRunId>"); process.exit(1); }
    return cleanup(testRunId);
  }

  const count = parseInt(process.argv[2] ?? "2000", 10);
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL 未设置"); process.exit(1); }
  const db = drizzle(url);

  // 生成唯一 testRunId
  const testRunId = `lt-${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(4).toString("hex")}`;
  console.log(`[loadgen] testRunId: ${testRunId}`);
  console.log(`[loadgen] 开始生成 ${count} 实体 + 关系边 + 信号（dataEnvironment=load_test）...`);
  const t0 = Date.now();
  const batchSize = 100;

  for (let i = 0; i < count; i += batchSize) {
    const batch = Math.min(batchSize, count - i);
    const ents = Array.from({ length: batch }, (_, j) => {
      const idx = i + j;
      const eid = `LG-${String(idx).padStart(5, "0")}`;
      const ind = pick(INDUSTRIES);
      const signals = Array.from({ length: rand(0, 4) }, () => ({
        t: pick(SIGNAL_TEMPLATES), d: `2026-${String(rand(1, 7)).padStart(2, "0")}-${String(rand(1, 28)).padStart(2, "0")}`, tier: rand(1, 3),
      }));
      return {
        eid, name: `压测企业${idx}号_${ind}`, floor: pick(FLOORS), room: `${rand(1, 20)}${String(rand(1, 9)).padStart(2, "0")}`,
        ind, nature: pick(NATURES), hiringBase: pick(HIRING), demo: 0,
        signalsJson: JSON.stringify(signals),
        dataEnvironment: "load_test" as const,
        testRunId,
      };
    });
    await db.insert(entities).values(ents).onDuplicateKeyUpdate({ set: { name: ents[0].name } });

    // enrichments（基础画像）
    const enrs = ents.map((e) => ({
      eid: e.eid, jobs: rand(0, 30), topJobs: pick(["算法工程师", "产品经理", "前端开发", "销售总监", ""]),
      patents: rand(0, 20), softCopyrights: rand(0, 15), insured: rand(5, 500),
    }));
    await db.insert(enrichments).values(enrs).onDuplicateKeyUpdate({ set: { jobs: enrs[0].jobs } });
  }

  // 关系边（随机 5% 密度）
  const edgeCount = Math.floor(count * 0.05);
  console.log(`[loadgen] 生成 ${edgeCount} 条关系边...`);
  const edges = Array.from({ length: edgeCount }, () => {
    const a = `LG-${String(rand(0, count - 1)).padStart(5, "0")}`;
    const b = `LG-${String(rand(0, count - 1)).padStart(5, "0")}`;
    return { fromKey: a, toKey: b, relType: pick(["referral", "alumni", "pipeline", "partner"] as const), strength: rand(30, 100) };
  });
  const edgeBatch = 20;
  for (let i = 0; i < edges.length; i += edgeBatch) {
    const batch = edges.slice(i, i + edgeBatch);
    await db.insert(graphEdges).values(batch).onDuplicateKeyUpdate({ set: { strength: batch[0].strength } });
  }

  console.log(`[loadgen] 完成：${count} 实体 + ${edgeCount} 边，testRunId=${testRunId}，耗时 ${Date.now() - t0}ms`);
  console.log(`[loadgen] 清理命令：npx tsx scripts/loadgen.ts --cleanup ${testRunId}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
