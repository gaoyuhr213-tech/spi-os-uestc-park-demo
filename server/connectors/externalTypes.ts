/* 迭代24 · 工单13 · 外源连接器统一契约
 * 设计原则（ADR-06 端口适配器延伸）：
 * - 连接器只负责「取数 + 映射为 ACL 原始行」，严禁直写 entities（入库必经 ingestViaAcl）
 * - API key 一律从 env 读取（server/_core/env.ts 扩展读取器），严禁硬编码
 * - 无 key / 网络失败 → 优雅降级：返回 degraded=true + 原因，调用方回退手工回填，不崩溃
 */
import type { RawExternalRecord } from "../aclTransform";

export interface ExternalFetchResult {
  ok: boolean;
  degraded: boolean;          // true = 无 key/失败降级（调用方回退手工模式）
  degradedReason: string | null;
  source: string;             // 数据来源标注（证据链）
  rows: RawExternalRecord[];  // 已映射为 ACL 适配器可消费的原始行（表头=中文口径）
  fetchedAt: string;          // ISO 时间
}

/** 连接器可用性探测结果（前端状态卡展示） */
export interface ExternalConnectorStatus {
  cid: string;
  name: string;
  hasKey: boolean;
  mode: "live" | "degraded-manual";
  note: string;
}
