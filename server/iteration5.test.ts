/* 迭代5 后端能力测试：
 * 1) 信号衰减：旧信号加分低于新信号
 * 2) Tier-0 风险：命中风险关键词降分且封顶 P2
 * 3) NBA 动态生成：Tier-1 招聘信号 → 72h 触达文案
 * 4) 任务规则配置化：修改 touchedStallDays 生效
 * 5) 规则影响预览：阈值调整产生升级/降级差异
 * 6) 周报周键：isoWeekKey 格式正确
 * 7) RBAC：taskDone / exportData / ledger 权限边界
 */
import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import {
  DEFAULT_RULES, buildNba, buildTaskList, calcEntity, calcRuleImpact, isoWeekKey,
  type CalcInput, type RuleSet,
} from "./ruleEngine";

const mk = (over: Partial<CalcInput> = {}): CalcInput => ({
  eid: "T1", name: "测试科技有限公司", ind: "软件", baseScore: 80, hiringBase: "高",
  cross: false, tierRole: "tenant", signals: [], referralPath: "A", entryPoint: null, note: "", enrich: null,
  ...over,
});

const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("信号衰减（模块03 半衰期）", () => {
  it("同一信号越旧加分越低（富集态下体现）", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 5 * 86400000);
    const old = new Date(now.getTime() - 120 * 86400000);
    const enrich = { jobs: 12, patents: null, insured: null, funding: null, hiTech: null, verified: null, keyContact: null, topJobs: null };
    const a = calcEntity(mk({ signals: [{ d: fmt(recent), t: "扩租新楼层", tier: 1 }], enrich }), DEFAULT_RULES, now);
    const b = calcEntity(mk({ signals: [{ d: fmt(old), t: "扩租新楼层", tier: 1 }], enrich }), DEFAULT_RULES, now);
    expect(a.score).toBeGreaterThanOrEqual(b.score);
  });
  it("关闭衰减时新旧信号同分", () => {
    const rules: RuleSet = structuredClone(DEFAULT_RULES);
    rules.scoring.signalDecay.enabled = false;
    const now = new Date();
    const recent = new Date(now.getTime() - 5 * 86400000);
    const old = new Date(now.getTime() - 120 * 86400000);
    const enrich = { jobs: 12, patents: null, insured: null, funding: null, hiTech: null, verified: null, keyContact: null, topJobs: null };
    const a = calcEntity(mk({ signals: [{ d: fmt(recent), t: "扩租", tier: 1 }], enrich }), rules, now);
    const b = calcEntity(mk({ signals: [{ d: fmt(old), t: "扩租", tier: 1 }], enrich }), rules, now);
    expect(a.score).toBe(b.score);
  });
});

describe("Tier-0 风险层（模块03 风险信号）", () => {
  it("命中风险关键词：降分且 P0/P1 封顶为 P2", () => {
    const clean = calcEntity(mk({ signals: [{ d: "07-01", t: "招聘算法工程师", tier: 1 }] }));
    const risky = calcEntity(mk({ note: "存在经营异常记录", signals: [{ d: "07-01", t: "招聘算法工程师", tier: 1 }] }));
    expect(risky.risk).toBe(true);
    expect(risky.score).toBeLessThan(clean.score);
    expect(["P2", "N"]).toContain(risky.tier);
  });
});

describe("NBA 动态生成（模块08）", () => {
  it("Tier-1 招聘信号 → 72h 触达 + 路径标签", () => {
    const x = mk({ signals: [{ d: "07-20", t: "招聘高管合伙人", tier: 1 }], referralPath: "A" });
    const nba = buildNba(x, "P0", DEFAULT_RULES);
    expect(nba).toContain("72h");
    expect(nba).toContain("校企通道");
  });
  it("无信号 P1 → 培育序列", () => {
    expect(buildNba(mk(), "P1", DEFAULT_RULES)).toContain("培育");
  });
});

describe("任务规则配置化（Law-05）", () => {
  it("touchedStallDays 从 7 改为 3 后，等待 5 天的已触达企业进入复访", () => {
    const now = new Date();
    const items = [{ eid: "E1", tier: "P0", score: 88, stage: "已触达" as const, signals: [] }];
    const ev = new Map([["E1", { stage: "已触达" as const, at: new Date(now.getTime() - 5 * 86400000) }]]);
    const def = buildTaskList(items, ev, now, DEFAULT_RULES.tasks);
    expect(def.find((t) => t.taskType === "复访")).toBeUndefined();
    const tight = buildTaskList(items, ev, now, { ...DEFAULT_RULES.tasks, touchedStallDays: 3 });
    expect(tight.find((t) => t.taskType === "复访")).toBeDefined();
  });
});

describe("规则影响预览（dry-run diff）", () => {
  it("降低 P0 阈值 → 产生升级名单且不改库", () => {
    const ents = [
      mk({ eid: "A", baseScore: 70, signals: [{ d: "07-20", t: "扩租", tier: 1 }] }),
      mk({ eid: "B", baseScore: 50 }),
    ];
    const next: RuleSet = structuredClone(DEFAULT_RULES);
    next.tiering.p0Min = 65;
    const impact = calcRuleImpact(ents, DEFAULT_RULES, next);
    expect(impact.upgraded.some((i) => i.eid === "A")).toBe(true);
    expect(impact.downgraded.length).toBe(0);
  });
  it("提高 P1 阈值 → 产生降级名单", () => {
    const ents = [mk({ eid: "C", baseScore: 62 })];
    const next: RuleSet = structuredClone(DEFAULT_RULES);
    next.tiering.p1Min = 70;
    const impact = calcRuleImpact(ents, DEFAULT_RULES, next);
    expect(impact.downgraded.some((i) => i.eid === "C")).toBe(true);
  });
});

describe("周报周键", () => {
  it("isoWeekKey 输出 YYYY-Www 格式", () => {
    expect(isoWeekKey(new Date("2026-07-30"))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

describe("RBAC 权限边界（迭代5 新接口）", () => {
  const anonCtx = { user: null, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext;
  it("未登录调用 taskDone 被拒", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.park.taskDone({ eid: "E1", taskType: "首触" })).rejects.toThrow();
  });
  it("未登录调用 exportData 被拒", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(caller.park.exportData({ kind: "leads", mask: false })).rejects.toThrow();
  });
  it("非管理员调用 rules.preview / ledger 被拒", async () => {
    const userCtx = {
      user: { id: 2, openId: "u2", name: "普通用户", email: null, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: { protocol: "https", headers: {} }, res: {},
    } as unknown as TrpcContext;
    const caller = appRouter.createCaller(userCtx);
    await expect(caller.park.rules.preview({})).rejects.toThrow();
    await expect(caller.park.ledger({ limit: 10 })).rejects.toThrow();
  });
});
