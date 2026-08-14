/* ============================================================
 * 迭代17 · 工单1 · ACL 防腐层（Anti-Corruption Layer，ADR-06）
 *
 * 铁律：外部数据（工商/招聘/专利/CSV/粘贴）一律先转换为内部本体
 * （ResolvedEntityDraft / ProfilePatch / SignalEventDraft），
 * 再经实体解析引擎（工单2）落库。任何 adapter 严禁直写 entities 表——
 * 本模块是唯一入库通道，且每次摄入写一条 ingestionJobs 留痕。
 * ============================================================ */
import { eq } from "drizzle-orm";
import { connectorsTable, ingestionJobs, enrichments, entities } from "../drizzle/schema";
import { getDb } from "./db";
import { resolveIncoming, type ResolutionOutcome } from "./entityResolution";

/* ---------- 内部本体（Ontology）字段：ACL 的唯一输出形态 ---------- */

/** 实体草稿：待实体解析的外部记录（尚无 eid，由解析引擎裁定归属） */
export interface ResolvedEntityDraft {
  rawName: string;              // 外部原始企业名
  uscc?: string | null;         // 统一社会信用代码（主键锚点）
  floor?: string | null;
  room?: string | null;
  ind?: string | null;
}

/** 画像补丁：写入 enrichments 的字段级更新（仅白名单字段） */
export interface ProfilePatch {
  uscc?: string; regCapital?: string; founded?: string; insured?: number;
  legalRep?: string; jobs?: number; topJobs?: string; salaryRange?: string;
  patents?: number; softCopyrights?: number; hiTech?: string; funding?: string;
}

/** 信号事件草稿：追加到实体 signalsJson 的动态信号 */
export interface SignalEventDraft {
  t: string;            // 信号文本，如「批量招聘(Java×5)」
  tier: 1 | 2;
  d: string;            // YYYY-MM-DD
}

/** ACL 统一输出：一条外部记录 → 一份本体三元组 */
export interface AclRecord {
  entity: ResolvedEntityDraft;
  profile: ProfilePatch;
  signals: SignalEventDraft[];
}

/* ---------- 三个外部源 adapter 的原始记录形态 ---------- */
export interface RawExternalRecord { [k: string]: string }

const S = (v: string | undefined | null) => (v ?? "").trim() || null;
const N = (v: string | undefined | null) => {
  const n = Number((v ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};
const today = () => new Date().toISOString().slice(0, 10);

/** 工商注册源（企查查/天眼查导出口径）→ 本体 */
export function transformBizRegistry(row: RawExternalRecord): AclRecord | null {
  const name = S(row["企业名称"] ?? row["name"]);
  if (!name) return null;
  return {
    entity: { rawName: name, uscc: S(row["统一社会信用代码"] ?? row["uscc"]), ind: S(row["行业"] ?? row["ind"]) },
    profile: {
      uscc: S(row["统一社会信用代码"] ?? row["uscc"]) ?? undefined,
      regCapital: S(row["注册资本"] ?? row["regCapital"]) ?? undefined,
      founded: S(row["成立年份"] ?? row["founded"]) ?? undefined,
      insured: N(row["参保人数"] ?? row["insured"]),
      legalRep: S(row["法定代表人"] ?? row["legalRep"]) ?? undefined,
      hiTech: S(row["高企资质"] ?? row["hiTech"]) ?? undefined,
      funding: S(row["融资轮次"] ?? row["funding"]) ?? undefined,
    },
    signals: S(row["变更事项"]) ? [{ t: `工商变更:${S(row["变更事项"])}`, tier: 2, d: today() }] : [],
  };
}

/** 招聘源（招聘平台导出口径）→ 本体 */
export function transformJobBoard(row: RawExternalRecord): AclRecord | null {
  const name = S(row["企业名称"] ?? row["name"]);
  if (!name) return null;
  const jobs = N(row["在招岗位数"] ?? row["jobs"]);
  const topJobs = S(row["核心岗位"] ?? row["topJobs"]);
  return {
    entity: { rawName: name, uscc: S(row["uscc"]) },
    profile: { jobs, topJobs: topJobs ?? undefined, salaryRange: S(row["薪资范围"] ?? row["salaryRange"]) ?? undefined },
    signals: jobs && jobs >= 3
      ? [{ t: `批量招聘(${topJobs ?? "多岗位"}×${jobs})`, tier: jobs >= 5 ? 1 : 2, d: today() }]
      : [],
  };
}

/** 专利/知识产权源（incoPat 口径）→ 本体 */
export function transformPatent(row: RawExternalRecord): AclRecord | null {
  const name = S(row["企业名称"] ?? row["name"]);
  if (!name) return null;
  const patents = N(row["专利数"] ?? row["patents"]);
  const soft = N(row["软著数"] ?? row["softCopyrights"]);
  return {
    entity: { rawName: name, uscc: S(row["uscc"]) },
    profile: { patents, softCopyrights: soft },
    signals: S(row["近期新增专利"]) ? [{ t: `新增专利:${S(row["近期新增专利"])}`, tier: 2, d: today() }] : [],
  };
}

export type AdapterId = "biz-registry" | "job-board" | "patent";
export const ACL_TRANSFORMS: Record<AdapterId, (r: RawExternalRecord) => AclRecord | null> = {
  "biz-registry": transformBizRegistry,
  "job-board": transformJobBoard,
  "patent": transformPatent,
};

/* ---------- CSV / 粘贴文本解析（入口占位真实 API） ---------- */
export function parseCsvText(text: string): RawExternalRecord[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(sep);
    const row: RawExternalRecord = {};
    headers.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
    return row;
  });
}

/* ---------- 摄入管道：ACL → 实体解析 → 画像/信号装配（唯一入库通道） ---------- */
export interface IngestResult {
  jobId: number;
  rowsIn: number;
  rowsOut: number;
  rowsSkipped: number;
  resolutions: ResolutionOutcome[];
  error?: string;
}

export async function ingestViaAcl(opts: {
  adapterId: AdapterId;
  rawRows: RawExternalRecord[];
  triggeredBy: string;
}): Promise<IngestResult> {
  const db = await getDb();
  if (!db) return { jobId: 0, rowsIn: opts.rawRows.length, rowsOut: 0, rowsSkipped: 0, resolutions: [], error: "数据库不可用" };

  // 1) 开 job 留痕
  await db.insert(ingestionJobs).values({
    connectorId: opts.adapterId, status: "running",
    rowsIn: opts.rawRows.length, triggeredBy: opts.triggeredBy,
  });
  const jobRows = await db.select().from(ingestionJobs).where(eq(ingestionJobs.connectorId, opts.adapterId));
  const jobId = Math.max(...jobRows.map((j) => j.id));

  const transform = ACL_TRANSFORMS[opts.adapterId];
  let rowsOut = 0, rowsSkipped = 0;
  const resolutions: ResolutionOutcome[] = [];
  const written: string[] = [];
  let error: string | undefined;

  try {
    for (const raw of opts.rawRows) {
      // 2) ACL 转换：外部记录 → 内部本体
      const acl = transform(raw);
      if (!acl) { rowsSkipped++; continue; }

      // 3) 实体解析（工单2 引擎）：裁定归属 eid（严禁 adapter 直写 entities）
      const resolution = await resolveIncoming(acl.entity, opts.triggeredBy);
      resolutions.push(resolution);
      if (resolution.kind === "unmatched") { rowsSkipped++; continue; }
      const eid = resolution.eid;

      // 4) 画像装配：字段级写入 enrichments（仅白名单字段，空值不覆盖）
      const patch = Object.fromEntries(Object.entries(acl.profile).filter(([, v]) => v !== undefined && v !== null));
      if (Object.keys(patch).length > 0) {
        const existing = await db.select().from(enrichments).where(eq(enrichments.eid, eid)).limit(1);
        if (existing.length > 0) await db.update(enrichments).set(patch).where(eq(enrichments.eid, eid));
        else await db.insert(enrichments).values({ eid, ...patch });
      }

      // 5) 信号装配：追加到 entities.signalsJson（追加式，不清除历史）
      if (acl.signals.length > 0) {
        const [ent] = await db.select().from(entities).where(eq(entities.eid, eid)).limit(1);
        if (ent) {
          let sig: SignalEventDraft[] = [];
          try { sig = JSON.parse(ent.signalsJson ?? "[]"); } catch { sig = []; }
          const merged = [...sig, ...acl.signals.filter((s) => !sig.some((x) => x.t === s.t && x.d === s.d))];
          await db.update(entities).set({ signalsJson: JSON.stringify(merged) }).where(eq(entities.eid, eid));
        }
      }
      rowsOut++;
      written.push(`${eid}:${Object.keys(patch).join("/")}${acl.signals.length > 0 ? `+${acl.signals.length}信号` : ""}`);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 6) 收口 job 留痕
  const status = error ? "failed" : rowsSkipped > 0 ? "partial" : "success";
  await db.update(ingestionJobs).set({
    status, rowsOut, rowsSkipped, error: error ?? null,
    summaryJson: JSON.stringify({ written: written.slice(0, 50), resolutions: resolutions.map((r) => ({ kind: r.kind, eid: r.kind !== "unmatched" ? r.eid : null, confidence: r.confidence })) }),
    finishedAt: new Date(),
  }).where(eq(ingestionJobs.id, jobId));
  await db.update(connectorsTable).set({ lastRunAt: new Date() }).where(eq(connectorsTable.cid, opts.adapterId));

  return { jobId, rowsIn: opts.rawRows.length, rowsOut, rowsSkipped, resolutions, error };
}
