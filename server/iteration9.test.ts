/* 迭代9 · 可解释性七问视图测试
   - buildExplain：七问结构完整、证据构成与 calcEntity 同口径、置信度推导
   - park.explain：公开可查 + 脱敏模式企业名脱敏 */
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, buildExplain, calcEntity, type CalcInput } from "./ruleEngine";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const SAMPLE: CalcInput = {
  eid: "T001", name: "测试科技有限公司", ind: "软件", baseScore: 78,
  hiringBase: "高", cross: true, tierRole: "tenant",
  signals: [
    { d: "07-20", t: "招聘高管（算法负责人）", tier: 1 },
    { d: "03-01", t: "参加园区活动", tier: 2 },
  ],
  referralPath: "A", entryPoint: "批量招聘",
  enrich: { jobs: 12, patents: 20, insured: 60, funding: "A轮 2025", hiTech: "是", verified: "已核验", keyContact: null, topJobs: null },
};

describe("buildExplain 七问结构", () => {
  const now = new Date("2026-07-30");
  const result = calcEntity(SAMPLE, DEFAULT_RULES, now);
  const view = buildExplain(SAMPLE, result, 3, [{ at: now, event: "已触达", actor: "顾问A" }], DEFAULT_RULES, now);

  it("① 依据：评分/Tier/排名/NBA 完整", () => {
    expect(view.basis.score).toBe(result.score);
    expect(view.basis.tier).toBe(result.tier);
    expect(view.basis.rank).toBe(3);
    expect(view.basis.nba.length).toBeGreaterThan(5);
  });

  it("② 证据：构成分解与 calcEntity 同口径（base+enrich+signal-risk=score）", () => {
    const { baseScore, enrichDelta, signalBonus, riskPenalty } = view.evidence;
    const reassembled = Math.max(0, Math.min(100, Math.round(baseScore + enrichDelta + signalBonus - riskPenalty)));
    expect(reassembled).toBe(result.score);
    expect(view.evidence.fields.length).toBeGreaterThanOrEqual(5);
  });

  it("③ 信号：含衰减百分比与新鲜标记（07-20 新鲜、03-01 已衰减）", () => {
    const fresh = view.signals.find((s) => s.date === "07-20")!;
    const stale = view.signals.find((s) => s.date === "03-01")!;
    expect(fresh.fresh).toBe(true);
    expect(stale.decayPct).toBeLessThan(50);
  });

  it("④⑤⑥ 关系/时间线/模型逻辑齐备", () => {
    expect(view.relations.pathLabel).toBe("校企通道");
    expect(view.timeline).toHaveLength(1);
    expect(view.model.thresholds.p0Min).toBe(DEFAULT_RULES.tiering.p0Min);
  });

  it("⑦ 置信度：已核验+新鲜信号+字段齐 → 高", () => {
    expect(view.confidence.level).toBe("高");
    expect(view.confidence.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("无富集无信号 → 低置信度", () => {
    const bare: CalcInput = { ...SAMPLE, enrich: null, signals: [] };
    const r2 = calcEntity(bare, DEFAULT_RULES, now);
    const v2 = buildExplain(bare, r2, null, [], DEFAULT_RULES, now);
    expect(v2.confidence.level).toBe("低");
  });
});

describe("park.explain API", () => {
  const anonCtx = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as unknown as TrpcContext;
  const caller = appRouter.createCaller(anonCtx);

  it("公开可查询（对外路演），脱敏模式下企业名含 *", async () => {
    const masked = await caller.park.explain({ eid: "E701", mask: true });
    expect(masked.name).toContain("*");
    expect(masked.basis.score).toBeGreaterThan(0);
  });

  it("不存在的企业返回 NOT_FOUND", async () => {
    await expect(caller.park.explain({ eid: "NOPE", mask: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
