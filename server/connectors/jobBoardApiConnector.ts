/* 迭代24 · 工单13 · 招聘源（Job Board）API 连接器
 *
 * 取数：企业在招岗位数/核心岗位/薪资范围（招聘平台开放接口或聚合服务）
 * key：JOB_BOARD_API_KEY（env 注入；无 key 优雅降级手工回填）
 * 映射：→ job-board ACL 原始行（中文表头，与 transformJobBoard 对齐）
 */
import type { RawExternalRecord } from "../aclTransform";
import type { ExternalFetchResult } from "./externalTypes";

const JOB_BASE = process.env.JOB_BOARD_API_BASE ?? "https://open.example-jobboard.cn/v1";

export function jobBoardKey(): string { return process.env.JOB_BOARD_API_KEY ?? ""; }
export function jobBoardAvailable(): boolean { return jobBoardKey().length > 0; }

interface JobApiRow { company?: string; openings?: number; topRoles?: string[]; salaryBand?: string }

function mapJobRow(r: JobApiRow): RawExternalRecord {
  return {
    "企业名称": r.company ?? "",
    "在招岗位数": r.openings != null ? String(r.openings) : "",
    "核心岗位": (r.topRoles ?? []).join("/"),
    "薪资范围": r.salaryBand ?? "",
  };
}

/** 按企业名批量拉取在招岗位；无 key/失败 → degraded 不崩溃 */
export async function fetchJobBoardByNames(names: string[]): Promise<ExternalFetchResult> {
  const fetchedAt = new Date().toISOString();
  const source = "招聘平台开放接口（公开在招岗位口径）";
  if (!jobBoardAvailable()) {
    return { ok: false, degraded: true, degradedReason: "JOB_BOARD_API_KEY 未配置——回退手工回填模式（不崩溃）", source, rows: [], fetchedAt };
  }
  const rows: RawExternalRecord[] = [];
  const errors: string[] = [];
  for (const name of names) {
    try {
      const url = `${JOB_BASE}/company/jobs?name=${encodeURIComponent(name)}`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${jobBoardKey()}` }, signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) { errors.push(`${name}: HTTP ${resp.status}`); continue; }
      const body = (await resp.json()) as { data?: JobApiRow };
      if (!body.data) { errors.push(`${name}: empty`); continue; }
      rows.push(mapJobRow(body.data));
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (rows.length === 0) {
    return { ok: false, degraded: true, degradedReason: `API 全部请求失败（${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}）——回退手工回填模式`, source, rows: [], fetchedAt };
  }
  return { ok: true, degraded: false, degradedReason: errors.length > 0 ? `部分失败 ${errors.length} 条` : null, source, rows, fetchedAt };
}

