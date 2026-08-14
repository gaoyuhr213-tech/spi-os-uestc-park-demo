/* 迭代24 · 工单13 · 真连接器 + 69 家回填复算验收
 * ①key 缺失优雅降级不崩溃 ②QCC/JobBoard 映射与 ACL 表头对齐 ③批量回填复算更新雷达 ④去重≥99%（同名重复摄入不新建主体）
 */
import { describe, expect, it, afterAll } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { getDb } from "./db";
import { entities, ingestionJobs, opsLedger } from "../drizzle/schema";
import { fetchQccByNames, qccAvailable } from "./connectors/qccConnector";
import { fetchJobBoardByNames, jobBoardAvailable } from "./connectors/jobBoardApiConnector";
import { runBackfill, externalConnectorStatus } from "./connectors/backfillOrchestrator";
import { ingestViaAcl } from "./aclTransform";

const ACTOR = "iteration24-harness";

describe("工单13 · 真连接器 + 批量回填复算", () => {
  it("验收① key 缺失优雅降级：两连接器均返回 degraded 而非抛异常", async () => {
    // 测试环境未配置 key（若配置了则跳过降级断言，验证 live 模式）
    const qcc = await fetchQccByNames(["成都眸视科技有限公司"]);
    const job = await fetchJobBoardByNames(["成都眸视科技有限公司"]);
    if (!qccAvailable()) {
      expect(qcc.degraded).toBe(true);
      expect(qcc.degradedReason).toContain("未配置");
      expect(qcc.rows).toEqual([]);
    }
    if (!jobBoardAvailable()) {
      expect(job.degraded).toBe(true);
      expect(job.rows).toEqual([]);
    }
    // 状态卡输出与 key 状态一致
    const status = externalConnectorStatus();
    expect(status.length).toBe(2);
    for (const s of status) expect(s.mode).toBe(s.hasKey ? "live" : "degraded-manual");
  });

  it("验收③ 批量回填复算：降级模式下全程不崩溃且输出复算雷达口径 + 台账留痕", async () => {
    const report = await runBackfill(ACTOR);
    expect(report.ok).toBe(true);
    expect(report.totalEntities).toBeGreaterThanOrEqual(60); // 69 家名录（容忍消歧合并浮动）
    expect(report.sources.length).toBe(2);
    expect(report.recompute).not.toBeNull();
    expect(report.recompute!.p0).toBeGreaterThan(0); // 复算后雷达仍有 P0（数据未破坏）
    if (report.mode === "degraded-manual") {
      expect(report.manualFallbackHint).toContain("手工回填");
    }
    // 台账留痕（backfill_run）
    const db = await getDb();
    if (!db) throw new Error("db");
    const rows = await db.select().from(opsLedger).where(eq(opsLedger.action, "backfill_run"));
    expect(rows.some((r) => r.actor === ACTOR)).toBe(true);
  });

  it("验收④ 去重≥99%：同一企业名重复摄入不新建主体（实体解析归属唯一 eid）", async () => {
    const db = await getDb();
    if (!db) throw new Error("db");
    const before = await db.select({ eid: entities.eid }).from(entities);
    // 用真实主体名走 biz-registry 通道重复摄入两次
    const rows = [{ "企业名称": "成都眸视科技有限公司", "注册资本": "500万元" }];
    const r1 = await ingestViaAcl({ adapterId: "biz-registry", rawRows: rows, triggeredBy: ACTOR });
    const r2 = await ingestViaAcl({ adapterId: "biz-registry", rawRows: rows, triggeredBy: ACTOR });
    expect(r1.rowsOut).toBe(1);
    expect(r2.rowsOut).toBe(1);
    const after = await db.select({ eid: entities.eid }).from(entities);
    expect(after.length).toBe(before.length); // 主体数不增加 = 去重 100%
  });

  it("验收② 映射对齐：QCC/JobBoard 行结构与 ACL 中文表头一致（离线契约校验）", async () => {
    // 契约校验：连接器映射产物的键必须被 ACL transform 消费（不依赖真实 API）
    const { ACL_TRANSFORMS } = await import("./aclTransform");
    const qccShape = { "企业名称": "测试企业X", "统一社会信用代码": "91510100TEST", "注册资本": "100万元", "成立年份": "2020", "参保人数": "10", "高企资质": "是" };
    const bizOut = ACL_TRANSFORMS["biz-registry"](qccShape);
    expect(bizOut).not.toBeNull();
    expect(bizOut!.entity.rawName).toBe("测试企业X");
    const jobShape = { "企业名称": "测试企业X", "在招岗位数": "6", "核心岗位": "算法工程师", "薪资范围": "20-40K" };
    const jobOut = ACL_TRANSFORMS["job-board"](jobShape);
    expect(jobOut).not.toBeNull();
    expect(jobOut!.profile.jobs).toBe(6);
    expect(jobOut!.signals.length).toBeGreaterThan(0); // ≥3 岗位触发招聘信号
  });
});

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  const jobs = await db.select({ id: ingestionJobs.id }).from(ingestionJobs).where(eq(ingestionJobs.triggeredBy, ACTOR));
  if (jobs.length > 0) await db.delete(ingestionJobs).where(inArray(ingestionJobs.id, jobs.map((j) => j.id)));
  await db.delete(opsLedger).where(eq(opsLedger.actor, ACTOR));
  await db.delete(opsLedger).where(like(opsLedger.detail, "%iteration24-harness%"));
});

