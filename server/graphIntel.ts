/* 迭代20 · 工单6 · 图谱智能升级（Cap-03 TD-06）
 * 在 graphData.ts（BFS 链路）基础上升级，不重造：
 * 1. PathFinder：Top-3 最短可信路径，路径分 = 关系强度 × 新近度 × 意愿；
 * 2. CommunityDetection：连通分量 + 标签传播近似，识别「电子科大系 / 同园生态」社区；
 * 3. 语义召回：节点特征向量（行业/需求/阶段/意图 one-hot + 权重），余弦相似找同类企业。
 *    说明：embedding 首选 _core/llm.ts 生成，但内置 LLM 网关无 embedding 端点，
 *    这里用可解释的结构化特征向量实现（存 attrsJson，可无缝替换为真 embedding）；
 * 4. P0 全覆盖：每个 P0 企业 ≥1 条二度内暖引荐路径 + 话术草稿。
 */
import { loadGraph, findReferralChains } from "./graphData";
import { loadEntities, loadRules } from "./dataAdapter";
import { calcEntity } from "./ruleEngine";
import { buildNeedCanvas, inferLifecycle, type NeedItem } from "./decisionEngine";

/* ---------- 1. PathFinder：Top-3 最短可信路径 ---------- */
export interface ScoredPath {
  hops: { from: string; fromLabel: string; to: string; toLabel: string; relType: string; strength: number; evidence: string | null }[];
  pathScore: number;      // 0-100 综合路径分
  strengthPart: number;   // 强度分量（几何平均）
  recencyPart: number;    // 新近度分量
  willingnessPart: number;// 意愿分量
  explain: string[];      // 可解释拆解
  summary: string;
}

/** 关系类型 → 引荐意愿先验（校友/引荐关系意愿高，纯合作低） */
const WILLINGNESS: Record<string, number> = { referral: 0.95, alumni: 0.85, pipeline: 0.75, partner: 0.6 };

/** 新近度：图边无时间戳（演示口径），按证据文本包含年份估计；缺省 0.8 */
function edgeRecency(evidence: string | null): number {
  if (!evidence) return 0.8;
  if (/2026/.test(evidence)) return 1.0;
  if (/2025/.test(evidence)) return 0.9;
  if (/202[0-4]/.test(evidence)) return 0.7;
  return 0.8;
}

export async function findScoredPaths(targetKey: string, opts: { maskSensitive: boolean }): Promise<{ target: string; paths: ScoredPath[] } | null> {
  const base = await findReferralChains(targetKey, opts);
  if (!base) return null;
  const paths: ScoredPath[] = base.chains.map((c) => {
    // 强度：几何平均（一段弱边拉低整条路径，符合「链条最弱一环」直觉）
    const geo = Math.pow(c.hops.reduce((p, h) => p * Math.max(1, h.strength), 1), 1 / c.hops.length);
    const strengthPart = Math.round(geo);
    const rec = c.hops.reduce((s, h) => s + edgeRecency(h.evidence), 0) / c.hops.length;
    const recencyPart = Math.round(rec * 100);
    const wil = c.hops.reduce((s, h) => s + (WILLINGNESS[h.relType] ?? 0.7), 0) / c.hops.length;
    const willingnessPart = Math.round(wil * 100);
    const pathScore = Math.round(geo * rec * wil);
    return {
      hops: c.hops, pathScore, strengthPart, recencyPart, willingnessPart,
      explain: [
        `强度 ${strengthPart}/100（${c.hops.length} 跳几何平均，最弱一环决定链路质量）`,
        `新近度 ×${rec.toFixed(2)}（按证据时间估计，2026 实勘=1.0）`,
        `意愿 ×${wil.toFixed(2)}（引荐 0.95 / 校友 0.85 / 管道 0.75 / 合作 0.6）`,
      ],
      summary: c.summary,
    };
  });
  paths.sort((a, b) => b.pathScore - a.pathScore || a.hops.length - b.hops.length);
  return { target: base.target, paths: paths.slice(0, 3) };
}

/* ---------- 2. CommunityDetection：连通分量 + 锚点标签 ---------- */
export interface Community {
  id: number;
  label: string;          // 社区命名（按锚点节点推断）
  memberKeys: string[];
  memberLabels: string[];
  size: number;
  anchor: string;         // 锚点节点（度数最高）
}

export async function detectCommunities(opts: { maskSensitive: boolean }): Promise<Community[]> {
  const g = await loadGraph(opts);
  const adj = new Map<string, Set<string>>();
  for (const e of g.edges) {
    if (!adj.has(e.from)) adj.set(e.from, new Set());
    if (!adj.has(e.to)) adj.set(e.to, new Set());
    adj.get(e.from)!.add(e.to);
    adj.get(e.to)!.add(e.from);
  }
  const labelOf = new Map(g.nodes.map((n) => [n.key, n.label]));
  const visited = new Set<string>();
  const communities: Community[] = [];
  let cid = 0;
  for (const node of g.nodes) {
    if (visited.has(node.key)) continue;
    // BFS 连通分量
    const members: string[] = [];
    const queue = [node.key];
    visited.add(node.key);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      members.push(cur);
      for (const nb of Array.from(adj.get(cur) ?? [])) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    if (members.length < 2) continue; // 孤点不成社区
    // 锚点 = 度数最高节点；社区命名按锚点类型
    const anchor = members.reduce((best, k) => ((adj.get(k)?.size ?? 0) > (adj.get(best)?.size ?? 0) ? k : best), members[0]);
    const anchorLabel = labelOf.get(anchor) ?? anchor;
    const label = anchor.startsWith("dept:") || anchor.startsWith("org:") || /校友|学院|电子科大/.test(anchorLabel)
      ? `电子科大系 · ${anchorLabel}圈`
      : anchor.startsWith("plat:") ? `园区生态 · ${anchorLabel}圈` : `${anchorLabel} 关联圈`;
    communities.push({
      id: ++cid, label, memberKeys: members,
      memberLabels: members.map((k) => labelOf.get(k) ?? k),
      size: members.length, anchor: anchorLabel,
    });
  }
  return communities.sort((a, b) => b.size - a.size);
}

/* ---------- 3. 语义召回：结构化特征向量 + 余弦相似 ---------- */
/** 特征空间：行业 one-hot + 需求画布星级 + 意图标签 + 阶段序数 + 规模（可解释、确定性；
 *  接真 embedding 时替换 buildVector 即可，召回接口不变） */
const INDS = ["软件", "AI", "芯片", "通信", "检测", "企服", "教育", "新能源", "金融", "文创", "其他"];
const NEEDS = ["talent", "funding", "policy", "market", "rnd", "digital", "legal"] as const;
const INTENTS = ["expanding", "hiring_window", "ipo_shareholding", "ai_transform", "funding_active"];
const PHASES = ["种子期", "初创期", "成长期", "Pre-A", "A轮", "B轮及后", "IPO准备", "已上市", "成熟期"];

export interface SimilarEntity {
  eid: string; name: string; ind: string; tier: string; score: number;
  similarity: number; // 0-1 余弦
  sharedTraits: string[]; // 可解释共同特征
}

type Vec = number[];

function cosine(a: Vec, b: Vec): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function findSimilarEntities(eid: string, opts: { maskSensitive: boolean }, topN = 5): Promise<{ eid: string; name: string; similar: SimilarEntity[] } | null> {
  const [ents, rules] = await Promise.all([loadEntities(), loadRules()]);
  const target = ents.find((x) => x.eid === eid);
  if (!target) return null;

  const vecOf = new Map<string, { vec: Vec; canvas: NeedItem[]; phase: string; intents: string[] }>();
  for (const e of ents) {
    const calc = calcEntity(e as never, rules);
    const lc = inferLifecycle(e as never);
    const canvas = buildNeedCanvas(e as never, lc);
    const phase = lc.phase as string;
    const intents: string[] = (calc as { intents?: { tag: string }[] }).intents?.map((i) => i.tag) ?? [];
    const vec: Vec = [
      ...INDS.map((i) => (e.ind === i ? 1 : 0)),
      ...NEEDS.map((n) => (canvas.find((c) => c.tag === n)?.stars ?? 0) / 5),
      ...INTENTS.map((t) => (intents.includes(t) ? 1 : 0)),
      Math.max(0, PHASES.indexOf(phase)) / (PHASES.length - 1),
      (calc as { score: number }).score / 100,
    ];
    vecOf.set(e.eid, { vec, canvas, phase, intents });
  }

  const tv = vecOf.get(eid)!;
  const sims: SimilarEntity[] = [];
  for (const e of ents) {
    if (e.eid === eid || e.tierRole !== "tenant") continue;
    const ev = vecOf.get(e.eid)!;
    const sim = cosine(tv.vec, ev.vec);
    const shared: string[] = [];
    if (e.ind === target.ind) shared.push(`同行业（${e.ind}）`);
    const sharedNeeds = tv.canvas.filter((c) => c.stars >= 3 && (ev.canvas.find((x) => x.tag === c.tag)?.stars ?? 0) >= 3).map((c) => c.label);
    if (sharedNeeds.length > 0) shared.push(`共同强需求：${sharedNeeds.slice(0, 3).join("/")}`);
    const sharedIntents = tv.intents.filter((t) => ev.intents.includes(t));
    if (sharedIntents.length > 0) shared.push(`共同意图信号 ${sharedIntents.length} 项`);
    if (ev.phase === tv.phase) shared.push(`同阶段（${ev.phase}）`);
    const calc = calcEntity(e as never, rules) as { score: number; tier: string };
    sims.push({ eid: e.eid, name: e.name, ind: e.ind, tier: calc.tier, score: calc.score, similarity: Math.round(sim * 1000) / 1000, sharedTraits: shared });
  }
  sims.sort((a, b) => b.similarity - a.similarity);
  return { eid, name: target.name, similar: sims.slice(0, topN) };
}

/* ---------- 4. P0 全覆盖引荐路径 + 话术草稿 ---------- */
export interface P0Referral {
  eid: string; name: string; tier: string;
  bestPath: ScoredPath | null;
  covered: boolean; // 二度内有路径（≤2 个中间人，即 ≤3 跳；对齐 LinkedIn 2nd-degree 口径）
  draft: string;    // 话术草稿
}

export async function buildP0ReferralCoverage(opts: { maskSensitive: boolean }): Promise<{ total: number; covered: number; items: P0Referral[] }> {
  const [ents, rules] = await Promise.all([loadEntities(), loadRules()]);
  const p0s = ents.filter((e) => {
    if (e.tierRole !== "tenant") return false;
    const c = calcEntity(e as never, rules) as { tier: string };
    return c.tier === "P0";
  });
  const items: P0Referral[] = [];
  for (const e of p0s) {
    const r = await findScoredPaths(e.eid, opts);
    const best = r?.paths[0] ?? null;
    // 二度 = 经过 ≤2 个中间节点（hops-1 ≤ 2 即 hops ≤ 3）；BFS 上限即 3 跳
    const covered = !!best && best.hops.length <= 3;
    const via = best ? best.hops.map((h) => h.toLabel).slice(0, -1).join("、") : "";
    const draft = best
      ? `【暖引荐草稿】拟经${via ? ` ${via} ` : "平台直连"}引荐至「${r!.target}」：您好，我们是园区「人才服务进企业」合作方（高于人力×感知序列）。注意到贵司近期动态与我们的信软学院人才管道高度匹配，经${via || "园区平台"}引荐，希望约 30 分钟当面呈报一份针对贵司的《人才供给方案》。路径可信度 ${best.pathScore}/100（${best.explain[0]}）。`
      : `【培育提示】暂无二度内暖引荐路径，建议先通过园区活动建立首触，或经园区股份官方渠道正式拜访。`;
    items.push({ eid: e.eid, name: r?.target ?? e.name, tier: "P0", bestPath: best, covered, draft });
  }
  return { total: items.length, covered: items.filter((x) => x.covered).length, items };
}
