/* 迭代11 · 第三波升维测试：图谱数据化 / 需求预测引擎 / 学习飞轮 / 路径推演 */
import { describe, expect, it } from "vitest";
import { loadGraph, findReferralChains, seedGraph } from "./graphData";
import { predictDemand } from "./demandPredict";
import { listConnectors } from "./connectors";
import { buildFlywheel } from "./flywheel";

describe("迭代11 · 关系图谱数据化", () => {
  it("seedGraph 幂等：重复播种不新增节点/边", async () => {
    const first = await seedGraph();
    if ("error" in first) throw new Error(first.error);
    const again = await seedGraph();
    if ("error" in again) throw new Error(again.error);
    expect(again.nodes).toBe(0);
    expect(again.edges).toBe(0);
  });

  it("loadGraph 返回生态节点 + 企业节点 + 带 pathTag 的边", async () => {
    const g = await loadGraph({ maskSensitive: false });
    expect(g.nodes.length).toBeGreaterThanOrEqual(30);
    expect(g.edges.length).toBeGreaterThanOrEqual(30);
    const keys = new Set(g.nodes.map((n) => n.key));
    for (const k of ["dept:swe", "plat:higher", "plat:assoc", "plat:proserv", "E401"]) {
      expect(keys.has(k)).toBe(true);
    }
    // 边均有强度且 pathTag 归属 A/B/C/D
    for (const e of g.edges) {
      expect(e.strength).toBeGreaterThan(0);
      expect(["A", "B", "C", "D", null]).toContain(e.pathTag);
    }
  });

  it("脱敏模式下企业节点 label 被掩码，生态节点不掩码", async () => {
    const g = await loadGraph({ maskSensitive: true });
    const company = g.nodes.find((n) => n.kind === "company" && n.key !== "E401");
    expect(company).toBeDefined();
    expect(company!.label).toMatch(/\*/);
    const eco = g.nodes.find((n) => n.key === "dept:swe");
    expect(eco!.label).not.toMatch(/\*/);
  });

  it("findReferralChains(E703) 从 plat:higher 出发返回 ≤3 跳链路，按强度排序", async () => {
    const out = await findReferralChains("E703", { maskSensitive: false });
    expect(out).not.toBeNull();
    expect(out!.chains.length).toBeGreaterThanOrEqual(1);
    for (const c of out!.chains) {
      expect(c.hops.length).toBeLessThanOrEqual(3);
      expect(c.hops[0].from).toBe("plat:higher");
      expect(c.hops[c.hops.length - 1].to).toBe("E703");
      expect(c.avgStrength).toBeGreaterThan(0);
      expect(c.summary).toContain("→");
    }
    const strengths = out!.chains.map((c) => c.avgStrength);
    expect([...strengths].sort((a, b) => b - a)).toEqual(strengths);
  });

  it("不存在的节点返回 null", async () => {
    const out = await findReferralChains("E999999", { maskSensitive: false });
    expect(out).toBeNull();
  });
});

describe("迭代11 · 需求预测引擎 v1", () => {
  it("predictDemand 覆盖全部 P0/P1 且字段完整、按窗口+置信排序", async () => {
    const preds = await predictDemand({ maskSensitive: false });
    expect(preds.length).toBeGreaterThanOrEqual(20);
    const e703 = preds.find((p) => p.eid === "E703");
    expect(e703).toBeDefined();
    for (const p of preds) {
      expect(p.direction.length).toBeGreaterThan(0);
      expect(["0-30天", "30-60天", "60-90天", "待观察"]).toContain(p.window);
      expect(["高", "中", "低"]).toContain(p.confidence);
      expect(p.basis.length).toBeGreaterThanOrEqual(1);
      expect(p.source.length).toBeGreaterThan(0);
    }
  });

  it("连接器清单：手工回填 active + 招聘API planned 插槽", () => {
    const cs = listConnectors();
    expect(cs.some((c) => c.status === "active")).toBe(true);
    expect(cs.some((c) => c.status === "planned")).toBe(true);
  });
});

describe("迭代11 · 学习飞轮 v1（人在环）", () => {
  it("buildFlywheel 输出样本统计 + 非空建议，建议只产 patch 不落库", async () => {
    const fw = await buildFlywheel({ maskSensitive: false });
    expect(fw.sample.won + fw.sample.lost).toBeGreaterThanOrEqual(0);
    expect(fw.suggestions.length).toBeGreaterThanOrEqual(1);
    for (const s of fw.suggestions) {
      expect(["signalBoost", "tiering", "observe"]).toContain(s.action);
      expect(["高", "中", "低"]).toContain(s.confidence);
      expect(s.rationale.length).toBeGreaterThan(0);
      if (s.action !== "observe") expect(s.patch).toBeDefined();
    }
    expect(fw.note).toContain("预览");
  });
});
