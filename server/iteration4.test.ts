/* 迭代4测试：RBAC 权限收敛 + 触达任务清单规则 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { buildTaskList, type Stage } from "./ruleEngine";
import type { SeedSignal } from "./parkData";

function makeCtx(user: null | { role: "user" | "admin" }): TrpcContext {
  return {
    user: user
      ? {
          id: 1, openId: "test-user", email: "t@e.com", name: "测试员",
          loginMethod: "manus", role: user.role,
          createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
        }
      : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("RBAC 权限收敛", () => {
  it("未登录调用 lifecycle.mark 被拒绝", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.park.lifecycle.mark({ eid: "E703", stage: "已触达" })).rejects.toThrow();
  });
  it("未登录调用 importEnrichment 被拒绝", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.park.importEnrichment({ rows: [{ eid: "E703", jobs: 5 }] })).rejects.toThrow();
  });
  it("普通用户调用规则中心 rules.get 被拒绝（管理员专用）", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "user" }));
    await expect(caller.park.rules.get()).rejects.toThrow();
  });
  it("普通用户调用 admin.seedDb 被拒绝", async () => {
    const caller = appRouter.createCaller(makeCtx({ role: "user" }));
    await expect(caller.park.admin.seedDb()).rejects.toThrow();
  });
  it("公开快照 snapshot 未登录可读（对外路演）", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    const snap = await caller.park.snapshot({ mask: true });
    expect(snap.items.length).toBeGreaterThan(0);
  });
});

describe("触达任务清单规则", () => {
  const sig1: SeedSignal[] = [{ t: "扩张", tier: 1, d: "2026-07-01" }];
  const now = new Date("2026-07-30T00:00:00Z");
  const day = (n: number) => new Date(now.getTime() - n * 86400000);

  it("P0 未触达 → 首触任务，按评分排序", () => {
    const tasks = buildTaskList(
      [
        { eid: "A", tier: "P0", score: 80, stage: "未触达" as Stage, signals: sig1 },
        { eid: "B", tier: "P0", score: 90, stage: "未触达" as Stage, signals: sig1 },
      ],
      new Map(), now,
    );
    expect(tasks.map((t) => t.eid)).toEqual(["B", "A"]);
    expect(tasks[0].taskType).toBe("首触");
  });
  it("已触达超7天 → 复访任务；未超期不生成", () => {
    const tasks = buildTaskList(
      [
        { eid: "C", tier: "P0", score: 85, stage: "已触达" as Stage, signals: [] },
        { eid: "D", tier: "P0", score: 85, stage: "已触达" as Stage, signals: [] },
      ],
      new Map([
        ["C", { stage: "已触达" as Stage, at: day(10) }],
        ["D", { stage: "已触达" as Stage, at: day(3) }],
      ]), now,
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ eid: "C", taskType: "复访", daysWaiting: 10 });
  });
  it("已约见超14天 → 复访；P1 未触达带 Tier-1 信号 → 培育跟进", () => {
    const tasks = buildTaskList(
      [
        { eid: "E", tier: "P0", score: 88, stage: "已约见" as Stage, signals: [] },
        { eid: "F", tier: "P1", score: 70, stage: "未触达" as Stage, signals: sig1 },
        { eid: "G", tier: "P1", score: 70, stage: "未触达" as Stage, signals: [] },
      ],
      new Map([["E", { stage: "已约见" as Stage, at: day(20) }]]), now,
    );
    expect(tasks.find((t) => t.eid === "E")?.taskType).toBe("复访");
    expect(tasks.find((t) => t.eid === "F")?.taskType).toBe("培育跟进");
    expect(tasks.find((t) => t.eid === "G")).toBeUndefined();
  });
  it("已成交不生成任务", () => {
    const tasks = buildTaskList(
      [{ eid: "H", tier: "P0", score: 95, stage: "已成交" as Stage, signals: sig1 }],
      new Map([["H", { stage: "已成交" as Stage, at: day(30) }]]), now,
    );
    expect(tasks).toHaveLength(0);
  });
});
