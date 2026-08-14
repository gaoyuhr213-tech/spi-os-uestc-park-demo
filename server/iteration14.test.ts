/* 迭代14 测试：负责人指派 / 成交金额与金额口径 ROI / 资源库 CRUD */
import { afterAll, describe, expect, it } from "vitest";
import { buildDecisionRoi, transitionDecision } from "./decisionEngine";
import { createResource, listResources, toggleResource, updateResource } from "./resourceMatch";

// 测试资源统一物理清理，防止演示库累积脏数据（此前仅停用导致管理页出现多条「测试资源-迭代14」）
afterAll(async () => {
  const { getDb } = await import("./db");
  const { resources } = await import("../drizzle/schema");
  const { like } = await import("drizzle-orm");
  const db = await getDb();
  if (db) await db.delete(resources).where(like(resources.name, "测试资源-迭代14%"));
}, 30_000);

describe("迭代14 · 决策指派与金额口径", () => {
  it("transitionDecision 拒绝超出范围的成交金额（executing 决策）", async () => {
    const { getDb } = await import("./db");
    const { decisions } = await import("../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return; // 数据库不可用时跳过
    const [row] = await db.select({ id: decisions.id }).from(decisions).where(eq(decisions.status, "executing")).limit(1);
    if (!row) {
      // 无 executing 决策：退化为对任意决策断言 ok=false（状态机或金额校验均会拒绝）
      const [any] = await db.select({ id: decisions.id }).from(decisions).limit(1);
      if (!any) return;
      const res = await transitionDecision({ id: any.id, to: "done", outcome: "won", dealAmount: 200_000_000 });
      expect(res.ok).toBe(false);
      return;
    }
    const res = await transitionDecision({ id: row.id, to: "done", outcome: "won", dealAmount: 200_000_000 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("金额");
  });

  it("transitionDecision 不存在的决策返回错误", async () => {
    const res = await transitionDecision({ id: 999999, to: "adopted", assignee: "测试成员" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("决策不存在");
  });

  it("ROI 输出包含金额口径字段（totalAmount / byRevenueTier / byType.amount）", async () => {
    const roi = await buildDecisionRoi();
    expect(typeof roi.totalAmount).toBe("number");
    expect(Array.isArray(roi.byRevenueTier)).toBe(true);
    for (const t of roi.byType) {
      expect(typeof t.amount).toBe("number");
      expect(t.amount).toBeGreaterThanOrEqual(0);
    }
    // 收入层金额之和 = 总金额
    const tierSum = roi.byRevenueTier.reduce((s, t) => s + t.amount, 0);
    expect(tierSum).toBe(roi.totalAmount);
  });
});

describe("迭代14 · 资源库 CRUD", () => {
  it("createResource 校验非法输入", async () => {
    const bad1 = await createResource({ rtype: "unknown", name: "X", needTags: "talent", capacity: 5 });
    expect(bad1.ok).toBe(false);
    const bad2 = await createResource({ rtype: "vendor", name: "X", needTags: "notneed", capacity: 5 });
    expect(bad2.ok).toBe(false);
    const bad3 = await createResource({ rtype: "vendor", name: "  ", needTags: "talent", capacity: 5 });
    expect(bad3.ok).toBe(false);
  });

  it("create → update → toggle 全链路", async () => {
    const created = await createResource({
      rtype: "vendor", name: "测试资源-迭代14", org: "测试机构",
      needTags: "digital,policy", indTags: "检测", stageTags: "成长期", capacity: 3, note: "vitest 临时资源",
    });
    expect(created.ok).toBe(true);
    expect(created.id).toBeGreaterThan(0);
    const id = created.id!;

    const upd = await updateResource(id, { capacity: 7, note: "vitest 已更新" });
    expect(upd.ok).toBe(true);

    const rows = await listResources();
    const row = rows.find((r) => r.id === id);
    expect(row?.capacity).toBe(7);
    expect(row?.note).toBe("vitest 已更新");

    const off = await toggleResource(id, false);
    expect(off.ok).toBe(true);
    const rows2 = await listResources();
    expect(rows2.find((r) => r.id === id)?.active).toBe(0);

    // 停用资源不进入匹配（matchResources 只取 active=1）——恢复启用后清理为停用状态保留数据
    const on = await toggleResource(id, true);
    expect(on.ok).toBe(true);
    await toggleResource(id, false); // 最终停用，避免污染演示匹配
  });

  it("updateResource 校验合并后输入", async () => {
    const rows = await listResources();
    const anyRow = rows[0];
    const bad = await updateResource(anyRow.id, { capacity: 5000 });
    expect(bad.ok).toBe(false);
  });
});
