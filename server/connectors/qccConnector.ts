/* 迭代24 · 工单13 · 企查查（QCC）工商数据连接器
 *
 * 取数：企业工商基础信息（统一社会信用代码/注册资本/成立年份/参保人数/高企资质）
 * key：QCC_API_KEY + QCC_SECRET_KEY（env 注入，严禁硬编码；无 key 优雅降级）
 * 映射：QCC 响应 → biz-registry ACL 原始行（中文表头，与 transformBizRegistry 对齐）
 * 真实 API 口径：https://api.qichacha.com/ECIV4/GetBasicDetailsByName（GET，Token=md5(key+ts+secret)）
 */
import crypto from "node:crypto";
import type { RawExternalRecord } from "../aclTransform";
import type { ExternalFetchResult } from "./externalTypes";

const QCC_BASE = process.env.QCC_API_BASE ?? "https://api.qichacha.com";

export function qccKeys(): { key: string; secret: string } {
  return { key: process.env.QCC_API_KEY ?? "", secret: process.env.QCC_SECRET_KEY ?? "" };
}
export function qccAvailable(): boolean {
  const { key, secret } = qccKeys();
  return key.length > 0 && secret.length > 0;
}

/** QCC 鉴权头：Token = MD5(key + timestamp + secret)，Timespan = 秒级时间戳 */
function qccAuthHeaders(): Record<string, string> {
  const { key, secret } = qccKeys();
  const ts = Math.floor(Date.now() / 1000).toString();
  const token = crypto.createHash("md5").update(`${key}${ts}${secret}`).digest("hex").toUpperCase();
  return { Token: token, Timespan: ts };
}

interface QccBasicResult {
  Name?: string; CreditCode?: string; RegistCapi?: string; StartDate?: string;
  InsuredCount?: number | string; TagList?: Array<{ Type?: string; Name?: string }>;
}

/** 映射 QCC 响应 → biz-registry ACL 原始行（中文表头口径） */
function mapQccRow(r: QccBasicResult): RawExternalRecord {
  const hiTech = (r.TagList ?? []).some((t) => /高新技术|高企/.test(t.Name ?? "")) ? "是" : "";
  return {
    "企业名称": r.Name ?? "",
    "统一社会信用代码": r.CreditCode ?? "",
    "注册资本": r.RegistCapi ?? "",
    "成立年份": (r.StartDate ?? "").slice(0, 4),
    "参保人数": r.InsuredCount != null ? String(r.InsuredCount) : "",
    "高企资质": hiTech,
  };
}

/** 按企业名批量拉取工商信息；无 key/失败 → degraded 不崩溃 */
export async function fetchQccByNames(names: string[]): Promise<ExternalFetchResult> {
  const fetchedAt = new Date().toISOString();
  const source = "企查查 ECIV4/GetBasicDetailsByName（工商公示口径）";
  if (!qccAvailable()) {
    return { ok: false, degraded: true, degradedReason: "QCC_API_KEY / QCC_SECRET_KEY 未配置——回退手工回填模式（不崩溃）", source, rows: [], fetchedAt };
  }
  const rows: RawExternalRecord[] = [];
  const errors: string[] = [];
  for (const name of names) {
    try {
      const { key } = qccKeys();
      const url = `${QCC_BASE}/ECIV4/GetBasicDetailsByName?key=${encodeURIComponent(key)}&keyword=${encodeURIComponent(name)}`;
      const resp = await fetch(url, { headers: qccAuthHeaders(), signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) { errors.push(`${name}: HTTP ${resp.status}`); continue; }
      const body = (await resp.json()) as { Status?: string; Result?: QccBasicResult };
      if (body.Status !== "200" || !body.Result) { errors.push(`${name}: status=${body.Status}`); continue; }
      rows.push(mapQccRow(body.Result));
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // 全部失败视为降级（网络不可达等），部分成功仍返回 ok
  if (rows.length === 0) {
    return { ok: false, degraded: true, degradedReason: `API 全部请求失败（${errors.slice(0, 3).join("; ")}${errors.length > 3 ? "…" : ""}）——回退手工回填模式`, source, rows: [], fetchedAt };
  }
  return { ok: true, degraded: false, degradedReason: errors.length > 0 ? `部分失败 ${errors.length} 条` : null, source, rows, fetchedAt };
}
