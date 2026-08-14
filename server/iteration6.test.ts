/* 迭代6 单测：全链路审计（diff 留痕 + 检索）、导入逐行校验报告、周报文本生成、AI 助手权限 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function ctxWith(role: "admin" | "user" | null): TrpcContext {
  const user = role
    ? {
        id: 1, openId: `test-${role}`, email: "t@t.com", name: `测试${role}`, loginMethod: "manus",
        role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      }
    : null;
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  } as TrpcContext;
}

describe("迭代6 · RBAC 权限收敛", () => {
  it("匿名调用 ai.ask 被拒绝（UNAUTHORIZED）", async () => {
    const caller = appRouter.createCaller(ctxWith(null));
    await expect(
      caller.park.ai.ask({ question: "test", mask: false, history: [] }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("普通用户查询台账被拒绝（仅管理员）", async () => {
    const caller = appRouter.createCaller(ctxWith("user"));
    await expect(caller.park.ledger({ limit: 10 })).rejects.toThrow();
  });

  it("管理员可按行为/时间检索台账（结构正确）", async () => {
    const caller = appRouter.createCaller(ctxWith("admin"));
    const rows = await caller.park.ledger({ limit: 5, action: "rule_save", sinceDays: 30 });
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(r.action).toBe("rule_save");
      // 审计升级：rule_save 行应可携带变更前后快照字段
      expect("beforeJson" in r).toBe(true);
      expect("afterJson" in r).toBe(true);
    }
  });
});

describe("迭代6 · 导入逐行校验报告", () => {
  it("登录用户导入返回逐行报告（含状态与纠错建议）", async () => {
    const caller = appRouter.createCaller(ctxWith("admin"));
    const res = await caller.park.importEnrichment({
      rows: [
        { eid: "E703", jobs: 12, insured: 45 },                    // 成功：eid 匹配
        { name: "不存在的公司XYZ", jobs: 3 },                        // 跳过：无法匹配
        { eid: "", name: "", jobs: 1 },                             // 跳过：缺主键
      ],
    });
    expect(res.report).toHaveLength(3);
    expect(res.report[0].status).toBe("成功");
    expect(res.report[1].status).toBe("跳过");
    expect(res.report[1].suggestion).toBeTruthy();
    expect(res.report[2].status).toBe("跳过");
    expect(res.ok).toBe(1);
  });

  it("匿名导入被拒绝", async () => {
    const caller = appRouter.createCaller(ctxWith(null));
    await expect(caller.park.importEnrichment({ rows: [] })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("迭代6 · 周报生成（自动推送数据源）", () => {
  it("weeklyReview 输出完整周报结构（完成率/漏斗/推进）", async () => {
    const caller = appRouter.createCaller(ctxWith(null));
    const w = await caller.park.weeklyReview();
    expect(w.weekKey).toMatch(/^\d{4}-W\d{2}$/);
    expect(typeof w.completionRate).toBe("number");
    expect(w.funnelNow).toBeDefined();
    expect(typeof w.openTasks).toBe("number");
    expect(Array.isArray(w.doneList)).toBe(true);
    expect(Array.isArray(w.stageMoves)).toBe(true);
  });
});
