/* 迭代24 · 工单13 · 69 家批量回填复算编排器
 *
 * 链路：entities 名录（69 家真实主体）→ 外源连接器批量取数（QCC 工商 / 招聘源）
 *      → ingestViaAcl 唯一入库通道（实体解析裁定归属，低置信自动入消歧队列——工单2 既有机制）
 *      → 回填完成后自动复算：buildSnapshot 内 calcEntity 按最新 enrichments/signals 实时重算
 *        （评分为读时计算架构，写入即生效；此处主动预热一次快照并写台账，供雷达联动核验）
 *
 * 降级策略（验收③）：无 key → degraded 报告 + 0 行摄入 + 手工回填指引，全程不抛异常。
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { entities, opsLedger } from "../../drizzle/schema";
import { ingestViaAcl } from "../aclTransform";
import { fetchQccByNames, qccAvailable } from "./qccConnector";
import { fetchJobBoardByNames, jobBoardAvailable } from "./jobBoardApiConnector";
import { buildSnapshot } from "../dataAdapter";
import { listDisambiguationQueue } from "../entityResolution";
import type { ExternalConnectorStatus } from "./externalTypes";

export interface BackfillReport {
  ok: boolean;
  mode: "live" | "degraded-manual";
  startedAt: string;
  finishedAt: string;
  totalEntities: number;
  sources: Array<{
    cid: string; source: string; degraded: boolean; degradedReason: string | null;
    fetched: number; jobId: number; rowsOut: number; rowsSkipped: number;
  }>;
  disambiguationQueued: number;   // 低置信待人工消歧数
  recompute: { p0: number; p1: number; avgScore: number } | null; // 复算后雷达口径
  manualFallbackHint: string | null;
}

/** 外源连接器可用性状态（前端状态卡） */
export function externalConnectorStatus(): ExternalConnectorStatus[] {
  return [
    {
      cid: "biz-registry", name: "企查查 · 工商数据", hasKey: qccAvailable(),
      mode: qccAvailable() ? "live" : "degraded-manual",
      note: qccAvailable() ? "API 直连（key 已配置）" : "未配置 QCC_API_KEY/QCC_SECRET_KEY——手工回填模式（CSV/粘贴导入可用）",
    },
    {
      cid: "job-board", name: "招聘源 · 在招岗位", hasKey: jobBoardAvailable(),
      mode: jobBoardAvailable() ? "live" : "degraded-manual",
      note: jobBoardAvailable() ? "API 直连（key 已配置）" : "未配置 JOB_BOARD_API_KEY——手工回填模式（CSV/粘贴导入可用）",
    },
  ];
}

/** 69 家批量回填 + 复算（actor 记入台账与 ingestionJob） */
export async function runBackfill(actor: string): Promise<BackfillReport> {
  const startedAt = new Date().toISOString();
  const db = await getDb();
  if (!db) {
    return {
      ok: false, mode: "degraded-manual", startedAt, finishedAt: new Date().toISOString(),
      totalEntities: 0, sources: [], disambiguationQueued: 0, recompute: null,
      manualFallbackHint: "数据库不可用",
    };
  }
  // 1) 名录：全部真实主体（demo=1 为楼层索引实勘名录）
  const ents = await db.select({ eid: entities.eid, name: entities.name }).from(entities).where(eq(entities.demo, 1));
  const names = ents.map((e) => e.name);

  const sources: BackfillReport["sources"] = [];
  let anyLive = false;

  // 2) 工商源（QCC）
  const qcc = await fetchQccByNames(names);
  if (qcc.rows.length > 0) {
    const r = await ingestViaAcl({ adapterId: "biz-registry", rawRows: qcc.rows, triggeredBy: actor });
    sources.push({ cid: "biz-registry", source: qcc.source, degraded: false, degradedReason: qcc.degradedReason, fetched: qcc.rows.length, jobId: r.jobId, rowsOut: r.rowsOut, rowsSkipped: r.rowsSkipped });
    anyLive = true;
  } else {
    sources.push({ cid: "biz-registry", source: qcc.source, degraded: true, degradedReason: qcc.degradedReason, fetched: 0, jobId: 0, rowsOut: 0, rowsSkipped: 0 });
  }

  // 3) 招聘源
  const job = await fetchJobBoardByNames(names);
  if (job.rows.length > 0) {
    const r = await ingestViaAcl({ adapterId: "job-board", rawRows: job.rows, triggeredBy: actor });
    sources.push({ cid: "job-board", source: job.source, degraded: false, degradedReason: job.degradedReason, fetched: job.rows.length, jobId: r.jobId, rowsOut: r.rowsOut, rowsSkipped: r.rowsSkipped });
    anyLive = true;
  } else {
    sources.push({ cid: "job-board", source: job.source, degraded: true, degradedReason: job.degradedReason, fetched: 0, jobId: 0, rowsOut: 0, rowsSkipped: 0 });
  }

  // 4) 消歧队列（低置信归属由 resolveIncoming 自动入队——工单2 机制）
  const queue = await listDisambiguationQueue();
  const queued = queue.filter((q) => q.status === "pending").length;

  // 5) 复算：评分为读时计算，此处预热快照并输出雷达口径（P0/P1/均分），写台账留痕
  const snap = await buildSnapshot({ maskSensitive: false });
  const p0 = snap.items.filter((i) => i.tier === "P0").length;
  const p1 = snap.items.filter((i) => i.tier === "P1").length;
  const avgScore = snap.items.length > 0 ? Math.round(snap.items.reduce((s, i) => s + i.score, 0) / snap.items.length) : 0;

  const finishedAt = new Date().toISOString();
  const mode: BackfillReport["mode"] = anyLive ? "live" : "degraded-manual";
  await db.insert(opsLedger).values({
    action: "backfill_run",
    targetEid: null,
    detail: `69家批量回填复算 · 模式=${mode} · 工商 ${sources[0].rowsOut} 行 / 招聘 ${sources[1].rowsOut} 行 · 消歧待审 ${queued} · 复算 P0=${p0} P1=${p1} 均分=${avgScore}`,
    actor,
    afterJson: JSON.stringify({ sources, queued, recompute: { p0, p1, avgScore } }),
  });

  return {
    ok: true, mode, startedAt, finishedAt,
    totalEntities: ents.length, sources, disambiguationQueued: queued,
    recompute: { p0, p1, avgScore },
    manualFallbackHint: anyLive ? null : "两个外源均未配置 API key：请在「数据接入中心」使用 CSV/粘贴导入手工回填（模板列名与 ACL 适配器一致），或配置 QCC_API_KEY/QCC_SECRET_KEY/JOB_BOARD_API_KEY 后重跑。",
  };
}
