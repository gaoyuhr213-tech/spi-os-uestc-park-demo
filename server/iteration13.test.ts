/* 迭代13 · 决策闭环测试：
   - 需求画布/生命周期推断可解释
   - 决策生成幂等 + 资源匹配快照
   - 状态机流转合法性（含 done 必须回填结果）
   - 决策级 ROI 与飞轮决策学习结构 */
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import {
  buildDecisionFeed, buildDecisionRoi, buildEntityDecisionProfile, buildNeedCanvas,
  draftDecisions, generateDecisions, inferLifecycle, transitionDecision,
} from "./decisionEngine";
import { matchResources, seedResources } from "./resourceMatch";
import { buildFlywheel } from "./flywheel";
import { getDb } from "./db";
import { decisions } from "../drizzle/schema";
import type { AdapterEntity } from "./dataAdapter";

function mkEnt(partial: Partial<AdapterEntity>): AdapterEntity {
  return {
    eid: "E_T13", name: "测试企业", ind: "AI", floor: "7F", room: "701", nature: "有限责任公司",
    note: "", baseScore: 75, hiringBase: "高", cross: false, tierRole: "tenant",
    signals: [], referralPath: "B", entryPoint: null, demo: true, enrich: null, enrichFull: null,
    ...partial,
  } as AdapterEntity;
}

describe("迭代13 · 需求画布与生命周期", () => {
  it("融资记录 A轮 → 生命周期 A轮，融资需求带阶段先验", () => {
    const x = mkEnt({ enrichFull: { funding: "A轮 数千万", insured: 40 } as never });
    const lc = inferLifecycle(x);
    expect(lc.phase).toBe("A轮");
    expect(lc.defaultNeeds).toContain("funding");
  });
  it("股改信号 → IPO准备，法务需求 ≥3 星（可解释依据）", () => {
    const x = mkEnt({ signals: [{ d: "07-01", t: "启动股改并进入上市辅导", tier: 1 }] });
    const lc = inferLifecycle(x);
    expect(lc.phase).toBe("IPO准备");
    const canvas = buildNeedCanvas(x, lc);
    const legal = canvas.find((c) => c.tag === "legal");
    expect(legal).toBeDefined();
    expect(legal!.stars).toBeGreaterThanOrEqual(3);
    expect(legal!.basis.length).toBeGreaterThan(0);
  });
  it("在招岗位 12 + 批量招聘信号 → 人才需求 5 星", () => {
    const x = mkEnt({ signals: [{ d: "07-01", t: "批量招聘(CV/算法)", tier: 2 }], enrichFull: { jobs: 12 } as never });
    const canvas = buildNeedCanvas(x, inferLifecycle(x));
    expect(canvas.find((c) => c.tag === "talent")!.stars).toBe(5);
  });
});

describe("迭代13 · 决策草案生成", () => {
  it("P0 未触达 + 5星人才需求 → contact + hr_service 决策", () => {
    const x = mkEnt({ signals: [{ d: "07-01", t: "批量招聘(CV/算法)", tier: 2 }], enrichFull: { jobs: 12 } as never });
    const lc = inferLifecycle(x);
    const drafts = draftDecisions(x, "P0", "未触达", buildNeedCanvas(x, lc), lc);
    const types = drafts.map((d) => d.dtype);
    expect(types).toContain("contact");
    expect(types).toContain("hr_service");
    drafts.forEach((d) => { expect(d.reason.length).toBeGreaterThan(0); expect(d.stars).toBeGreaterThanOrEqual(1); });
  });
  it("IPO准备阶段 → referral 决策（券商/律所生态）5 星", () => {
    const x = mkEnt({ signals: [{ d: "07-01", t: "启动股改", tier: 1 }] });
    const lc = inferLifecycle(x);
    const drafts = draftDecisions(x, "P0", "已触达", buildNeedCanvas(x, lc), lc);
    const ref = drafts.find((d) => d.dtype === "referral");
    expect(ref).toBeDefined();
    expect(ref!.stars).toBe(5);
  });
});

describe("迭代13 · 资源匹配引擎", () => {
  it("talent × AI × A轮 → 高于人力优先，匹配依据可解释", async () => {
    await seedResources();
    const matches = await matchResources("talent", "AI", "A轮", 3);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].score).toBeGreaterThanOrEqual(matches[matches.length - 1].score);
    expect(matches.some((m) => m.rtype === "gaoyu")).toBe(true);
    matches.forEach((m) => expect(m.why.length).toBeGreaterThan(0));
  });
  it("legal × 软件 × IPO准备 → 律所命中", async () => {
    const matches = await matchResources("legal", "软件", "IPO准备", 3);
    expect(matches.some((m) => m.rtype === "lawfirm")).toBe(true);
  });
});

describe("迭代13 · 决策生成幂等 + 状态机 + ROI", () => {
  beforeAll(async () => {
    const db = await getDb();
    if (db) await db.delete(decisions); // 清空后重建（演示库）
  });
  it("generateDecisions 首轮生成 > 0，二轮全部幂等跳过", async () => {
    const r1 = await generateDecisions("vitest");
    expect(r1.created).toBeGreaterThan(0);
    const r2 = await generateDecisions("vitest");
    expect(r2.created).toBe(0);
    expect(r2.skipped).toBeGreaterThan(0);
  });
  it("feed 按类型分组，含企业名/原因链/资源匹配快照", async () => {
    const feed = await buildDecisionFeed({ maskSensitive: false });
    expect(feed.length).toBeGreaterThan(0);
    const g = feed[0];
    expect(g.count).toBe(g.items.length);
    expect(g.items[0].reason.length).toBeGreaterThan(0);
  });
  it("状态机：suggested→adopted→executing→done(须回填结果)；非法跳转被拒", async () => {
    const db = await getDb();
    const [row] = await db!.select().from(decisions).limit(1);
    // 非法：suggested → done
    const bad = await transitionDecision({ id: row.id, to: "done", outcome: "won" });
    expect(bad.ok).toBe(false);
    // 合法链
    expect((await transitionDecision({ id: row.id, to: "adopted", assignee: "测试负责人" })).ok).toBe(true);
    expect((await transitionDecision({ id: row.id, to: "executing" })).ok).toBe(true);
    // done 无 outcome 被拒
    const noOutcome = await transitionDecision({ id: row.id, to: "done" });
    expect(noOutcome.ok).toBe(false);
    const done = await transitionDecision({ id: row.id, to: "done", outcome: "won", outcomeNote: "签约HR服务年费" });
    expect(done.ok).toBe(true);
    expect(done.row!.assignee).toBe("测试负责人");
  });
  it("ROI 统计：采纳率/成交率/类型分布正确", async () => {
    const roi = await buildDecisionRoi();
    expect(roi.total).toBeGreaterThan(0);
    expect(roi.done).toBeGreaterThanOrEqual(1);
    expect(roi.winRate).toBe(100);
    expect(roi.byType.length).toBeGreaterThan(0);
  });
  it("企业决策画像：画布 + 生命周期 + 决策清单", async () => {
    const db = await getDb();
    const [row] = await db!.select().from(decisions).limit(1);
    const prof = await buildEntityDecisionProfile(row.eid, { maskSensitive: false });
    expect(prof).not.toBeNull();
    expect(prof!.canvas.length).toBeGreaterThan(0);
    expect(prof!.lifecycle.phase).toBeTruthy();
    expect(prof!.decisions.length).toBeGreaterThan(0);
  });
  it("飞轮决策级学习：byType 含完成/命中统计", async () => {
    const fw = await buildFlywheel({ maskSensitive: false });
    expect(fw.decisionLearning).toBeDefined();
    expect(fw.decisionLearning.byType.length).toBeGreaterThan(0);
    const done = fw.decisionLearning.byType.find((t) => t.done > 0);
    expect(done).toBeDefined();
    expect(done!.won).toBeGreaterThanOrEqual(1);
  });
});
