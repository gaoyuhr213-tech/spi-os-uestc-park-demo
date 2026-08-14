/* 迭代15 · 容量自动扣减 + 月度经营报表 测试
   覆盖：executing 占用资源名额 / 超容量拦截 / done 释放 / usage 聚合 / 月报结构与口径 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { decisions, resources } from "../drizzle/schema";
import { eq, like } from "drizzle-orm";
import { transitionDecision, buildResourceUsage, buildMonthlyReport } from "./decisionEngine";

const TEST_PREFIX = "IT15TEST";
let resourceId = 0;
const decisionIds: number[] = [];

async function seedTestData() {
  const db = await getDb();
  if (!db) throw new Error("db unavailable");
  // 容量=1 的测试资源
  await db.insert(resources).values({
    rtype: "vendor", name: `${TEST_PREFIX}·容量资源`, org: "测试", needTags: "talent",
    indTags: "", stageTags: "", capacity: 1, note: "迭代15测试", active: 1,
  });
  const [res] = await db.select().from(resources).where(eq(resources.name, `${TEST_PREFIX}·容量资源`)).limit(1);
  resourceId = res!.id;
  // 两条 adopted 决策，匹配快照首选均指向该资源
  const snap = JSON.stringify([{ id: resourceId, name: `${TEST_PREFIX}·容量资源`, rtypeLabel: "服务商", score: 90, why: ["测试"] }]);
  for (let i = 0; i < 2; i++) {
    await db.insert(decisions).values({
      eid: "E_IT15", dtype: "contact", title: `${TEST_PREFIX} 决策${i}`, reason: "测试",
      stars: 3, needTag: "talent", matchedResources: snap, status: "adopted",
      assignee: "IT15-Tester", revenueTier: "operation", genKey: `${TEST_PREFIX}:${i}:${Date.now()}`,
    });
  }
  const rows = await db.select().from(decisions).where(like(decisions.title, `${TEST_PREFIX}%`));
  decisionIds.push(...rows.map((r) => r.id));
}

async function cleanup() {
  const db = await getDb();
  if (!db) return;
  await db.delete(decisions).where(like(decisions.title, `${TEST_PREFIX}%`));
  await db.delete(resources).where(like(resources.name, `${TEST_PREFIX}%`));
}

beforeAll(async () => { await cleanup(); await seedTestData(); }, 30_000);
afterAll(async () => { await cleanup(); }, 30_000);

describe("迭代15 · 资源容量自动扣减", () => {
  it("executing 占用资源名额（resourceId 落库）", async () => {
    const r = await transitionDecision({ id: decisionIds[0], to: "executing" });
    expect(r.ok).toBe(true);
    expect(r.row?.resourceId).toBe(resourceId);
  });
  it("usage 聚合能看到占用 1/1", async () => {
    const usage = await buildResourceUsage();
    const u = usage.find((x) => x.resourceId === resourceId);
    expect(u?.used).toBe(1);
  });
  it("超容量派单被拦截（容量1已满）", async () => {
    const r = await transitionDecision({ id: decisionIds[1], to: "executing" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("容量已满");
  });
  it("done 自动释放名额，第二条可再执行", async () => {
    const done = await transitionDecision({ id: decisionIds[0], to: "done", outcome: "won", dealAmount: 50_000 });
    expect(done.ok).toBe(true);
    expect(done.row?.resourceId).toBeNull();
    const again = await transitionDecision({ id: decisionIds[1], to: "executing" });
    expect(again.ok).toBe(true);
    expect(again.row?.resourceId).toBe(resourceId);
    // 还原：完成第二条，释放资源
    const fin = await transitionDecision({ id: decisionIds[1], to: "done", outcome: "lost" });
    expect(fin.ok).toBe(true);
  });
});

describe("迭代15 · 月度经营报表", () => {
  it("月报聚合结构完整且口径正确（本月含测试成交 5 万元）", async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const rep = await buildMonthlyReport(month);
    expect(rep.month).toBe(month);
    expect(rep.totals.decisions).toBeGreaterThanOrEqual(2);
    expect(rep.totals.amount).toBeGreaterThanOrEqual(50_000);
    const mine = rep.byAssignee.find((a) => a.assignee === "IT15-Tester");
    expect(mine).toBeTruthy();
    expect(mine!.done).toBe(2);
    expect(mine!.won).toBe(1);
    expect(mine!.winRate).toBe(50);
    expect(mine!.amount).toBe(50_000);
    const byRes = rep.byResource.find((r) => r.resource.startsWith(TEST_PREFIX));
    expect(byRes).toBeTruthy();
    expect(rep.note).toContain("口径");
  });
  it("空月份返回空结构与提示", async () => {
    const rep = await buildMonthlyReport("2020-01");
    expect(rep.totals.decisions).toBe(0);
    expect(rep.note).toContain("2020-01");
  });
});
