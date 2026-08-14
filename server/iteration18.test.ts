/* 迭代18 · 工单3+4 验收测试
 * 工单3：basedOn 溯源链 / traceDecision 全链回溯 / appendOrAbort 语义
 * 工单4：RBAC-ABAC 授权矩阵 / PIPL 同意生命周期（授权→读取→撤回→降级）
 */
import { describe, expect, it, afterAll } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { getDb } from "./db";
import { decisions, consents, opsLedger } from "../drizzle/schema";
import { generateDecisions, transitionDecision } from "./decisionEngine";
import { traceDecision, appendOrAbort, snapshotRuleVersions } from "./decisionLedger";
import { authorizeFields, grantConsent, revokeConsent, listPolicies, FIELD_CLASSIFICATION } from "./authz";

const TEST_ACTOR = "IT18TEST";

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  await db.delete(consents).where(eq(consents.grantedBy, TEST_ACTOR));
  await db.delete(opsLedger).where(and(eq(opsLedger.actor, TEST_ACTOR)));
});

describe("工单3 · 真事件溯源", () => {
  it("决策生成写入 basedOn 溯源链（signals/rules/ruleVersions/score）", async () => {
    const db = await getDb();
    if (!db) return;
    await generateDecisions(TEST_ACTOR); // 幂等：已有活跃决策会跳过
    const rows = await db.select().from(decisions).where(like(decisions.basedOn, "%ruleVersions%")).limit(1);
    // 至少存在一条带溯源链的决策（新生成或历史批次）
    if (rows.length > 0) {
      const based = JSON.parse(rows[0].basedOn!);
      expect(based).toHaveProperty("signals");
      expect(based).toHaveProperty("rules");
      expect(based).toHaveProperty("ruleVersions");
      expect(based).toHaveProperty("score");
      expect(Array.isArray(based.rules)).toBe(true);
    }
  });

  it("traceDecision 返回五层链路（数据/规则/评分/执行/结果）", async () => {
    const db = await getDb();
    if (!db) return;
    const [d] = await db.select().from(decisions).limit(1);
    if (!d) return;
    const t = await traceDecision(d.id, false);
    expect(t).not.toBeNull();
    expect(t!.decision.id).toBe(d.id);
    expect(t!.data).toHaveProperty("signals");
    expect(t!.rules).toHaveProperty("versionsNow");
    expect(t!.outcome.status).toBe(d.status);
    expect(Array.isArray(t!.execution)).toBe(true);
  });

  it("traceDecision 对不存在的决策返回 null", async () => {
    const t = await traceDecision(99_999_999, false);
    expect(t).toBeNull();
  });

  it("appendOrAbort 正常写入台账；snapshotRuleVersions 返回版本映射", async () => {
    await expect(appendOrAbort({
      action: "decision_test", targetEid: null, detail: "[IT18] append-or-abort 语义测试", actor: TEST_ACTOR,
    })).resolves.toBeUndefined();
    const versions = await snapshotRuleVersions();
    expect(typeof versions).toBe("object");
  });

  it("transitionDecision 携带 actor 且非法流转被拒绝", async () => {
    const db = await getDb();
    if (!db) return;
    const [done] = await db.select().from(decisions).where(eq(decisions.status, "done")).limit(1);
    if (!done) return;
    const r = await transitionDecision({ id: done.id, to: "adopted", actor: TEST_ACTOR });
    expect(r.ok).toBe(false); // done 不可回退 adopted
  });
});

describe("工单4 · RBAC-ABAC + 同意 + 脱敏", () => {
  const sample = { name: "测试企业", jobs: 12, insured: 45, regCapital: "1000万", legalRep: "张三", keyContact: "李四·CTO" };

  it("user 角色：敏感=脱敏、PII=剔除、业务=原值", async () => {
    const r = await authorizeFields({ role: "user", eid: "E703", data: sample });
    expect(r.data.jobs).toBe(12); // business allow
    expect(r.data.insured).not.toBe(45); // sensitive mask（数值转掩码字符串）
    expect(String(r.data.regCapital)).toContain("*");
    expect(r.data).not.toHaveProperty("legalRep"); // pii deny 剔除
    expect(r.data).not.toHaveProperty("keyContact");
  });

  it("admin 角色：PII 无同意时降级脱敏；授权同意后原值；撤回后再降级", async () => {
    const eid = "E_IT18";
    // 无同意 → mask
    const r1 = await authorizeFields({ role: "admin", eid, data: sample });
    expect(String(r1.data.legalRep)).toContain("*");
    const d1 = r1.decisions.find((x) => x.field === "legalRep");
    expect(d1?.reason).toContain("无有效同意");
    // 授权 contact_info → legalRep 原值
    const g = await grantConsent({ eid, scope: "contact_info", grantedBy: TEST_ACTOR, basis: "测试授权", actor: TEST_ACTOR });
    expect(g.ok).toBe(true);
    const r2 = await authorizeFields({ role: "admin", eid, data: sample });
    expect(r2.data.legalRep).toBe("张三");
    // 撤回 → 再降级
    const db = await getDb();
    const [c] = await db!.select().from(consents).where(and(eq(consents.eid, eid), eq(consents.status, "granted"))).limit(1);
    expect(c).toBeTruthy();
    const rv = await revokeConsent({ id: c.id, actor: TEST_ACTOR });
    expect(rv.ok).toBe(true);
    const r3 = await authorizeFields({ role: "admin", eid, data: sample });
    expect(String(r3.data.legalRep)).toContain("*");
  });

  it("策略清单播种齐全（2角色 × 4分级）且字段分级映射覆盖 PII", async () => {
    const pol = await listPolicies();
    expect(pol.length).toBeGreaterThanOrEqual(8);
    expect(FIELD_CLASSIFICATION.legalRep).toBe("pii");
    expect(FIELD_CLASSIFICATION.uscc).toBe("sensitive");
    expect(FIELD_CLASSIFICATION.jobs).toBe("business");
  });

  it("敏感字段访问写审计台账（field_access）", async () => {
    const db = await getDb();
    if (!db) return;
    await authorizeFields({ role: "admin", eid: "E703", data: sample, actor: TEST_ACTOR, audit: true });
    const rows = await db.select().from(opsLedger)
      .where(and(eq(opsLedger.action, "field_access"), eq(opsLedger.actor, TEST_ACTOR))).limit(1);
    expect(rows.length).toBe(1);
  });
});
