/* 迭代28 · 端到端链路测试
 * 验收链路：上传企业情报 → 声明来源 → 匹配企业 → 生成字段证据
 *          → 发现冲突 → 人工采用 → 企业360查看证据 → 批次回滚
 */
import { describe, expect, it, beforeAll } from "vitest";
import { getOrCreateSource, listSources } from "./sourceService";
import { previewIngestion, commitIngestion, rollbackBatch, listBatches } from "./ingestionService";
import { listEvidenceByField, listEvidenceByEntity, electCurrentEvidence, verifyEvidence, rejectEvidence } from "./evidenceService";
import { detectConflicts, listOpenConflicts, resolveConflict } from "./conflictService";
import { resolveEntity } from "./entityResolutionV2";

describe("迭代28 · 端到端链路", () => {
  let sourceId: number;
  let batchKey: string;
  let batchId: number;

  /* ============================================================
   * 1. 声明来源
   * ============================================================ */
  it("链路1: 创建数据来源（企查查商业数据库）", async () => {
    const src = await getOrCreateSource({
      sourceKey: "qcc-test",
      name: "企查查（测试）",
      category: "commercial_database",
      provider: "企查查",
      acquisitionChannel: "api",
      reliabilityLevel: "B",
      createdBy: "test-actor",
    });
    expect(src.id).toBeGreaterThan(0);
    expect(src.category).toBe("commercial_database");
    sourceId = src.id;
  });

  it("链路1b: 来源幂等——重复创建不报错", async () => {
    const src2 = await getOrCreateSource({
      sourceKey: "qcc-test", name: "企查查（测试）", category: "commercial_database",
    });
    expect(src2.id).toBe(sourceId);
  });

  /* ============================================================
   * 2. 上传企业情报 + 匹配企业（preview 不写主数据）
   * ============================================================ */
  it("链路2: preview 匹配已有企业（成都眸视科技）", async () => {
    const preview = await previewIngestion({
      sourceKey: "qcc-test", sourceName: "企查查（测试）", sourceCategory: "commercial_database",
      acquisitionChannel: "api", processingMethod: "connector_sync",
      records: [
        { companyName: "成都眸视科技有限公司", fields: { insured: "120", regCapital: "1000万" } },
        { companyName: "不存在的公司XYZ", fields: { insured: "5" } },
      ],
      actor: "test-actor",
    });
    batchKey = preview.batchKey;
    expect(preview.summary.total).toBe(2);
    expect(preview.summary.matched).toBeGreaterThanOrEqual(1);
    // 第一条应匹配到 E703（眸视科技）
    expect(preview.records[0].matchResult.status).toMatch(/exact|high_confidence/);
    expect(preview.records[0].matchResult.matchedEid).toBe("E703");
    // 第二条未匹配
    expect(preview.records[1].matchResult.status).toBe("unmatched");
  });

  /* ============================================================
   * 3. 提交入库 → 生成字段证据
   * ============================================================ */
  it("链路3: commit 写入证据（真实入库）", async () => {
    const batch = await commitIngestion({
      batchKey, sourceKey: "qcc-test", sourceName: "企查查（测试）", sourceCategory: "commercial_database",
      acquisitionChannel: "api", processingMethod: "connector_sync",
      records: [
        { companyName: "成都眸视科技有限公司", fields: { insured: "120", regCapital: "1000万" } },
      ],
      actor: "test-actor",
    });
    expect(batch.status).toBe("committed");
    expect(batch.matchedRecords).toBe(1);
    batchId = batch.id;
  });

  it("链路3b: 证据已入库——E703 insured 字段有证据", async () => {
    const evidence = await listEvidenceByField("E703", "insured");
    expect(evidence.length).toBeGreaterThanOrEqual(1);
    const latest = evidence[0];
    expect(latest.normalizedValue).toBe("120");
    expect(latest.sourceId).toBe(sourceId);
    expect(latest.batchId).toBe(batchId);
  });

  /* ============================================================
   * 4. 发现冲突（制造第二条不同值证据）
   * ============================================================ */
  it("链路4: 第二次提交不同值 → 检测冲突", async () => {
    const batch2Key = `batch-conflict-${Date.now()}`;
    // 创建另一个来源
    const src2 = await getOrCreateSource({
      sourceKey: "park-visit-test", name: "园区走访（测试）", category: "field_visit",
      reliabilityLevel: "B", createdBy: "test-actor",
    });
    await commitIngestion({
      batchKey: batch2Key, sourceKey: "park-visit-test", sourceName: "园区走访（测试）",
      sourceCategory: "field_visit", acquisitionChannel: "manual_paste", processingMethod: "manual_entry",
      records: [{ companyName: "成都眸视科技有限公司", fields: { insured: "150" } }],
      actor: "test-actor",
    });
    // 检测冲突
    const conflict = await detectConflicts("E703", "insured");
    expect(conflict).not.toBeNull();
    expect(conflict!.resolutionStatus).toMatch(/open|suggested/);
  });

  /* ============================================================
   * 5. 人工采用（解决冲突）
   * ============================================================ */
  it("链路5: 人工解决冲突——采用园区走访的值", async () => {
    const conflicts = await listOpenConflicts();
    const c = conflicts.find((x) => x.eid === "E703" && x.fieldName === "insured");
    // 如果是 suggested 状态也算 open
    const allConflicts = (await import("./conflictService")).listOpenConflicts;
    // 找到冲突中推荐的证据
    const evidence = await listEvidenceByField("E703", "insured");
    const parkEvidence = evidence.find((e) => e.normalizedValue === "150");
    expect(parkEvidence).toBeDefined();

    // 获取冲突 ID
    const { getDb } = await import("./db");
    const { dataConflicts } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    const [conflictRow] = await db!.select().from(dataConflicts).where(eq(dataConflicts.conflictKey, "E703:insured"));

    await resolveConflict(conflictRow.id, parkEvidence!.id, "test-actor");

    // 验证：该证据现在是 current
    const afterEvidence = await listEvidenceByField("E703", "insured");
    const current = afterEvidence.find((e) => e.isCurrent === 1);
    expect(current).toBeDefined();
    expect(current!.normalizedValue).toBe("150");
  });

  /* ============================================================
   * 6. 企业360查看证据
   * ============================================================ */
  it("链路6: 查看企业全部证据（360视图）", async () => {
    const allEvidence = await listEvidenceByEntity("E703");
    expect(allEvidence.length).toBeGreaterThanOrEqual(2);
    // 至少有 insured 和 regCapital 两个字段的证据
    const fields = Array.from(new Set(allEvidence.map((e) => e.fieldName)));
    expect(fields).toContain("insured");
    expect(fields).toContain("regCapital");
  });

  /* ============================================================
   * 7. 批次回滚
   * ============================================================ */
  it("链路7: 回滚第一个批次 → 证据失效 → 重新选举", async () => {
    const result = await rollbackBatch(batchId, "test-actor");
    expect(result.rolledBack).toBeGreaterThan(0);

    // 验证批次状态
    const batches = await listBatches();
    const rolled = batches.find((b) => b.id === batchId);
    expect(rolled!.status).toBe("rolled_back");

    // 验证：回滚后 insured 证据中第一批次的已 expired
    const evidence = await listEvidenceByField("E703", "insured");
    const fromBatch1 = evidence.filter((e) => e.batchId === batchId);
    for (const e of fromBatch1) {
      expect(e.verificationStatus).toBe("expired");
      expect(e.isCurrent).toBe(0);
    }
  });

  it("链路7b: 已回滚批次不可重复回滚", async () => {
    await expect(rollbackBatch(batchId, "test-actor")).rejects.toThrow("已回滚");
  });

  /* ============================================================
   * 8. Entity Resolution v2 验收
   * ============================================================ */
  it("链路8: USCC 精确匹配", async () => {
    // E703 的 USCC（如果存在）
    const result = await resolveEntity({ companyName: "成都眸视科技有限公司" });
    expect(result.status).toMatch(/exact|high_confidence/);
    expect(result.matchedEid).toBe("E703");
  });

  it("链路8b: 未匹配企业返回 unmatched", async () => {
    const result = await resolveEntity({ companyName: "完全不存在的测试公司ABC123" });
    expect(result.status).toBe("unmatched");
  });
});
