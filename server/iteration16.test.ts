/* 迭代16 · V3 升维测试
   波次一：九要素 Decision Card（card9）+ Decision Health 五维 */
import { describe, expect, it } from "vitest";
import { getDb } from "./db";
import { decisions } from "../drizzle/schema";
import { buildDecisionCard9, buildDecisionHealth, typeHitRate } from "./decisionEngine2";

describe("V3 波次一 · 九要素 Decision Card", () => {
  it("card9 输出九要素完整结构", async () => {
    const db = await getDb();
    if (!db) return;
    const [row] = await db.select({ id: decisions.id }).from(decisions).limit(1);
    if (!row) return;
    const c = await buildDecisionCard9(row.id, { maskSensitive: false });
    expect(c).toBeTruthy();
    // ① Score ② Evidence ③ Reason ④ Confidence ⑤ Risk ⑥ Opportunity ⑦ Action ⑧ Impact ⑨ Learning
    expect(c!.score).toBeGreaterThan(0);
    expect(c!.score).toBeLessThanOrEqual(100);
    expect(c!.evidence.length).toBeGreaterThanOrEqual(2);
    for (const e of c!.evidence) {
      expect(["signal", "enrich", "rule", "ai", "human", "stage", "learning"]).toContain(e.kind);
      expect(e.sourceNote.length).toBeGreaterThan(0);
    }
    expect(c!.reason.length).toBeGreaterThan(0);
    expect(c!.confidence).toBeGreaterThanOrEqual(0);
    expect(c!.confidence).toBeLessThanOrEqual(100);
    expect(c!.confidenceBreakdown.length).toBe(4);
    expect(c!.confidenceBreakdown.reduce((s, b) => s + b.weight, 0)).toBe(100);
    expect(c!.risks.length).toBeGreaterThan(0);
    expect(c!.opportunity.window).toMatch(/天/);
    expect(c!.action.next.length).toBeGreaterThan(0);
    expect(c!.impact.revenueTierLabel.length).toBeGreaterThan(0);
    expect(c!.learning.counterfactual).toContain("若不采纳");
  });
  it("card9 脱敏模式下企业名含掩码", async () => {
    const db = await getDb();
    if (!db) return;
    const [row] = await db.select({ id: decisions.id }).from(decisions).limit(1);
    if (!row) return;
    const c = await buildDecisionCard9(row.id, { maskSensitive: true });
    expect(c!.name).toContain("*");
  });
  it("card9 不存在的决策返回 null", async () => {
    const c = await buildDecisionCard9(99_999_999, { maskSensitive: false });
    expect(c).toBeNull();
  });
  it("typeHitRate 返回合法命中率结构", async () => {
    const r = await typeHitRate("contact");
    if (r.hitRate !== null) {
      expect(r.hitRate).toBeGreaterThanOrEqual(0);
      expect(r.hitRate).toBeLessThanOrEqual(100);
      expect(r.done).toBeGreaterThan(0);
    }
  });
});

describe("V3 波次一 · Decision Health 五维", () => {
  it("health 输出五维 + 综合分（0-100）", async () => {
    const h = await buildDecisionHealth();
    expect(h.overall).toBeGreaterThanOrEqual(0);
    expect(h.overall).toBeLessThanOrEqual(100);
    for (const k of ["velocity", "quality", "impact", "roi", "learning"] as const) {
      expect(typeof h[k].value).toBe("number");
      expect(h[k].note.length).toBeGreaterThan(0);
    }
  });
});
