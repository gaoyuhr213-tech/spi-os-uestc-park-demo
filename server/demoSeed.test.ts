/* 迭代23 · 工单12 · 一键演示 + 溯源钻取验收
 * ①一键可重复（幂等） ②每跳可点下钻（signal→connector→ingestionJob） ③10秒why（分步一句话结论） ④演示脱敏正确
 */
import { describe, expect, it, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { ingestionJobs, opsLedger } from "../drizzle/schema";
import { runDemoSeed, DEMO_ACTOR, DEMO_EID } from "./demoSeed";
import { traceSignalProvenance } from "./provenanceTrace";
import { authorizeFields } from "./authz";

describe("工单12 · 一键演示 + 溯源钻取", () => {
  it("验收① 一键可重复：连续运行两次均成功且不堆积演示批次", async () => {
    const r1 = await runDemoSeed();
    expect(r1.ok).toBe(true);
    expect(r1.eid).toBe(DEMO_EID);
    const r2 = await runDemoSeed();
    expect(r2.ok).toBe(true);
    // 第二次运行清理了第一次的 job 痕（幂等）
    expect(r2.cleaned.jobs).toBeGreaterThanOrEqual(1);
    const db = await getDb();
    if (!db) throw new Error("db");
    const demoJobs = await db.select().from(ingestionJobs).where(eq(ingestionJobs.triggeredBy, DEMO_ACTOR));
    // 每次运行只留 2 个批次（工商源+招聘源），不随运行次数堆积
    expect(demoJobs.length).toBe(2);
  });

  it("验收② 溯源钻取：招聘信号逐跳钻到 signal→connector→ingestionJob 原始证据", async () => {
    await runDemoSeed();
    // 演示招聘源写入的信号文本（transformJobBoard 口径）
    const sigText = "批量招聘(机器人算法工程师/嵌入式软件工程师/计算机视觉工程师×12)";
    const p = await traceSignalProvenance(DEMO_EID, sigText);
    expect(p.found).toBe(true);
    const layers = p.hops.map((h) => h.layer);
    expect(layers).toEqual(["signal", "connector", "ingestionJob"]);
    // 每跳都带证据细节（可点下钻的内容）
    for (const h of p.hops) {
      expect(h.summary.length).toBeGreaterThan(0);
      expect(Object.keys(h.detail).length).toBeGreaterThan(0);
    }
    // 末跳含原始行数与触发人
    const job = p.hops[2];
    expect(job.detail.rowsIn).toBeGreaterThanOrEqual(1);
    expect(job.detail.triggeredBy).toBe(DEMO_ACTOR);
  });

  it("验收② 补充：非连接器来源信号明示实勘/手工（不伪造）", async () => {
    const p = await traceSignalProvenance(DEMO_EID, "不存在的信号XYZ");
    expect(p.found).toBe(false);
    expect(p.hops.some((h) => h.layer === "connector" && h.summary.includes("不伪造"))).toBe(true);
  });

  it("验收③ 10秒why：十段分步各有一句话结论且段序完整", async () => {
    const r = await runDemoSeed();
    expect(r.story.length).toBe(10);
    expect(r.story.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const s of r.story) {
      expect(s.conclusion.length).toBeGreaterThan(4); // 每段一句话结论非空
      expect(s.stage).toBeTruthy();
    }
  });

  it("验收④ 演示脱敏正确：user 角色读演示企业 PII 字段输出掩码/拒绝", async () => {
    const probe = { legalRep: "赵某某", keyContact: "王某 13911112222", name: "成都眸视科技有限公司" };
    const r = await authorizeFields({ eid: DEMO_EID, role: "user", data: probe, actor: DEMO_ACTOR, audit: false });
    const rep = r.decisions.find((d) => d.field === "legalRep");
    expect(rep).toBeDefined();
    expect(rep!.effect === "mask" || rep!.effect === "deny").toBe(true);
    const val = (r.data as Record<string, unknown>)["keyContact"];
    if (val != null) expect(String(val)).not.toContain("13911112222");
  });
});

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  // 清理演示批次与台账痕（保留主数据——E703 为真实入驻主体）
  const jobs = await db.select({ id: ingestionJobs.id }).from(ingestionJobs).where(eq(ingestionJobs.triggeredBy, DEMO_ACTOR));
  if (jobs.length > 0) await db.delete(ingestionJobs).where(inArray(ingestionJobs.id, jobs.map((j) => j.id)));
  await db.delete(opsLedger).where(eq(opsLedger.actor, DEMO_ACTOR));
});
