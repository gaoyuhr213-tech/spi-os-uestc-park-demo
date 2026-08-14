/* 迭代18 · 工单4 · RBAC-ABAC 授权引擎 + PIPL 同意管理 + 字段级分级脱敏（ADR-04）
 *
 * 数据分级（fieldGroup）：
 * - public：企业名/行业/楼层（公开信息，全员可见）
 * - business：评分/信号/岗位数（业务数据，登录可见）
 * - sensitive：注册资本/融资/参保/专利（敏感商业信息，需策略允许）
 * - pii：法定代表人/关键决策人/引荐中间人（个人信息，需同意 + 策略允许）
 *
 * 决策链：role 策略（RBAC）→ 属性条件（ABAC：requires_consent → 查 consents）→ effect
 * 全部访问经 authorizeFields() 单一入口，敏感访问写审计（opsLedger action=field_access）。
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { accessPolicies, consents, opsLedger } from "../drizzle/schema";

export type FieldGroup = "public" | "business" | "sensitive" | "pii";
export type Effect = "allow" | "mask" | "deny";
export type Role = "user" | "admin";

/** 字段 → 分级映射（enrichments 字段口径） */
export const FIELD_CLASSIFICATION: Record<string, FieldGroup> = {
  // public
  name: "public", ind: "public", floor: "public", room: "public",
  // business
  jobs: "business", topJobs: "business", salaryRange: "business", hiTech: "business",
  softCopyrights: "business", patents: "business", icp: "business",
  // sensitive
  uscc: "sensitive", regCapital: "sensitive", founded: "sensitive", insured: "sensitive",
  funding: "sensitive", bidAmount: "sensitive", branches: "sensitive",
  // pii
  legalRep: "pii", keyContact: "pii", referralVia: "pii", referralNote: "pii",
};

/** 默认策略（数据库无记录时的安全兜底：最小权限） */
const DEFAULT_POLICIES: Array<{ role: Role; fieldGroup: FieldGroup; effect: Effect; condition: string | null }> = [
  { role: "admin", fieldGroup: "public", effect: "allow", condition: null },
  { role: "admin", fieldGroup: "business", effect: "allow", condition: null },
  { role: "admin", fieldGroup: "sensitive", effect: "allow", condition: null },
  { role: "admin", fieldGroup: "pii", effect: "allow", condition: "requires_consent" },
  { role: "user", fieldGroup: "public", effect: "allow", condition: null },
  { role: "user", fieldGroup: "business", effect: "allow", condition: null },
  { role: "user", fieldGroup: "sensitive", effect: "mask", condition: null },
  { role: "user", fieldGroup: "pii", effect: "deny", condition: null },
];

/** 幂等播种默认策略 */
export async function seedPolicies(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const existing = await db.select().from(accessPolicies);
  if (existing.length > 0) return 0;
  for (const p of DEFAULT_POLICIES) {
    await db.insert(accessPolicies).values({ ...p, updatedBy: "seed" });
  }
  return DEFAULT_POLICIES.length;
}

export async function listPolicies() {
  const db = await getDb();
  if (!db) return [];
  await seedPolicies();
  return db.select().from(accessPolicies);
}

/** 管理员更新策略（治理页配置 UI） */
export async function updatePolicy(opts: { id: number; effect: Effect; condition?: string | null; actor: string }) {
  const db = await getDb();
  if (!db) return { ok: false as const, error: "数据库不可用" };
  const [row] = await db.select().from(accessPolicies).where(eq(accessPolicies.id, opts.id)).limit(1);
  if (!row) return { ok: false as const, error: "策略不存在" };
  await db.update(accessPolicies).set({
    effect: opts.effect,
    condition: opts.condition === undefined ? row.condition : opts.condition,
    updatedBy: opts.actor,
  }).where(eq(accessPolicies.id, opts.id));
  await db.insert(opsLedger).values({
    action: "policy_update", targetEid: null,
    detail: `访问策略 ${row.role}/${row.fieldGroup}: ${row.effect} → ${opts.effect}`,
    actor: opts.actor,
    beforeJson: JSON.stringify({ effect: row.effect, condition: row.condition }),
    afterJson: JSON.stringify({ effect: opts.effect, condition: opts.condition ?? row.condition }),
  });
  return { ok: true as const };
}

/* ---------- 同意管理（PIPL） ---------- */

const SCOPE_FIELDS: Record<string, string[]> = {
  contact_info: ["legalRep", "keyContact"],
  hr_data: ["insured", "jobs", "topJobs", "salaryRange"],
  finance_data: ["regCapital", "funding", "bidAmount"],
  full_profile: Object.keys(FIELD_CLASSIFICATION),
};

export async function listConsents(eid?: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = eid
    ? await db.select().from(consents).where(eq(consents.eid, eid))
    : await db.select().from(consents);
  // 过期自动标记
  const now = Date.now();
  return rows.map((r) => ({
    ...r,
    status: r.status === "granted" && r.expiresAt && r.expiresAt.getTime() < now ? ("expired" as const) : r.status,
  }));
}

export async function grantConsent(opts: { eid: string; scope: "contact_info" | "hr_data" | "finance_data" | "full_profile"; grantedBy: string; basis: string; expiresDays?: number; actor: string }) {
  const db = await getDb();
  if (!db) return { ok: false as const, error: "数据库不可用" };
  const expiresAt = opts.expiresDays ? new Date(Date.now() + opts.expiresDays * 86400_000) : null;
  const [ins] = await db.insert(consents).values({
    eid: opts.eid, scope: opts.scope, status: "granted",
    grantedBy: opts.grantedBy, basis: opts.basis, expiresAt,
  });
  await db.insert(opsLedger).values({
    action: "consent_grant", targetEid: opts.eid,
    detail: `同意授权：${opts.scope} · 来源=${opts.grantedBy} · 基础=${opts.basis}${opts.expiresDays ? ` · ${opts.expiresDays}天` : " · 长期"}`,
    actor: opts.actor,
  });
  return { ok: true as const, id: Number(ins.insertId) };
}

export async function revokeConsent(opts: { id: number; actor: string }) {
  const db = await getDb();
  if (!db) return { ok: false as const, error: "数据库不可用" };
  const [row] = await db.select().from(consents).where(eq(consents.id, opts.id)).limit(1);
  if (!row) return { ok: false as const, error: "同意记录不存在" };
  await db.update(consents).set({ status: "revoked", revokedAt: new Date(), revokedBy: opts.actor }).where(eq(consents.id, opts.id));
  await db.insert(opsLedger).values({
    action: "consent_revoke", targetEid: row.eid,
    detail: `同意撤回：${row.scope}（撤回后相关字段自动脱敏/拒绝）`, actor: opts.actor,
  });
  return { ok: true as const };
}

/** 查某企业某字段是否有有效同意 */
async function hasConsent(eid: string, field: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select().from(consents).where(and(eq(consents.eid, eid), eq(consents.status, "granted")));
  const now = Date.now();
  return rows.some((r) => {
    if (r.expiresAt && r.expiresAt.getTime() < now) return false;
    const fields = SCOPE_FIELDS[r.scope] ?? [];
    return fields.includes(field);
  });
}

/* ---------- 字段级授权主入口 ---------- */

function maskValue(v: unknown): string {
  const s = String(v ?? "");
  if (!s) return "";
  if (s.length <= 2) return "**";
  return s.slice(0, 1) + "*".repeat(Math.min(6, s.length - 2)) + s.slice(-1);
}

export interface AuthzResult {
  data: Record<string, unknown>;
  decisions: Array<{ field: string; group: FieldGroup; effect: Effect; reason: string }>;
}

/**
 * 字段级授权：按 role 策略 + 同意状态输出（allow 原值 / mask 掩码 / deny 剔除）
 * audit=true 时敏感/pii 访问写审计台账
 */
export async function authorizeFields(opts: {
  role: Role; eid: string; data: Record<string, unknown>;
  actor?: string; audit?: boolean;
}): Promise<AuthzResult> {
  const db = await getDb();
  const policies = db ? await listPolicies() : [];
  const policyOf = (group: FieldGroup): { effect: Effect; condition: string | null } => {
    const hit = policies.find((p) => p.role === opts.role && p.fieldGroup === group);
    if (hit) return { effect: hit.effect, condition: hit.condition };
    const dft = DEFAULT_POLICIES.find((p) => p.role === opts.role && p.fieldGroup === group);
    return dft ? { effect: dft.effect, condition: dft.condition } : { effect: "deny", condition: null };
  };

  const out: Record<string, unknown> = {};
  const decisionsLog: AuthzResult["decisions"] = [];
  let sensitiveAccessed = 0;

  for (const [field, value] of Object.entries(opts.data)) {
    const group = FIELD_CLASSIFICATION[field] ?? "business";
    const pol = policyOf(group);
    let effect = pol.effect;
    let reason = `策略：${opts.role}/${group}=${pol.effect}`;
    // ABAC 条件：requires_consent → 无有效同意则降级为 mask
    if (effect === "allow" && pol.condition === "requires_consent") {
      const ok = await hasConsent(opts.eid, field);
      if (!ok) { effect = "mask"; reason += " · 无有效同意，降级脱敏"; }
      else reason += " · 同意有效";
    }
    if (effect === "allow") out[field] = value;
    else if (effect === "mask") out[field] = value == null || value === "" ? value : maskValue(value);
    // deny：剔除字段
    if (group === "sensitive" || group === "pii") sensitiveAccessed++;
    decisionsLog.push({ field, group, effect, reason });
  }

  if (opts.audit && db && sensitiveAccessed > 0 && opts.actor) {
    try {
      await db.insert(opsLedger).values({
        action: "field_access", targetEid: opts.eid,
        detail: `字段级访问：${sensitiveAccessed} 个敏感/PII 字段 · role=${opts.role} · ` +
          decisionsLog.filter((d) => d.group === "pii" || d.group === "sensitive").slice(0, 8).map((d) => `${d.field}=${d.effect}`).join(","),
        actor: opts.actor,
      });
    } catch { /* 审计尽力而为，不阻断读 */ }
  }

  return { data: out, decisions: decisionsLog };
}
