/* ============================================================
 * 迭代11 · 需求预测引擎 v1（Demand Prediction Engine）
 * 定位：可解释规则+权重版（非黑盒）——每条预测输出岗位方向、数量级、
 * 时间窗、依据清单与置信度；连接器驱动（数据源可替换）。
 * 合规边界：仅基于已回填公开数据与楼层实勘信号推断，无个人信息。
 * ============================================================ */
import { fetchAllDemand, type DemandPayload } from "./connectors";
import { loadEntities, maskEntityName } from "./dataAdapter";
import { loadRules } from "./dataAdapter";
import { calcEntity, inferIntents } from "./ruleEngine";

export interface DemandPrediction {
  eid: string;
  name: string;
  tier: string;
  score: number;
  direction: string;          // 岗位方向（如 "CV/算法工程师"）
  magnitude: "批量(≥10)" | "小批量(3-9)" | "零星(1-2)" | "暂无明确需求";
  window: "0-30天" | "30-60天" | "60-90天" | "待观察";
  confidence: "高" | "中" | "低";
  basis: string[];            // 依据清单（可解释证据链）
  source: string;             // 数据来源（连接器标识）
}

/** 岗位方向推断：在招岗位文本 > 信号关键词 > 行业默认 */
function inferDirection(p: DemandPayload): { dir: string; from: string } | null {
  if (p.topJobs && p.topJobs.trim()) return { dir: p.topJobs.trim().slice(0, 40), from: "在招岗位（回填）" };
  const sigText = p.signals.map((s) => s.t).join(" ");
  if (/CV|算法/.test(sigText)) return { dir: "CV/算法工程师", from: "招聘信号关键词" };
  if (/安全工程师/.test(sigText)) return { dir: "安全工程师", from: "招聘信号关键词" };
  if (/高管|合伙人|负责人/.test(sigText)) return { dir: "高管/技术负责人（寻访）", from: "高管需求信号" };
  if (/研发|批量招聘|技术/.test(sigText)) return { dir: "研发/技术岗", from: "招聘信号关键词" };
  const indMap: Record<string, string> = { AI: "算法/数据工程师", 软件: "软件开发工程师", 芯片: "IC 设计/验证", 通信: "通信协议/嵌入式" };
  if (indMap[p.ind]) return { dir: indMap[p.ind] + "（行业推断）", from: "行业默认映射" };
  return null;
}

export async function predictDemand(opts: { maskSensitive: boolean }): Promise<DemandPrediction[]> {
  const [rules, ents, demandMap] = await Promise.all([loadRules(), loadEntities(), fetchAllDemand()]);
  const now = new Date();
  const out: DemandPrediction[] = [];

  for (const x of ents) {
    const r = calcEntity(x, rules, now);
    if (r.tier !== "P0" && r.tier !== "P1") continue; // 只预测高价值线索
    const p = demandMap.get(x.eid);
    if (!p) continue;
    const basis: string[] = [];
    const intents = inferIntents(x, rules);

    // 数量级：在招岗位数 > 信号强度 > 基线
    let magnitude: DemandPrediction["magnitude"] = "暂无明确需求";
    if (p.jobsOpen != null && p.jobsOpen >= 10) { magnitude = "批量(≥10)"; basis.push(`在招岗位 ${p.jobsOpen} 个（已回填）`); }
    else if (p.jobsOpen != null && p.jobsOpen >= 3) { magnitude = "小批量(3-9)"; basis.push(`在招岗位 ${p.jobsOpen} 个（已回填）`); }
    else if (p.jobsOpen != null && p.jobsOpen >= 1) { magnitude = "零星(1-2)"; basis.push(`在招岗位 ${p.jobsOpen} 个（已回填）`); }
    else if (p.signals.some((s) => /批量招聘/.test(s.t))) { magnitude = "批量(≥10)"; basis.push("批量招聘信号（楼层实勘/公开动态）"); }
    else if (p.hiringBase === "高") { magnitude = "小批量(3-9)"; basis.push("基线招聘强度=高（楼层实勘口径）"); }
    else if (p.hiringBase === "中") { magnitude = "零星(1-2)"; basis.push("基线招聘强度=中"); }

    // 时间窗：Tier-1 扩张信号 → 0-30 天；抢人窗口意图 → 0-30；一般招聘信号 → 30-60；仅基线 → 60-90
    let window: DemandPrediction["window"] = "待观察";
    if (p.signals.some((s) => s.tier === 1 && /扩|租|设点/.test(s.t))) { window = "0-30天"; basis.push("Tier-1 扩张信号（强承诺动作，需求紧迫）"); }
    else if (intents.some((i) => i.tag === "talent_war")) { window = "0-30天"; basis.push("命中「抢人窗口」意图标签"); }
    else if (p.signals.some((s) => /招聘|猎聘|招/.test(s.t))) { window = "30-60天"; basis.push("活跃招聘信号（一般动态）"); }
    else if (magnitude !== "暂无明确需求") { window = "60-90天"; basis.push("仅基线强度支撑，无近期信号"); }

    // 方向
    const d = inferDirection(p);
    if (d) basis.push(`岗位方向依据：${d.from}`);

    // 置信度：已回填在招岗位=高；信号推断=中；行业默认=低
    let confidence: DemandPrediction["confidence"] = "低";
    if (p.jobsOpen != null && p.jobsOpen > 0 && d?.from === "在招岗位（回填）") confidence = "高";
    else if (p.signals.length > 0 && d && d.from !== "行业默认映射") confidence = "中";

    if (magnitude === "暂无明确需求" && window === "待观察") continue; // 无预测价值不输出

    out.push({
      eid: x.eid,
      name: opts.maskSensitive ? maskEntityName(x.name) : x.name,
      tier: r.tier, score: r.score,
      direction: d?.dir ?? "方向待回填（建议 AI 解析填充在招岗位）",
      magnitude, window, confidence, basis,
      source: p.source,
    });
  }
  // 排序：时间窗紧迫 > 置信度 > 评分
  const wRank = { "0-30天": 0, "30-60天": 1, "60-90天": 2, "待观察": 3 };
  const cRank = { 高: 0, 中: 1, 低: 2 };
  out.sort((a, b) => wRank[a.window] - wRank[b.window] || cRank[a.confidence] - cRank[b.confidence] || b.score - a.score);
  return out;
}

