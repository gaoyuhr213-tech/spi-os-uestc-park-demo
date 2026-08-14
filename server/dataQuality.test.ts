/* 迭代27 · 工单20 · 数据质量闸门验收测试 */
import { describe, expect, it, afterAll } from "vitest";
import { validateRecord, computeConfidence, applyGate, quarantine, listQuarantine, clearQuarantine, DQ_CONFIG } from "./dataQuality";

describe("工单20 · 数据质量闸门", () => {
  afterAll(() => clearQuarantine());

  it("验收1: 非法 USCC 被拦截", () => {
    const issues = validateRecord({ "统一社会信用代码": "INVALID-SHORT" });
    expect(issues.some((i) => i.field === "uscc" && i.severity === "error")).toBe(true);
  });

  it("验收1: 越界数值被拦截", () => {
    const issues = validateRecord({ "参保人数": "-5" });
    expect(issues.some((i) => i.field === "insured")).toBe(true);
    const issues2 = validateRecord({ "在招岗位数": "999999" });
    expect(issues2.some((i) => i.field === "jobs")).toBe(true);
  });

  it("验收1: 非法枚举被标记 warning", () => {
    const issues = validateRecord({ "行业": "赌博" });
    expect(issues.some((i) => i.field === "ind" && i.severity === "warning")).toBe(true);
  });

  it("验收2: 低置信记录不通过门禁", () => {
    // 只有企业名称，其余为空 → 低置信
    const conf = computeConfidence({ "企业名称": "测试" }, "手工录入");
    const gate = applyGate(conf);
    expect(gate.pass).toBe(false);
    expect(gate.confidence).toBeLessThan(DQ_CONFIG.confidenceThreshold);
  });

  it("验收2: 高置信记录通过门禁", () => {
    const conf = computeConfidence({
      "企业名称": "测试企业", "统一社会信用代码": "91510100MA12345678",
      "注册资本": "500万", "成立年份": "2020", "参保人数": "50", "在招岗位数": "10",
    }, "企查查");
    const gate = applyGate(conf);
    expect(gate.pass).toBe(true);
  });

  it("验收3: 脏数据进隔离区且来源可追溯", () => {
    clearQuarantine();
    quarantine({
      rawData: JSON.stringify({ name: "脏数据企业", uscc: "BAD" }),
      issues: JSON.stringify([{ field: "uscc", rule: "格式错误" }]),
      source: "企查查", connectorId: "biz-registry", ingestionJobId: 999,
      quarantinedAt: new Date().toISOString(),
    });
    const q = listQuarantine();
    expect(q.length).toBe(1);
    expect(q[0].connectorId).toBe("biz-registry");
    expect(q[0].ingestionJobId).toBe(999);
  });
});

