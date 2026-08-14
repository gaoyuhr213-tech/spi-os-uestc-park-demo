/* 迭代19 · 工单5 · 多租户就绪验收测试
 * 验收：① 双租户隔离——租户A 读不到租户B 数据；② 跨租户写被上下文隔离；
 *       ③ 现有单租户功能零回归（默认租户回退）；④ 非法租户 ID 回退默认。
 */
import { describe, expect, it, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { entities, decisions } from "../drizzle/schema";
import {
  DEFAULT_TENANT, currentTenant, runWithTenantAsync, normalizeTenantId, tenantWhere, withTenantValues,
} from "./tenantContext";

const T_A = "tenant-a-test";
const T_B = "tenant-b-test";

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  await db.delete(entities).where(eq(entities.tenantId, T_A));
  await db.delete(entities).where(eq(entities.tenantId, T_B));
});

describe("工单5 · TenantContext", () => {
  it("未绑定上下文时回退默认租户（存量功能零回归）", () => {
    expect(currentTenant()).toBe(DEFAULT_TENANT);
  });

  it("runWithTenant 绑定后 currentTenant 返回绑定值，作用域外恢复默认", async () => {
    await runWithTenantAsync(T_A, async () => {
      expect(currentTenant()).toBe(T_A);
    });
    expect(currentTenant()).toBe(DEFAULT_TENANT);
  });

  it("非法租户 ID 回退默认（防注入）", () => {
    expect(normalizeTenantId("Robert'); DROP TABLE--")).toBe(DEFAULT_TENANT);
    expect(normalizeTenantId("")).toBe(DEFAULT_TENANT);
    expect(normalizeTenantId("UESTC")).toBe("uestc");
    expect(normalizeTenantId("park-b2")).toBe("park-b2");
  });
});

describe("工单5 · 双租户数据隔离", () => {
  it("租户A 写入的数据，租户B 通过 tenantWhere 读不到；默认租户也读不到", async () => {
    const db = await getDb();
    if (!db) return;
    // 租户A 写入一条企业
    await runWithTenantAsync(T_A, async () => {
      await db.insert(entities).values(withTenantValues({
        eid: "E_TENA1", name: "租户A测试企业", floor: "1F", room: "101", ind: "软件",
        nature: "民营", cross: 0, tierRole: "tenant" as const, hiringBase: "无" as const,
        note: null, referralPath: null, entryPoint: null, signalsJson: "[]", dimsJson: null, demo: 1,
      }));
    });
    // 租户A 能读到
    const inA = await runWithTenantAsync(T_A, async () =>
      db.select().from(entities).where(and(tenantWhere(entities), eq(entities.eid, "E_TENA1"))));
    expect(inA.length).toBe(1);
    expect(inA[0].tenantId).toBe(T_A);
    // 租户B 读不到
    const inB = await runWithTenantAsync(T_B, async () =>
      db.select().from(entities).where(and(tenantWhere(entities), eq(entities.eid, "E_TENA1"))));
    expect(inB.length).toBe(0);
    // 默认租户（uestc）也读不到
    const inDefault = await db.select().from(entities)
      .where(and(tenantWhere(entities), eq(entities.eid, "E_TENA1")));
    expect(inDefault.length).toBe(0);
  });

  it("withTenantValues 写入自动附着当前租户", async () => {
    const v = await runWithTenantAsync(T_B, async () => withTenantValues({ eid: "X" }));
    expect(v.tenantId).toBe(T_B);
    const vDefault = withTenantValues({ eid: "Y" });
    expect(vDefault.tenantId).toBe(DEFAULT_TENANT);
  });

  it("存量业务数据全部归属默认租户 uestc（迁移正确性）", async () => {
    const db = await getDb();
    if (!db) return;
    const rows = await db.select().from(entities).where(tenantWhere(entities)).limit(5);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.tenantId).toBe(DEFAULT_TENANT);
    const decs = await db.select().from(decisions).where(tenantWhere(decisions)).limit(3);
    for (const d of decs) expect(d.tenantId).toBe(DEFAULT_TENANT);
  });
});
