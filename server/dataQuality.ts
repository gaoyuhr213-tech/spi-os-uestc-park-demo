/* 迭代27 · 工单20 · 数据质量闸门
 *
 * 挂在 ACL 之后、入库之前：
 * 1. 字段级校验：USCC 格式、数值范围、枚举合法性
 * 2. 置信度门禁：低于阈值入人工消歧队列，不进评分/决策
 * 3. 脏数据拦截 + 隔离区，保留来源可追溯
 * 4. 质量看板：完整度/新鲜度/置信分布（按连接器分组）
 *
 * 阈值走配置（对齐 Law-05 一切可配置）
 */
import { getDb } from "./db";
import { entities, enrichments, ingestionJobs } from "../drizzle/schema";
import { desc, sql, gte } from "drizzle-orm";

/* ============================================================
 * 配置（可通过 env 或未来 ruleConfigs 表覆盖）
 * ============================================================ */
export const DQ_CONFIG = {
  confidenceThreshold: parseFloat(process.env.DQ_CONFIDENCE_THRESHOLD ?? "0.6"),
  usccPattern: /^[0-9A-Z]{18}$/,
  maxInsured: 100_000,
  maxJobs: 10_000,
  allowedIndustries: ["软件", "AI", "芯片", "通信", "制造", "生物医药", "新材料", "教育", "金融科技", "文创", "电商", "物流", "能源", "农业", "其他"],
  allowedNatures: ["有限责任", "股份有限", "合伙企业", "个人独资", "外商独资", "中外合资", "国有企业", "事业单位", "其他"],
};

/* ============================================================
 * 1. 字段级校验
 * ============================================================ */
export interface ValidationIssue {
  field: string;
  value: unknown;
  rule: string;
  severity: "error" | "warning";
}

export function validateRecord(record: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // USCC 格式
  const uscc = record["统一社会信用代码"] ?? record["uscc"];
  if (uscc && typeof uscc === "string" && uscc.length > 0 && !DQ_CONFIG.usccPattern.test(uscc)) {
    issues.push({ field: "uscc", value: uscc, rule: "USCC 必须为 18 位字母数字", severity: "error" });
  }
  // 数值范围
  const insured = Number(record["参保人数"] ?? record["insured"] ?? 0);
  if (insured < 0 || insured > DQ_CONFIG.maxInsured) {
    issues.push({ field: "insured", value: insured, rule: `参保人数须在 0-${DQ_CONFIG.maxInsured}`, severity: "error" });
  }
  const jobs = Number(record["在招岗位数"] ?? record["jobs"] ?? 0);
  if (jobs < 0 || jobs > DQ_CONFIG.maxJobs) {
    issues.push({ field: "jobs", value: jobs, rule: `在招岗位数须在 0-${DQ_CONFIG.maxJobs}`, severity: "error" });
  }
  // 枚举合法性
  const ind = (record["行业"] ?? record["ind"] ?? "") as string;
  if (ind && !DQ_CONFIG.allowedIndustries.includes(ind)) {
    issues.push({ field: "ind", value: ind, rule: "行业不在合法枚举内", severity: "warning" });
  }
  const nature = (record["企业性质"] ?? record["nature"] ?? "") as string;
  if (nature && !DQ_CONFIG.allowedNatures.includes(nature)) {
    issues.push({ field: "nature", value: nature, rule: "企业性质不在合法枚举内", severity: "warning" });
  }
  return issues;
}

/* ============================================================
 * 2. 置信度门禁
 * ============================================================ */
export interface GateResult {
  pass: boolean;
  confidence: number;
  reason: string;
}

/** 计算记录置信度（基于字段完整度 + 来源权威度） */
export function computeConfidence(record: Record<string, unknown>, source: string): number {
  const fields = ["企业名称", "统一社会信用代码", "注册资本", "成立年份", "参保人数", "在招岗位数"];
  const filled = fields.filter((f) => record[f] && String(record[f]).length > 0).length;
  const completeness = filled / fields.length;
  // 来源权威度加成
  const sourceBonus = source.includes("企查查") || source.includes("天眼查") ? 0.2 : source.includes("招聘") ? 0.1 : 0;
  return Math.min(1, completeness * 0.8 + sourceBonus + 0.1); // 基础 0.1 + 完整度 * 0.8 + 来源加成
}

export function applyGate(confidence: number): GateResult {
  if (confidence >= DQ_CONFIG.confidenceThreshold) {
    return { pass: true, confidence, reason: "置信度达标，允许入库" };
  }
  return { pass: false, confidence, reason: `置信度 ${(confidence * 100).toFixed(0)}% 低于阈值 ${(DQ_CONFIG.confidenceThreshold * 100).toFixed(0)}%，入人工消歧队列` };
}

/* ============================================================
 * 3. 脏数据隔离区
 * ============================================================ */
export interface QuarantineRecord {
  id?: number;
  rawData: string;
  issues: string;
  source: string;
  connectorId: string;
  ingestionJobId: number;
  quarantinedAt: string;
}

// 隔离区存内存（小规模）+ 台账留痕（生产可扩展为独立表）
const quarantineStore: QuarantineRecord[] = [];

export function quarantine(record: QuarantineRecord): void {
  quarantineStore.push({ ...record, quarantinedAt: new Date().toISOString() });
}

export function listQuarantine(): QuarantineRecord[] {
  return [...quarantineStore];
}

export function clearQuarantine(): void {
  quarantineStore.length = 0;
}

/* ============================================================
 * 4. 数据质量看板
 * ============================================================ */
export interface QualityMetrics {
  totalEntities: number;
  completeness: number;        // 关键字段完整度 (0-1)
  freshness: number;           // 最近 7 天有更新的比例
  confidenceDistribution: { high: number; mid: number; low: number };
  quarantined: number;
  byConnector: Array<{ cid: string; total: number; completeness: number; quarantined: number }>;
}

export async function buildQualityMetrics(): Promise<QualityMetrics> {
  const db = await getDb();
  if (!db) return { totalEntities: 0, completeness: 0, freshness: 0, confidenceDistribution: { high: 0, mid: 0, low: 0 }, quarantined: 0, byConnector: [] };

  const ents = await db.select().from(entities);
  const enrs = await db.select().from(enrichments);
  const enrMap = new Map(enrs.map((e) => [e.eid, e]));

  // 完整度：关键字段（name, ind, floor, uscc from enrichments）
  let filledCount = 0;
  const totalFields = ents.length * 4;
  for (const e of ents) {
    if (e.name) filledCount++;
    if (e.ind) filledCount++;
    if (e.floor) filledCount++;
    const enr = enrMap.get(e.eid);
    if (enr?.uscc) filledCount++;
  }
  const completeness = totalFields > 0 ? filledCount / totalFields : 0;

  // 新鲜度：最近 7 天有摄入的实体比例
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000);
  const recentJobs = await db.select({ id: ingestionJobs.id }).from(ingestionJobs).where(gte(ingestionJobs.startedAt, sevenDaysAgo));
  const freshness = ents.length > 0 ? Math.min(1, recentJobs.length / ents.length) : 0;

  // 置信分布（基于 enrichments 填充度简化计算）
  let high = 0, mid = 0, low = 0;
  for (const e of ents) {
    const enr = enrMap.get(e.eid);
    const filled = [e.name, e.ind, e.floor, enr?.uscc, enr?.jobs].filter(Boolean).length;
    const conf = filled / 5;
    if (conf >= 0.8) high++;
    else if (conf >= 0.5) mid++;
    else low++;
  }

  // 按连接器分组
  const jobs = await db.select().from(ingestionJobs).orderBy(desc(ingestionJobs.id)).limit(200);
  const connMap = new Map<string, { total: number; quarantined: number }>();
  for (const j of jobs) {
    const prev = connMap.get(j.connectorId) ?? { total: 0, quarantined: 0 };
    connMap.set(j.connectorId, { total: prev.total + j.rowsOut, quarantined: prev.quarantined + j.rowsSkipped });
  }
  const byConnector = Array.from(connMap.entries()).map(([cid, v]) => ({
    cid, total: v.total, completeness: v.total > 0 ? 1 - v.quarantined / v.total : 0, quarantined: v.quarantined,
  }));

  return { totalEntities: ents.length, completeness, freshness, confidenceDistribution: { high, mid, low }, quarantined: quarantineStore.length, byConnector };
}
