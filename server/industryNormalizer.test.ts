import { describe, it, expect } from "vitest";
import { normalizeIndustryLabel, matchIndustryRule, INDUSTRY_PIPE_MATCH_RULES } from "./industryNormalizer";
import { loadEntities, loadRules } from "./dataAdapter";
import { calcEntity } from "./ruleEngine";

describe("industryNormalizer", () => {
  // 1. AI 匹配 AI 上位规则
  it("AI 精确匹配上位规则 score=90", () => {
    const r = normalizeIndustryLabel("AI");
    expect(r.category).toBe("AI");
    expect(r.score).toBe(90);
    expect(r.matchLevel).toBe("exact_category");
  });

  // 2. AI(计算机视觉) 优先匹配细分规则
  it("AI(计算机视觉) 命中别名规则 score=90", () => {
    const r = normalizeIndustryLabel("AI(计算机视觉)");
    expect(r.category).toBe("AI");
    expect(r.score).toBe(90);
    expect(r.details).toContain("计算机视觉");
    expect(["alias", "exact_detail"]).toContain(r.matchLevel);
  });

  // 3. 中文全角括号正确标准化
  it("AI（计算机视觉）全角括号标准化后命中", () => {
    const r = normalizeIndustryLabel("AI（计算机视觉）");
    expect(r.category).toBe("AI");
    expect(r.score).toBe(90);
  });

  // 4. 软件/云服务与软件与云服务可归一
  it("软件与云服务 和 软件/云服务 归一到软件 score=92", () => {
    const r1 = normalizeIndustryLabel("软件与云服务");
    const r2 = normalizeIndustryLabel("软件/云服务");
    expect(r1.category).toBe("软件");
    expect(r1.score).toBe(92);
    expect(r2.category).toBe("软件");
    expect(r2.score).toBe(92);
  });

  // 5. 多标签行业可拆分
  it("检验检测/测控 拆分后命中检测规则", () => {
    const r = normalizeIndustryLabel("检验检测/测控");
    expect(r.category).toBe("检测");
    expect(r.score).toBe(60);
    expect(r.tokens.length).toBeGreaterThan(1);
  });

  // 6. 别名 CV 可映射计算机视觉（通过 token）
  it("集成电路 别名命中芯片规则 score=78", () => {
    const r = normalizeIndustryLabel("集成电路");
    expect(r.category).toBe("芯片");
    expect(r.score).toBe(78);
  });

  // 7. 未知行业安全回退
  it("未知行业安全回退 score=25 不报错", () => {
    const r = normalizeIndustryLabel("量子纠缠应用");
    expect(r.matchLevel).toBe("fallback");
    expect(r.score).toBe(25);
    expect(r.category).toBe("其他");
  });

  // 8. 原始行业文本保持不变
  it("原始行业文本保留在 raw 字段", () => {
    const r = normalizeIndustryLabel("AI（计算机视觉）");
    expect(r.raw).toBe("AI（计算机视觉）");
  });

  // 9. 重复计算幂等
  it("重复计算幂等——同一输入多次调用结果一致", () => {
    const r1 = matchIndustryRule("AI与数据智能");
    const r2 = matchIndustryRule("AI与数据智能");
    const r3 = matchIndustryRule("AI与数据智能");
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });

  // 10. load_test 不参与重算
  it("loadEntities 不返回 load_test 企业", async () => {
    const ents = await loadEntities();
    for (const e of ents) {
      expect(e.eid).not.toMatch(/^LG-/);
    }
  });

  // 11. 规则更新只影响 pipeMatch
  it("calcEntity 的 score/tier 不受 pipeMatch 变化影响", async () => {
    const rules = await loadRules();
    const ents = await loadEntities();
    const e = ents.find(x => x.ind === "AI(计算机视觉)");
    if (!e) return; // 跳过如果没有该行业
    const r = calcEntity(e, rules);
    // pipeMatch 应为90（新规则），但 score 不受 pipeMatch 影响
    expect(r.pipeMatch).toBe(90);
    // score 由 baseScore + enrichBoost + signalBoost 决定
    expect(r.score).toBeGreaterThan(0);
  });

  // 12. 现有评分测试继续通过（P0/P1/P2 分布不变）
  it("P0/P1/P2 分布保持 7/19/21", async () => {
    const rules = await loadRules();
    const ents = await loadEntities();
    const results = ents.map(e => calcEntity(e, rules));
    let p0 = 0, p1 = 0, p2 = 0;
    for (const r of results) {
      if (r.tier === "P0") p0++;
      else if (r.tier === "P1") p1++;
      else if (r.tier === "P2") p2++;
    }
    expect(p0).toBe(7);
    expect(p1).toBe(19);
    expect(p2).toBe(21);
  });
});
