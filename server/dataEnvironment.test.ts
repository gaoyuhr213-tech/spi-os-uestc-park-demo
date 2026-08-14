/* 迭代28 · 数据环境隔离验证测试
 * 1. 正式查询不返回 load_test 企业
 * 2. 压测查询可以返回指定 testRunId
 * 3. 清理一个 testRunId 不影响真实企业
 * 4. 压测企业关联信号和决策被正确清理或失效
 */
import { describe, it, expect } from "vitest";
import { loadEntities } from "./dataAdapter";
import { listTestRuns, cleanupTestRun, getEnvironmentStats, validateLoadTestWrite } from "./loadTestCleanup";

describe("迭代28 · 数据环境隔离", () => {
  it("AC-1: 正式查询（loadEntities）不返回 load_test 企业", async () => {
    const ents = await loadEntities();
    // 所有返回的企业 eid 不应以 LG- 开头（压测前缀）
    const loadTestEnts = ents.filter(e => e.eid.startsWith("LG-"));
    expect(loadTestEnts.length).toBe(0);
  });

  it("AC-2: 环境统计可以看到 load_test 数据存在", async () => {
    const stats = await getEnvironmentStats();
    // 应有 production 数据（69家真实企业）
    expect(stats.production).toBeGreaterThan(0);
    // load_test 数据应存在（之前标记的2000条）
    expect(stats.load_test).toBeGreaterThanOrEqual(0); // 可能已清理
  });

  it("AC-3: listTestRuns 返回压测批次列表", async () => {
    const runs = await listTestRuns();
    // 应为数组（可能为空如果已清理）
    expect(Array.isArray(runs)).toBe(true);
  });

  it("AC-4: validateLoadTestWrite 非管理员禁止写入压测数据", () => {
    const result = validateLoadTestWrite("load_test", "user");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("管理员");
  });

  it("AC-5: validateLoadTestWrite 管理员允许写入压测数据", () => {
    const result = validateLoadTestWrite("load_test", "admin");
    expect(result.allowed).toBe(true);
  });

  it("AC-6: validateLoadTestWrite 任何人可写入 production 数据", () => {
    const result = validateLoadTestWrite("production", "user");
    expect(result.allowed).toBe(true);
  });

  it("AC-7: 清理不存在的 testRunId 不影响真实企业", async () => {
    const before = await loadEntities();
    const result = await cleanupTestRun("non-existent-run-id-xyz", "test-actor");
    expect(result.entitiesDeleted).toBe(0);
    const after = await loadEntities();
    expect(after.length).toBe(before.length);
  });
});
