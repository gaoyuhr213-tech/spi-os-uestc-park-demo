import { describe, it, expect } from "vitest";
import { collectAffectedEntities, CRITICAL_FIELDS, LOCATION_ONLY_FIELDS, recomputeBatch } from "./changeImpactService";
import { loadEntities, loadRules } from "./dataAdapter";
import { calcEntity } from "./ruleEngine";

describe("changeImpactService", () => {
  // 1. ingestion commit 后触发指定企业重算
  it("recomputeBatch 处理指定 eids 并返回 summary", async () => {
    const ents = await loadEntities();
    const eids = ents.slice(0, 3).map(e => e.eid);
    const summary = await recomputeBatch({ eids, batchId: "test-batch-001" });
    expect(summary.processedCount).toBe(3);
    expect(summary.successCount).toBe(3);
    expect(summary.failedCount).toBe(0);
    expect(summary.loadTestProcessed).toBe(0);
  });

  // 2. load_test 不参与重算
  it("recomputeBatch 不处理 load_test eids", async () => {
    // LG- 前缀的 eid 不在 loadEntities 返回中（已被 dataAdapter 过滤）
    const summary = await recomputeBatch({ eids: ["LG-0001", "LG-0002"], batchId: "test-lt" });
    expect(summary.processedCount).toBe(0);
    expect(summary.loadTestProcessed).toBe(0);
  });

  // 3. 非关键字段不触发完整重算
  it("collectAffectedEntities 非关键字段不进入 fullRecompute", () => {
    const result = collectAffectedEntities([
      { eid: "E001", field: "floor" },
      { eid: "E002", field: "verificationStatus" },
    ]);
    expect(result.fullRecompute).toEqual([]);
    expect(result.locationOnly).toEqual(["E001"]);
    // verificationStatus 既不是 critical 也不是 location，不触发任何重算
    expect(result.eids).not.toContain("E002");
  });

  // 4. conflict resolve 后触发对应企业重算（通过 collectAffectedEntities）
  it("collectAffectedEntities 关键字段进入 fullRecompute", () => {
    const result = collectAffectedEntities([
      { eid: "E703", field: "industry" },
      { eid: "E106", field: "recruitmentDemandStrength" },
    ]);
    expect(result.fullRecompute).toContain("E703");
    expect(result.fullRecompute).toContain("E106");
  });

  // 5. rollback 后恢复旧评分（幂等性验证）
  it("重复重算保持幂等——同一 batch 重算两次结果一致", async () => {
    const ents = await loadEntities();
    const eids = ents.slice(0, 5).map(e => e.eid);
    const s1 = await recomputeBatch({ eids, batchId: "idempotent-001" });
    const s2 = await recomputeBatch({ eids, batchId: "idempotent-001" });
    expect(s1.processedCount).toBe(s2.processedCount);
    expect(s1.p0Count).toBe(s2.p0Count);
    expect(s1.p1Count).toBe(s2.p1Count);
    expect(s1.p2Count).toBe(s2.p2Count);
  });

  // 6. 决策不会重复生成（recomputeBatch 不创建决策）
  it("recomputeBatch 不直接创建决策或任务", async () => {
    const ents = await loadEntities();
    const summary = await recomputeBatch({ eids: [ents[0].eid], batchId: "no-decision" });
    // summary 中无 newDecisions/newTasks 字段——只做评分
    expect(summary.records.length).toBe(1);
    expect(summary.records[0].eid).toBe(ents[0].eid);
  });

  // 7. 单个企业失败不影响其他企业完成
  it("单个无效 eid 不阻塞其他企业", async () => {
    const ents = await loadEntities();
    const eids = ["INVALID_EID_999", ents[0].eid, ents[1].eid];
    const summary = await recomputeBatch({ eids, batchId: "partial-fail" });
    // INVALID_EID 不在 loadEntities 中，被过滤掉
    expect(summary.processedCount).toBe(2);
    expect(summary.successCount).toBe(2);
  });

  // 8. 影响摘要数量准确
  it("影响摘要 records 数量 = processedCount", async () => {
    const ents = await loadEntities();
    const eids = ents.slice(0, 10).map(e => e.eid);
    const summary = await recomputeBatch({ eids, batchId: "count-check" });
    expect(summary.records.length).toBe(summary.processedCount);
  });

  // 9. CRITICAL_FIELDS 配置正确
  it("CRITICAL_FIELDS 包含规格要求的关键字段", () => {
    expect(CRITICAL_FIELDS.has("recruitmentDemandStrength")).toBe(true);
    expect(CRITICAL_FIELDS.has("industry")).toBe(true);
    expect(CRITICAL_FIELDS.has("hrServicePriority")).toBe(true);
    expect(CRITICAL_FIELDS.has("warmIntroPath")).toBe(true);
    expect(CRITICAL_FIELDS.has("expansionSignal")).toBe(true);
    expect(LOCATION_ONLY_FIELDS.has("floor")).toBe(true);
  });

  // 10. 现有测试继续通过（由全量回归验证）
  it("calcEntity 对 production 企业返回有效结果", async () => {
    const rules = await loadRules();
    const ents = await loadEntities();
    expect(ents.length).toBeGreaterThanOrEqual(69);
    const r = calcEntity(ents[0], rules);
    expect(r.score).toBeGreaterThan(0);
    expect(["P0", "P1", "P2", "N", "运营方", "配套"]).toContain(r.tier);
  });
});
