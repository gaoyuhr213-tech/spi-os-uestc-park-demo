import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, inferIntents, pipelineSignals, type CalcInput } from "./ruleEngine";

const base: CalcInput = {
  eid: "T1", name: "测试企业", floor: "7F", room: "701", ind: "AI", nature: "民企",
  cross: false, tierRole: "tenant", hiringBase: "高", note: null,
  referralPath: "A", entryPoint: null, baseScore: 80,
  signals: [
    { d: "07-20", t: "批量招聘(CV/算法)", tier: 1 },
    { d: "07-12", t: "批量招聘(CV/算法)", tier: 2 },
    { d: "07-01", t: "独占6间/扩租", tier: 1 },
  ],
  enrich: { verified: "已核验", jobs: 12, funding: "A轮", topJobs: "算法工程师", patents: 8 },
};

describe("迭代10 · 信号流水线 v1", () => {
  it("同文本信号归并计数，保留最高Tier与最近日期", () => {
    const out = pipelineSignals(base, DEFAULT_RULES, new Date("2026-07-30"));
    const hiring = out.find((s) => s.text.includes("批量招聘"))!;
    expect(hiring.count).toBe(2);
    expect(hiring.tier).toBe(1);
    expect(hiring.date).toBe("07-20");
    expect(out.length).toBe(2); // 3条原始→2条归并
  });
  it("来源标注与置信度：已核验富集的招聘类信号=情报回填/高", () => {
    const out = pipelineSignals(base, DEFAULT_RULES, new Date("2026-07-30"));
    const hiring = out.find((s) => s.text.includes("批量招聘"))!;
    expect(hiring.source).toBe("情报回填");
    expect(hiring.confidence).toBe("高");
    const rent = out.find((s) => s.text.includes("扩租"))!;
    expect(rent.source).toBe("楼层索引实勘");
    expect(rent.confidence).toBe("中");
  });
  it("衰减过半则置信度降档", () => {
    const old: CalcInput = { ...base, signals: [{ d: "01-01", t: "独占6间/扩租", tier: 2 }] };
    const out = pipelineSignals(old, DEFAULT_RULES, new Date("2026-07-30"));
    expect(out[0].fresh).toBe(false);
    expect(out[0].confidence).toBe("低");
  });
});

describe("迭代10 · 规则版意图标签", () => {
  it("E703型输入命中扩张中/抢人窗口/AI转型", () => {
    const tags = inferIntents(base, DEFAULT_RULES).map((t) => t.tag);
    expect(tags).toContain("expansion");
    expect(tags).toContain("talent_war");
    expect(tags).toContain("ai_shift");
  });
  it("每个标签输出触发规则与命中证据（可解释）", () => {
    const tags = inferIntents(base, DEFAULT_RULES);
    for (const t of tags) {
      expect(t.rule.length).toBeGreaterThan(0);
      expect(t.hits.length).toBeGreaterThan(0);
    }
    const tw = tags.find((t) => t.tag === "talent_war")!;
    expect(tw.rule).toContain("信号关键词");
    expect(tw.rule).toContain("富集字段");
  });
  it("融资信号命中 IPO 倾向；非租户不打标签", () => {
    const ipo: CalcInput = { ...base, signals: [{ d: "07-10", t: "完成股改", tier: 1 }] };
    expect(inferIntents(ipo, DEFAULT_RULES).map((t) => t.tag)).toContain("ipo");
    const op: CalcInput = { ...base, tierRole: "operator" };
    expect(inferIntents(op, DEFAULT_RULES)).toHaveLength(0);
  });
});
