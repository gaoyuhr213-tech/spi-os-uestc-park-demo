/* 迭代26 · 工单17 · 一键开园（Park Provision）
 *
 * 目标：一条命令/一次点击，为新园区创建完整运行环境并计时（验证 ADR-14 复制周期）。
 * 链路：新建租户标识 → 加载配置包 → seed 样例数据（3-5 家演示企业）→ 初始化连接器注册表
 *      → 种子决策 → 返回开园报告（含计时）
 *
 * 设计原则：
 * - 单租户物理隔离：每园区独立 PARK_ID + 独立数据库（compose 层面）
 * - 此函数在应用层面初始化业务数据（假设数据库已由 compose 创建好）
 * - 配置包 = deploy/config/park-template/ 中的 JSON（企业名录/连接器/规则）
 * - 计时：记录从开始到完成的毫秒数，验证 ADR-14 复制周期 < 60s
 */
import { getDb } from "./db";
import { entities, enrichments, opsLedger } from "../drizzle/schema";
import { seedConnectorRegistry } from "./connectors";
import { generateDecisions } from "./decisionEngine";
import { seedGraph } from "./graphData";
import { eq } from "drizzle-orm";

export interface ParkProvisionResult {
  ok: boolean;
  parkId: string;
  parkName: string;
  durationMs: number;       // 开园计时（ADR-14 复制周期验证）
  steps: Array<{ step: string; ok: boolean; ms: number; note: string }>;
  error?: string;
}

/** 样例企业（3 家通用演示主体，不含真实 PII） */
const SAMPLE_ENTITIES = [
  { eid: "DEMO-001", name: "示例科技有限公司", floor: "5F", room: "501", ind: "软件", nature: "有限责任", hiringBase: "中" as const },
  { eid: "DEMO-002", name: "示例智能制造有限公司", floor: "8F", room: "801", ind: "制造", nature: "有限责任", hiringBase: "高" as const },
  { eid: "DEMO-003", name: "示例生物科技有限公司", floor: "3F", room: "302", ind: "生物医药", nature: "有限责任", hiringBase: "低" as const },
];

/** 一键开园：初始化业务数据 + 计时 */
export async function provisionPark(parkId: string, parkName: string, actor: string): Promise<ParkProvisionResult> {
  const t0 = Date.now();
  const steps: ParkProvisionResult["steps"] = [];
  const db = await getDb();
  if (!db) return { ok: false, parkId, parkName, durationMs: Date.now() - t0, steps, error: "数据库不可用" };

  // Step 1: Seed 样例企业
  const t1 = Date.now();
  try {
    for (const e of SAMPLE_ENTITIES) {
      const existing = await db.select({ eid: entities.eid }).from(entities).where(eq(entities.eid, e.eid)).limit(1);
      if (existing.length === 0) {
        await db.insert(entities).values({
          eid: e.eid, name: e.name, floor: e.floor, room: e.room, ind: e.ind, nature: e.nature,
          hiringBase: e.hiringBase, demo: 1, signalsJson: JSON.stringify([{ t: "开园演示信号", d: new Date().toISOString().slice(5, 10), tier: 2 }]),
        });
        await db.insert(enrichments).values({ eid: e.eid });
      }
    }
    steps.push({ step: "seed_entities", ok: true, ms: Date.now() - t1, note: `${SAMPLE_ENTITIES.length} 家样例企业` });
  } catch (e) {
    steps.push({ step: "seed_entities", ok: false, ms: Date.now() - t1, note: e instanceof Error ? e.message : String(e) });
  }

  // Step 2: 连接器注册表
  const t2 = Date.now();
  try {
    await seedConnectorRegistry();
    steps.push({ step: "seed_connectors", ok: true, ms: Date.now() - t2, note: "连接器注册表已初始化" });
  } catch (e) {
    steps.push({ step: "seed_connectors", ok: false, ms: Date.now() - t2, note: e instanceof Error ? e.message : String(e) });
  }

  // Step 3: 图谱种子
  const t3 = Date.now();
  try {
    await seedGraph();
    steps.push({ step: "seed_graph", ok: true, ms: Date.now() - t3, note: "关系图谱已初始化" });
  } catch (e) {
    steps.push({ step: "seed_graph", ok: false, ms: Date.now() - t3, note: e instanceof Error ? e.message : String(e) });
  }

  // Step 4: 生成初始决策
  const t4 = Date.now();
  try {
    const r = await generateDecisions(actor);
    steps.push({ step: "generate_decisions", ok: true, ms: Date.now() - t4, note: `新增 ${r.created} 条决策（跳过 ${r.skipped}）` });
  } catch (e) {
    steps.push({ step: "generate_decisions", ok: false, ms: Date.now() - t4, note: e instanceof Error ? e.message : String(e) });
  }

  // Step 5: 台账留痕
  const t5 = Date.now();
  const durationMs = Date.now() - t0;
  try {
    await db.insert(opsLedger).values({
      action: "park_provision",
      targetEid: null,
      detail: `一键开园 · ${parkName}（${parkId}）· 耗时 ${durationMs}ms · ${steps.filter((s) => s.ok).length}/${steps.length} 步成功`,
      actor,
      afterJson: JSON.stringify({ parkId, parkName, durationMs, steps }),
    });
    steps.push({ step: "ledger_write", ok: true, ms: Date.now() - t5, note: "台账已记录" });
  } catch (e) {
    steps.push({ step: "ledger_write", ok: false, ms: Date.now() - t5, note: e instanceof Error ? e.message : String(e) });
  }

  return { ok: steps.every((s) => s.ok), parkId, parkName, durationMs: Date.now() - t0, steps };
}
