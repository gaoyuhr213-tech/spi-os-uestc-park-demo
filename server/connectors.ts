/* ============================================================
 * 迭代11 · 连接器抽象层（Connector Abstraction Layer）
 * 目标：为"真实连接器"预留统一插槽——Demo 阶段首个实现 = 手工回填数据源
 * （enrichments 表），锚点签约后接入招聘 API 时只需新增 Connector 实现，
 * 预测引擎与上层业务零改动（对齐 ADR：数据源解耦公理）。
 * ============================================================ */
import { loadEntities, type AdapterEntity } from "./dataAdapter";

/** 连接器统一输出：企业维度的需求信号载荷 */
export interface DemandPayload {
  eid: string;
  jobsOpen: number | null;          // 在招岗位数
  topJobs: string | null;           // 在招岗位方向
  insured: number | null;           // 参保人数（团队规模代理指标）
  signals: { t: string; tier: 1 | 2; d: string }[]; // 动态信号序列
  hiringBase: string;               // 基线招聘强度（楼层实勘口径）
  ind: string;
  fetchedAt: number;
  source: string;                   // 数据来源标识（证据链）
}

export interface Connector {
  id: string;
  name: string;
  type: "manual" | "api";
  status: "active" | "planned";
  description: string;
  /** 拉取全量企业需求载荷（active 连接器实现；planned 返回空） */
  fetchDemand(): Promise<DemandPayload[]>;
}

/* ---------- 首个实现：手工回填数据源（enrichments + 信号，已入库数据） ---------- */
export const manualEnrichmentConnector: Connector = {
  id: "manual-enrichment",
  name: "手工回填数据源",
  type: "manual",
  status: "active",
  description: "情报作业标准 L1/L2 人工回填（Excel 导入 + AI 解析填充），公开工商信息，合规免爬虫",
  async fetchDemand() {
    const ents = await loadEntities();
    return ents.map((x) => ({
      eid: x.eid,
      jobsOpen: x.enrich?.jobs ?? null,
      topJobs: (x.enrich?.topJobs as string | null) ?? null,
      insured: x.enrich?.insured ?? null,
      signals: x.signals,
      hiringBase: x.hiringBase,
      ind: x.ind,
      fetchedAt: Date.now(),
      source: "手工回填（企查查/天眼查公开信息 + 楼层实勘）",
    }));
  },
};

/* ---------- 预留插槽：招聘 API 连接器（锚点签约后启用） ---------- */
export const jobBoardConnector: Connector = {
  id: "job-board-api",
  name: "招聘平台 API（插槽）",
  type: "api",
  status: "planned",
  description: "唯一真实连接器（交付物 C 规划）：接入招聘平台在招岗位数据，自动刷新需求载荷；接入后本插槽实现 fetchDemand 即可，上层零改动",
  async fetchDemand() { return []; },
};

export const CONNECTORS: Connector[] = [manualEnrichmentConnector, jobBoardConnector];

/* ============================================================
 * 迭代17 · 工单1 · 连接器注册表（DB 持久化）+ 外部源 adapter 元信息
 * adapter 数据摄入一律经 aclTransform.ingestViaAcl
 * （ACL → 实体解析 → 画像/信号装配），严禁直写领域表（ADR-06）。
 * ============================================================ */
import { desc } from "drizzle-orm";
import { connectorsTable, ingestionJobs } from "../drizzle/schema";
import { getDb } from "./db";

/** 注册表种子：3 个外部 adapter + 存量手工源（幂等播种） */
const REGISTRY_SEED = [
  { cid: "manual-enrichment", name: "手工回填数据源", ctype: "manual" as const, status: "active" as const, source: "情报作业标准 L1/L2 人工回填（Excel 导入 + AI 解析）" },
  { cid: "biz-registry", name: "工商注册源", ctype: "csv" as const, status: "active" as const, source: "企查查/天眼查公开工商信息导出（CSV/粘贴，占位真实 API）" },
  { cid: "job-board", name: "招聘平台源", ctype: "csv" as const, status: "active" as const, source: "招聘平台在招岗位导出（CSV/粘贴，占位真实 API）" },
  { cid: "patent", name: "专利/知识产权源", ctype: "csv" as const, status: "active" as const, source: "incoPat/专利检索导出（CSV/粘贴，占位真实 API）" },
];

export async function seedConnectorRegistry() {
  const db = await getDb();
  if (!db) return { ok: false };
  const existing = await db.select({ cid: connectorsTable.cid }).from(connectorsTable);
  const have = new Set(existing.map((r) => r.cid));
  for (const s of REGISTRY_SEED) {
    if (!have.has(s.cid)) await db.insert(connectorsTable).values(s);
  }
  return { ok: true };
}

/** 连接器状态列表（注册表 + 最近 job 摘要，/connectors 页状态卡） */
export async function listConnectorRegistry() {
  const db = await getDb();
  if (!db) return [];
  await seedConnectorRegistry();
  const [regs, jobs] = await Promise.all([
    db.select().from(connectorsTable),
    db.select().from(ingestionJobs).orderBy(desc(ingestionJobs.id)).limit(200),
  ]);
  return regs.map((r) => {
    const myJobs = jobs.filter((j) => j.connectorId === r.cid);
    return {
      cid: r.cid, name: r.name, ctype: r.ctype, status: r.status, source: r.source,
      lastRunAt: r.lastRunAt, jobCount: myJobs.length,
      lastJob: myJobs[0] ? { id: myJobs[0].id, status: myJobs[0].status, rowsIn: myJobs[0].rowsIn, rowsOut: myJobs[0].rowsOut, startedAt: myJobs[0].startedAt } : null,
    };
  });
}

/** ingestionJob 历史（/connectors 页表格） */
export async function listIngestionJobs(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(ingestionJobs).orderBy(desc(ingestionJobs.id)).limit(limit);
  return rows.map((j) => {
    let summary: unknown = null;
    try { summary = j.summaryJson ? JSON.parse(j.summaryJson) : null; } catch { summary = null; }
    return { ...j, summary };
  });
}

export function listConnectors() {
  return CONNECTORS.map((c) => ({ id: c.id, name: c.name, type: c.type, status: c.status, description: c.description }));
}

/** 聚合所有 active 连接器的需求载荷（多源时按 eid 合并，后源覆盖空字段） */
export async function fetchAllDemand(): Promise<Map<string, DemandPayload>> {
  const map = new Map<string, DemandPayload>();
  for (const c of CONNECTORS) {
    if (c.status !== "active") continue;
    const rows = await c.fetchDemand();
    for (const r of rows) {
      const prev = map.get(r.eid);
      if (!prev) { map.set(r.eid, r); continue; }
      map.set(r.eid, {
        ...prev,
        jobsOpen: prev.jobsOpen ?? r.jobsOpen,
        topJobs: prev.topJobs ?? r.topJobs,
        insured: prev.insured ?? r.insured,
        signals: prev.signals.length > 0 ? prev.signals : r.signals,
        source: `${prev.source} + ${r.source}`,
      });
    }
  }
  return map;
}
