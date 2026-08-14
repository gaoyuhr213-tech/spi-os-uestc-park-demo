/* 迭代20 · 工单6 · 图谱智能验收测试 */
import { describe, expect, it } from "vitest";
import { findScoredPaths, detectCommunities, findSimilarEntities, buildP0ReferralCoverage } from "./graphIntel";

describe("工单6 · PathFinder（路径分=强度×新近度×意愿）", () => {
  it("E703 返回 Top-3 内路径，路径分三分量可解释", async () => {
    const r = await findScoredPaths("E703", { maskSensitive: false });
    expect(r).not.toBeNull();
    expect(r!.paths.length).toBeGreaterThan(0);
    expect(r!.paths.length).toBeLessThanOrEqual(3);
    const p = r!.paths[0];
    expect(p.pathScore).toBeGreaterThan(0);
    expect(p.pathScore).toBeLessThanOrEqual(100);
    expect(p.strengthPart).toBeGreaterThan(0);
    expect(p.recencyPart).toBeGreaterThan(0);
    expect(p.willingnessPart).toBeGreaterThan(0);
    expect(p.explain.join("")).toContain("强度");
    expect(p.explain.join("")).toContain("意愿");
  });
  it("路径按分数降序", async () => {
    const r = await findScoredPaths("E703", { maskSensitive: false });
    const scores = r!.paths.map((p) => p.pathScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
  it("不存在的目标返回 null", async () => {
    expect(await findScoredPaths("E_FAKE", { maskSensitive: false })).toBeNull();
  });
});

describe("工单6 · CommunityDetection", () => {
  it("识别出电子科大系/园区生态社区，成员≥2", async () => {
    const cs = await detectCommunities({ maskSensitive: false });
    expect(cs.length).toBeGreaterThan(0);
    expect(cs[0].size).toBeGreaterThanOrEqual(2);
    expect(cs[0].label).toBeTruthy();
    expect(cs[0].anchor).toBeTruthy();
  });
});

describe("工单6 · 语义召回", () => {
  it("E703 召回同类企业，相似度可解释", async () => {
    const r = await findSimilarEntities("E703", { maskSensitive: false });
    expect(r).not.toBeNull();
    expect(r!.similar.length).toBeGreaterThan(0);
    expect(r!.similar.length).toBeLessThanOrEqual(5);
    const top = r!.similar[0];
    expect(top.similarity).toBeGreaterThan(0.5); // 同园同类应高相似
    expect(top.sharedTraits.length).toBeGreaterThan(0); // 共同特征可解释
    // 降序
    const sims = r!.similar.map((s) => s.similarity);
    expect([...sims].sort((a, b) => b - a)).toEqual(sims);
  });
});

describe("工单6 · P0 引荐全覆盖", () => {
  it("每个 P0 企业 ≥1 条二度内路径 + 话术草稿（验收：全覆盖）", async () => {
    const r = await buildP0ReferralCoverage({ maskSensitive: false });
    expect(r.total).toBeGreaterThan(0);
    expect(r.covered).toBe(r.total); // 全覆盖
    for (const item of r.items) {
      expect(item.bestPath, item.eid).not.toBeNull();
      expect(item.draft).toContain("引荐");
    }
  });
});

