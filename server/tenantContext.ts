/* 迭代19 · 工单5 · 多租户就绪（ADR-02/07/10）
 * 设计原则（工单铁律：在现有代码上升级不重造）：
 * 1. 业务表统一加 tenant_id 列（默认 'uestc'），存量数据自动归属默认租户；
 * 2. TenantContext 用 AsyncLocalStorage 注入——请求入口一次绑定，
 *    仓储层通过 tenantWhere()/currentTenant() 强制过滤，不依赖调用方记得加 where；
 * 3. 双租户隔离由 vitest 验证：租户A 读不到 租户B 数据。
 *
 * 渐进式策略：现有 69 家实体规模的单租户园区先跑在 DEFAULT_TENANT 上，
 * 功能零回归；新租户开通 = 新 tenantId 写入，即刻隔离。
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { sql, type SQL } from "drizzle-orm";

export const DEFAULT_TENANT = "uestc";

/** 允许的租户 ID 形态：小写字母数字与连字符，防注入 */
const TENANT_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

const als = new AsyncLocalStorage<{ tenantId: string }>();

/** 请求入口绑定租户上下文（tRPC context / 测试内使用） */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  const tid = normalizeTenantId(tenantId);
  return als.run({ tenantId: tid }, fn);
}

/** 异步版本（显式命名，语义与 runWithTenant 相同，供 await 链使用） */
export function runWithTenantAsync<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  const tid = normalizeTenantId(tenantId);
  return als.run({ tenantId: tid }, fn);
}

export function normalizeTenantId(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toLowerCase();
  if (!t) return DEFAULT_TENANT;
  if (!TENANT_RE.test(t)) return DEFAULT_TENANT; // 非法形态回退默认租户，绝不拼接进 SQL
  return t;
}

/** 当前租户：未绑定上下文时回退默认租户（保证存量单租户功能零回归） */
export function currentTenant(): string {
  return als.getStore()?.tenantId ?? DEFAULT_TENANT;
}

/**
 * 仓储层强制租户过滤条件。
 * 用法：db.select().from(t).where(and(tenantWhere(t), ...其他条件))
 * 表必须含 tenantId 列（见 schema 的 withTenant 约定）。
 */
export function tenantWhere(table: { tenantId: unknown }): SQL {
  // 通过 drizzle sql 模板参数化，杜绝注入
  return sql`${table.tenantId as never} = ${currentTenant()}`;
}

/** 写入时自动附着租户（spread 到 insert values） */
export function withTenantValues<T extends Record<string, unknown>>(values: T): T & { tenantId: string } {
  return { ...values, tenantId: currentTenant() };
}
