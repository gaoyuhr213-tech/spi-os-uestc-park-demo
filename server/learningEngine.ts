/* 迭代22 · 工单9 · 学习引擎（Cap-08，依赖工单3 溯源 + 既有飞轮）
 * - OutcomeCollector：决策结果（won/lost/partial）→ 训练标签；
 * - 权重重估：基于结果标签的可解释启发式重估（维度命中率对比，非黑盒）；
 * - champion-challenger：challenger 只回测不上线；回测 = 新旧权重对历史已结案决策的评分对照；
 * - 人审晋升：管理员显式 promote → 写 ruleConfigs scoring 新版本（复用版本机制，可回滚）；
 * - 血缘：训练窗口/样本量/方法/来源决策 ID 全记录（lineageJson），并写台账。
 * 硬约束（工单9）：模型可解释、晋升必须人审、不得自动上线。
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { scoreModels, decisions, ruleConfigs } from "../drizzle/schema";
import { appendLedger, loadRules, loadEntities } from "./dataAdapter";
import { calcEntity, DEFAULT_RULES, type RuleSet } from "./ruleEngine";

/* ---------- OutcomeCollector：结果 → 标签 ---------- */
export interface OutcomeSample {
  decisionId: number;
  eid: string;
  dtype: string;
  stars: number;
  label: 1 | 0;          // won=1；lost=0；partial=0.5 向上取 1（保守：视为正样本弱化）
  weight: number;        // 样本权重：won=1.0 / partial=0.6 / lost=1.0（负样本）
  dealAmount: number | null;
}

export async function collectOutcomes(): Promise<OutcomeSample[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(decisions).where(inArray(decisions.status, ["done"]));
  return rows
    .filter((r) => r.outcome === "won" || r.outcome === "lost" || r.outcome === "partial")
    .map((r) => ({
      decisionId: r.id, eid: r.eid, dtype: r.dtype, stars: r.stars,
      label: (r.outcome === "lost" ? 0 : 1) as 1 | 0,
      weight: r.outcome === "partial" ? 0.6 : 1.0,
      dealAmount: r.dealAmount,
    }));
}

/* ---------- 可解释权重重估 ----------
 * 方法（白盒，非黑盒回归）：
 * 1. 把已结案决策按企业映射到 12 维评分拆解；
 * 2. 对每一维：计算「成交组均值 - 流失组均值」的差值 gap（-5..5）；
 * 3. gap > 阈值 → 该维对成交有区分力 → 权重上调（幅度与 gap 成正比，封顶 ±20%）；
 *    gap < -阈值 → 权重下调；
 * 4. 归一化保持总权重不变；每个调整生成人话解释。
 */
export interface WeightProposal {
  dimName: string;
  oldWeight: number;
  newWeight: number;
  gap: number;          // 成交组-流失组维度均值差
  reason: string;
}

export async function proposeChallenger(actor: string): Promise<{ ok: boolean; modelKey?: string; proposals?: WeightProposal[]; sampleSize?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "数据库不可用" };
  const samples = await collectOutcomes();
  if (samples.length < 3) return { ok: false, error: `已结案样本不足（${samples.length}/3）——先在决策中心回填更多结果` };

  const [rules, ents] = await Promise.all([loadRules(), loadEntities()]);
  const calcMap = new Map(ents.map((e) => {
    const c = calcEntity(e, rules);
    return [e.eid, c] as const;
  }));

  // 分组维度均值
  const dimNames = rules.scoring.dims.map((d) => d.name);
  const wonSum: number[] = dimNames.map(() => 0); const wonN: number[] = dimNames.map(() => 0);
  const lostSum: number[] = dimNames.map(() => 0); const lostN: number[] = dimNames.map(() => 0);
  for (const s of samples) {
    const c = calcMap.get(s.eid);
    if (!c || !c.dims.length) continue;
    c.dims.forEach(([name, val], i) => {
      const idx = dimNames.indexOf(name);
      if (idx === -1) return;
      if (s.label === 1) { wonSum[idx] += val * s.weight; wonN[idx] += s.weight; }
      else { lostSum[idx] += val * s.weight; lostN[idx] += s.weight; }
    });
  }

  const GAP_THRESHOLD = 0.5;
  const proposals: WeightProposal[] = rules.scoring.dims.map((d, i) => {
    const wonAvg = wonN[i] > 0 ? wonSum[i] / wonN[i] : 0;
    const lostAvg = lostN[i] > 0 ? lostSum[i] / lostN[i] : 0;
    const gap = Number((wonAvg - lostAvg).toFixed(2));
    let ratio = 0;
    if (Math.abs(gap) >= GAP_THRESHOLD && wonN[i] > 0 && lostN[i] > 0) {
      ratio = Math.max(-0.2, Math.min(0.2, gap / 10)); // 封顶 ±20%
    }
    const newWeight = Math.max(1, Math.round(d.weight * (1 + ratio)));
    const reason = ratio > 0
      ? `成交组该维均值 ${ (wonN[i] > 0 ? (wonSum[i]/wonN[i]).toFixed(1) : "—") } 高于流失组 ${ (lostN[i] > 0 ? (lostSum[i]/lostN[i]).toFixed(1) : "—") }（差 ${gap}），区分力强 → 上调 ${(ratio*100).toFixed(0)}%`
      : ratio < 0
        ? `流失组该维均值反而更高（差 ${gap}），区分力为负 → 下调 ${(Math.abs(ratio)*100).toFixed(0)}%`
        : `两组差异不显著（差 ${gap} < ±${GAP_THRESHOLD}）或样本不足 → 保持`;
    return { dimName: d.name, oldWeight: d.weight, newWeight, gap, reason };
  });

  // 归一化：保持总权重不变
  const oldTotal = proposals.reduce((s, p) => s + p.oldWeight, 0);
  const newTotal = proposals.reduce((s, p) => s + p.newWeight, 0);
  if (newTotal !== oldTotal && newTotal > 0) {
    const scale = oldTotal / newTotal;
    proposals.forEach((p) => { p.newWeight = Math.max(1, Math.round(p.newWeight * scale)); });
  }

  // 回测：challenger 权重对历史结案决策重打分，对照命中率
  const challengerRules: RuleSet = structuredClone(rules);
  challengerRules.scoring.dims = proposals.map((p) => ({ name: p.dimName, weight: p.newWeight }));
  const backtest = backtestCompare(samples, calcMap, ents, rules, challengerRules);

  // 落库 challenger（不上线）
  const modelKey = `challenger-${new Date().toISOString().slice(0, 10)}-${Date.now() % 10000}`;
  const lineage = {
    method: "维度区分力启发式重估（白盒）",
    trainedAt: Date.now(),
    sampleSize: samples.length,
    sourceDecisionIds: samples.map((s) => s.decisionId),
    baseRuleDims: rules.scoring.dims,
    gapThreshold: GAP_THRESHOLD, capPct: 20,
  };
  await db.insert(scoreModels).values({
    modelKey, role: "challenger",
    weightsJson: JSON.stringify(challengerRules.scoring.dims),
    backtestJson: JSON.stringify(backtest),
    lineageJson: JSON.stringify(lineage),
    explanation: proposals.filter((p) => p.oldWeight !== p.newWeight).map((p) => `${p.dimName}: ${p.oldWeight}→${p.newWeight}（${p.reason}）`).join("；") || "无显著调整",
  });
  await appendLedger("learn_propose", null, `[学习引擎] 生成 challenger ${modelKey}：样本 ${samples.length} 条，调整 ${proposals.filter((p) => p.oldWeight !== p.newWeight).length} 维`, actor);
  return { ok: true, modelKey, proposals, sampleSize: samples.length };
}

/* ---------- 回测：champion vs challenger 对历史结案样本的命中对照 ----------
 * 命中定义：won 样本的企业评分应≥分级阈值 P1（模型给高分且实际成交 = 命中）；
 *          lost 样本评分低于 P0 阈值 = 正确规避。
 */
export interface BacktestResult {
  sampleSize: number;
  champion: { hitRate: number; wonAvgScore: number; lostAvgScore: number; separation: number };
  challenger: { hitRate: number; wonAvgScore: number; lostAvgScore: number; separation: number };
  verdict: "challenger_better" | "champion_better" | "tie";
}

function backtestCompare(
  samples: OutcomeSample[],
  calcMap: Map<string, ReturnType<typeof calcEntity>>,
  ents: Awaited<ReturnType<typeof loadEntities>>,
  championRules: RuleSet,
  challengerRules: RuleSet,
): BacktestResult {
  const entMap = new Map(ents.map((e) => [e.eid, e]));
  const evalRules = (rules: RuleSet) => {
    let wonSum = 0, wonN = 0, lostSum = 0, lostN = 0, hit = 0, total = 0;
    const p1 = rules.tiering.p1Min ?? 70;
    for (const s of samples) {
      const ent = entMap.get(s.eid);
      if (!ent) continue;
      const score = calcEntity(ent, rules).score;
      total++;
      if (s.label === 1) { wonSum += score; wonN++; if (score >= p1) hit++; }
      else { lostSum += score; lostN++; if (score < p1) hit++; }
    }
    const wonAvg = wonN > 0 ? wonSum / wonN : 0;
    const lostAvg = lostN > 0 ? lostSum / lostN : 0;
    return {
      hitRate: total > 0 ? Number((hit / total).toFixed(3)) : 0,
      wonAvgScore: Number(wonAvg.toFixed(1)),
      lostAvgScore: Number(lostAvg.toFixed(1)),
      separation: Number((wonAvg - lostAvg).toFixed(1)),
    };
  };
  const champion = evalRules(championRules);
  const challenger = evalRules(challengerRules);
  const verdict = challenger.hitRate > champion.hitRate || (challenger.hitRate === champion.hitRate && challenger.separation > champion.separation)
    ? "challenger_better"
    : challenger.hitRate < champion.hitRate ? "champion_better" : "tie";
  return { sampleSize: samples.length, champion, challenger, verdict };
}

/* ---------- 人审晋升（硬约束：不得自动上线） ---------- */
export async function promoteChallenger(modelId: number, actor: string): Promise<{ ok: boolean; error?: string; newVersion?: number }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "数据库不可用" };
  const [model] = await db.select().from(scoreModels).where(eq(scoreModels.id, modelId)).limit(1);
  if (!model) return { ok: false, error: "模型不存在" };
  if (model.role !== "challenger") return { ok: false, error: `仅 challenger 可晋升（当前：${model.role}）` };

  // 写 ruleConfigs scoring 新版本（复用既有版本机制 → 可在规则中心回滚）
  const dims = JSON.parse(model.weightsJson);
  const rules = await loadRules();
  const newScoring = { ...rules.scoring, dims };
  const existing = await db.select().from(ruleConfigs).where(eq(ruleConfigs.key, "scoring")).limit(1);
  let newVersion = 1;
  if (existing.length > 0) {
    newVersion = existing[0].version + 1;
    await db.update(ruleConfigs).set({
      configJson: JSON.stringify(newScoring), version: newVersion,
      description: `学习引擎晋升 ${model.modelKey} by ${actor}`,
    }).where(eq(ruleConfigs.key, "scoring"));
  } else {
    await db.insert(ruleConfigs).values({ key: "scoring", configJson: JSON.stringify(newScoring), version: 1, description: `学习引擎晋升 ${model.modelKey} by ${actor}` });
  }
  // 旧 champion 归档，新模型上位
  await db.update(scoreModels).set({ role: "archived" }).where(eq(scoreModels.role, "champion"));
  await db.update(scoreModels).set({ role: "champion", promotedAt: new Date(), promotedBy: actor }).where(eq(scoreModels.id, modelId));
  await appendLedger("learn_promote", null, `[学习引擎] ${model.modelKey} 经人审晋升为 champion（scoring v${newVersion}，可回滚）`, actor, { before: existing[0]?.configJson ?? null, after: JSON.stringify(newScoring) });
  return { ok: true, newVersion };
}

/** 淘汰 challenger */
export async function archiveModel(modelId: number, actor: string): Promise<{ ok: boolean }> {
  const db = await getDb();
  if (!db) return { ok: false };
  await db.update(scoreModels).set({ role: "archived" }).where(eq(scoreModels.id, modelId));
  await appendLedger("learn_archive", null, `[学习引擎] 模型 #${modelId} 已淘汰`, actor);
  return { ok: true };
}

/** 模型清单（champion + challengers + 血缘 + 回测） */
export async function listModels() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(scoreModels).orderBy(scoreModels.id);
  return rows.reverse().map((r) => ({
    id: r.id, modelKey: r.modelKey, role: r.role,
    weights: JSON.parse(r.weightsJson) as { name: string; weight: number }[],
    backtest: r.backtestJson ? JSON.parse(r.backtestJson) as BacktestResult : null,
    lineage: JSON.parse(r.lineageJson),
    explanation: r.explanation,
    promotedAt: r.promotedAt?.getTime() ?? null, promotedBy: r.promotedBy,
    createdAt: r.createdAt.getTime(),
  }));
}

/** 当前基线权重（champion = 在线 ruleConfigs scoring） */
export async function championSnapshot() {
  const rules = await loadRules();
  const outcomes = await collectOutcomes();
  return {
    dims: rules.scoring.dims,
    isDefault: JSON.stringify(rules.scoring.dims) === JSON.stringify(DEFAULT_RULES.scoring.dims),
    outcomeSamples: outcomes.length,
    wonCount: outcomes.filter((o) => o.label === 1).length,
    lostCount: outcomes.filter((o) => o.label === 0).length,
  };
}
