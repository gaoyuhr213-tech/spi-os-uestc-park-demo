/* 迭代23 · 工单10 · 端到端 Decision Pipeline 编排器（ADR-11 十段）
 *
 * 十段与事件（每段声明上下游，事件驱动串联）：
 *   1 Entity    ← 数据导入        → EntityMerged        （aclTransform.ingestViaAcl + entityResolution）
 *   2 Profile   ← EntityMerged    → ProfileUpdated      （enrichments 画像装配）
 *   3 Signal    ← ProfileUpdated  → SignalDetected      （signalsJson 信号装配 + 流水线归并）
 *   4 Graph     ← SignalDetected  → EdgeAsserted        （graphNodes/graphEdges 确保企业节点在图）
 *   5 Score     ← EdgeAsserted    → ScoreComputed       （ruleEngine 12维复算）
 *   6 Decision  ← ScoreComputed   → DecisionProposed    （decisionEngine.generateDecisions，带 basedOn 溯源）
 *   7 Workflow  ← DecisionProposed→ WorkflowStarted     （workflowEngine 编排就绪，采纳后可启动）
 *   8 Agent     ← WorkflowStarted → SuggestionProduced  （agentRuntime 话术/建议产出，HITL 门禁）
 *   9 Outcome   ← SuggestionProduced→ OutcomeRecorded   （done 决策回填 outcome/dealAmount）
 *  10 Learning  ← OutcomeRecorded → ModelRecalibrated   （learningEngine 样本回流可用性核验）
 *
 * 硬约束（工单10）：
 * - 一次导入触发整条链；任一段失败显式报错并中止，禁止静默 Success
 * - 同一实体在十段中 park_eid 一致（事件 payload 均携带 eids）
 * - 事件流落台账（pipeline_run），前端可查
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { entities, enrichments, graphNodes, decisions, opsLedger, workflowDefs, scoreModels } from "../drizzle/schema";
import { ingestViaAcl, type RawExternalRecord, type AdapterId, type IngestResult } from "./aclTransform";
import { loadEntities } from "./dataAdapter";
import { calcEntity } from "./ruleEngine";
import { loadRules } from "./dataAdapter";
import { generateDecisions } from "./decisionEngine";
import { seedWorkflowDefs } from "./workflowEngine";
import { runAgentTool } from "./agentRuntime";
import { collectOutcomes } from "./learningEngine";
import { seedGraph } from "./graphData";

/* ---------- 事件模型 ---------- */
export type PipelineEventName =
  | "EntityMerged" | "ProfileUpdated" | "SignalDetected" | "EdgeAsserted" | "ScoreComputed"
  | "DecisionProposed" | "WorkflowStarted" | "SuggestionProduced" | "OutcomeRecorded" | "ModelRecalibrated";

export interface PipelineEvent {
  seq: number;                 // 段序号 1-10
  name: PipelineEventName;     // 事件名
  stage: string;               // 段名（Entity/Profile/...）
  upstream: string | null;     // 上游事件
  eids: string[];              // 本段涉及的 park_eid（跨段一致性锚点）
  summary: string;             // 一句话结论（演示用）
  detail: Record<string, unknown>; // 证据细节
  at: string;                  // ISO 时间
  ms: number;                  // 本段耗时
}

export class PipelineStageError extends Error {
  constructor(public stage: string, public seq: number, message: string) {
    super(`[Pipeline 第${seq}段 ${stage}] ${message}`);
    this.name = "PipelineStageError";
  }
}

export interface PipelineRunResult {
  ok: boolean;
  runId: string;
  events: PipelineEvent[];
  failedStage?: { seq: number; stage: string; error: string };
  ingest?: IngestResult;
}

/** 测试注入：人为断开某段（工单10 验收3——断链必须显式报错） */
export const STAGE_BREAKER: { broken: Set<string> } = { broken: new Set() };

const STAGES: Array<{ seq: number; stage: string; event: PipelineEventName; upstream: string | null }> = [
  { seq: 1, stage: "Entity",   event: "EntityMerged",       upstream: null },
  { seq: 2, stage: "Profile",  event: "ProfileUpdated",     upstream: "EntityMerged" },
  { seq: 3, stage: "Signal",   event: "SignalDetected",     upstream: "ProfileUpdated" },
  { seq: 4, stage: "Graph",    event: "EdgeAsserted",       upstream: "SignalDetected" },
  { seq: 5, stage: "Score",    event: "ScoreComputed",      upstream: "EdgeAsserted" },
  { seq: 6, stage: "Decision", event: "DecisionProposed",   upstream: "ScoreComputed" },
  { seq: 7, stage: "Workflow", event: "WorkflowStarted",    upstream: "DecisionProposed" },
  { seq: 8, stage: "Agent",    event: "SuggestionProduced", upstream: "WorkflowStarted" },
  { seq: 9, stage: "Outcome",  event: "OutcomeRecorded",    upstream: "SuggestionProduced" },
  { seq: 10, stage: "Learning", event: "ModelRecalibrated", upstream: "OutcomeRecorded" },
];

function assertNotBroken(stage: string, seq: number) {
  if (STAGE_BREAKER.broken.has(stage)) {
    throw new PipelineStageError(stage, seq, "该段被人为断开（STAGE_BREAKER）——按工单10验收3要求显式报错并中止，不静默跳过");
  }
}

/* ---------- 主编排：一次数据导入触发整条十段链 ---------- */
export async function runPipeline(opts: {
  adapterId: AdapterId;
  rawRows: RawExternalRecord[];
  triggeredBy: string;
}): Promise<PipelineRunResult> {
  // runId ≤16 字符（opsLedger.targetEid varchar(16)）
  const runId = `R${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`;
  const events: PipelineEvent[] = [];
  const db = await getDb();
  if (!db) return { ok: false, runId, events, failedStage: { seq: 0, stage: "Init", error: "数据库不可用" } };

  let affectedEids: string[] = [];
  let ingest: IngestResult | undefined;

  const record = (seq: number, name: PipelineEventName, stage: string, upstream: string | null, eids: string[], summary: string, detail: Record<string, unknown>, startedAt: number) => {
    events.push({ seq, name, stage, upstream, eids, summary, detail, at: new Date().toISOString(), ms: Date.now() - startedAt });
  };

  try {
    /* ── 1 Entity：ACL 摄入 + 实体解析 → EntityMerged ── */
    let t = Date.now();
    assertNotBroken("Entity", 1);
    ingest = await ingestViaAcl(opts);
    if (ingest.error) throw new PipelineStageError("Entity", 1, ingest.error);
    affectedEids = Array.from(new Set(ingest.resolutions.filter((r) => r.kind !== "unmatched").map((r) => (r as { eid: string }).eid)));
    if (affectedEids.length === 0 && ingest.rowsIn > 0) {
      throw new PipelineStageError("Entity", 1, `导入 ${ingest.rowsIn} 行但无一行解析归属成功（全部 unmatched/skipped）——请检查数据或先建主数据`);
    }
    record(1, "EntityMerged", "Entity", null, affectedEids,
      `${ingest.rowsIn} 行经 ACL+实体解析归属到 ${affectedEids.length} 家企业（job#${ingest.jobId}）`,
      { jobId: ingest.jobId, rowsIn: ingest.rowsIn, rowsOut: ingest.rowsOut, rowsSkipped: ingest.rowsSkipped, resolutions: ingest.resolutions.map((r) => ({ kind: r.kind, eid: r.kind !== "unmatched" ? r.eid : null, confidence: r.confidence })) }, t);

    /* ── 2 Profile：画像字段核验 → ProfileUpdated ── */
    t = Date.now();
    assertNotBroken("Profile", 2);
    const profRows = affectedEids.length > 0 ? await db.select().from(enrichments).where(inArray(enrichments.eid, affectedEids)) : [];
    const filledFields = profRows.reduce((n, r) => n + ["uscc", "regCapital", "insured", "jobs", "patents", "softCopyrights"].filter((k) => (r as unknown as Record<string, unknown>)[k] != null).length, 0);
    record(2, "ProfileUpdated", "Profile", "EntityMerged", affectedEids,
      `${profRows.length} 家画像已装配，累计 ${filledFields} 个关键字段非空`,
      { profiles: profRows.map((r) => ({ eid: r.eid, uscc: r.uscc ? "有" : "无", insured: r.insured, jobs: r.jobs })) }, t);

    /* ── 3 Signal：信号装配核验 → SignalDetected ── */
    t = Date.now();
    assertNotBroken("Signal", 3);
    const entRows = affectedEids.length > 0 ? await db.select({ eid: entities.eid, signalsJson: entities.signalsJson }).from(entities).where(inArray(entities.eid, affectedEids)) : [];
    const signalCount = entRows.reduce((n, r) => { try { return n + (JSON.parse(r.signalsJson ?? "[]") as unknown[]).length; } catch { return n; } }, 0);
    record(3, "SignalDetected", "Signal", "ProfileUpdated", affectedEids,
      `${affectedEids.length} 家企业当前共 ${signalCount} 条活跃信号`,
      { perEntity: entRows.map((r) => { let c = 0; try { c = (JSON.parse(r.signalsJson ?? "[]") as unknown[]).length; } catch { /* noop */ } return { eid: r.eid, signals: c }; }) }, t);

    /* ── 4 Graph：企业节点在图核验（缺失自动播种）→ EdgeAsserted ── */
    t = Date.now();
    assertNotBroken("Graph", 4);
    let nodeRows = affectedEids.length > 0 ? await db.select({ nodeKey: graphNodes.nodeKey }).from(graphNodes).where(inArray(graphNodes.nodeKey, affectedEids)) : [];
    if (nodeRows.length < affectedEids.length) { await seedGraph(); nodeRows = await db.select({ nodeKey: graphNodes.nodeKey }).from(graphNodes).where(inArray(graphNodes.nodeKey, affectedEids)); }
    record(4, "EdgeAsserted", "Graph", "SignalDetected", affectedEids,
      `${nodeRows.length}/${affectedEids.length} 家企业节点已在关系图谱`,
      { inGraph: nodeRows.map((n) => n.nodeKey), missing: affectedEids.filter((e) => !nodeRows.some((n) => n.nodeKey === e)) }, t);

    /* ── 5 Score：12维评分复算 → ScoreComputed ── */
    t = Date.now();
    assertNotBroken("Score", 5);
    const all = await loadEntities();
    const rules = await loadRules();
    const scored = affectedEids.map((eid) => {
      const x = all.find((a) => a.eid === eid);
      if (!x) throw new PipelineStageError("Score", 5, `企业 ${eid} 在主数据中不存在——十段 park_eid 一致性被破坏`);
      const r = calcEntity(x, rules);
      return { eid, name: x.name, score: r.score, tier: r.tier };
    });
    record(5, "ScoreComputed", "Score", "EdgeAsserted", affectedEids,
      scored.map((s) => `${s.eid} → ${s.score}分/${s.tier}`).join("；") || "无企业需复算",
      { scored }, t);

    /* ── 6 Decision：决策生成（带 basedOn 溯源）→ DecisionProposed ── */
    t = Date.now();
    assertNotBroken("Decision", 6);
    const gen = await generateDecisions(`pipeline:${opts.triggeredBy}`);
    const decRows = affectedEids.length > 0 ? await db.select({ id: decisions.id, eid: decisions.eid, dtype: decisions.dtype, status: decisions.status }).from(decisions).where(inArray(decisions.eid, affectedEids)) : [];
    record(6, "DecisionProposed", "Decision", "ScoreComputed", affectedEids,
      `决策引擎新建 ${gen.created} 条（幂等跳过 ${gen.skipped}）；受影响企业现有决策 ${decRows.length} 条`,
      { created: gen.created, skipped: gen.skipped, decisionsForAffected: decRows.slice(0, 20) }, t);

    /* ── 7 Workflow：流程定义就绪 → WorkflowStarted ── */
    t = Date.now();
    assertNotBroken("Workflow", 7);
    await seedWorkflowDefs();
    const defs = await db.select({ id: workflowDefs.id, dtype: workflowDefs.decisionType }).from(workflowDefs);
    if (defs.length === 0) throw new PipelineStageError("Workflow", 7, "流程定义为空——workflowDefs 播种失败");
    record(7, "WorkflowStarted", "Workflow", "DecisionProposed", affectedEids,
      `${defs.length} 套 SLA 流程定义就绪；决策采纳后一键编排（人在环，不自动启动）`,
      { defs: defs.map((d) => d.dtype ?? "通用"), note: "宪法P4：流程启动由人显式触发，管道只保证编排就绪" }, t);

    /* ── 8 Agent：话术/建议产出（受 HITL 门禁）→ SuggestionProduced ── */
    t = Date.now();
    assertNotBroken("Agent", 8);
    const firstEid = affectedEids[0];
    let agentSummary = "无受影响企业，跳过建议产出";
    let agentDetail: Record<string, unknown> = {};
    if (firstEid) {
      // 管道内用低风险确定性工具（match_resources），不依赖 LLM 外呼；高风险动作留给人审
      const run = await runAgentTool("match_resources", { eid: firstEid, actor: `pipeline:${opts.triggeredBy}` });
      if (!run.ok && !run.requiresHuman) throw new PipelineStageError("Agent", 8, run.error ?? "Agent 工具执行失败");
      agentSummary = run.ok ? `Match Agent 已为 ${firstEid} 产出需求×资源匹配建议（对外触达需 HITL 人工确认）` : `Agent 被 HITL 门禁拦截（预期行为）`;
      agentDetail = { tool: "match_resources", eid: firstEid, ok: run.ok, requiresHuman: run.requiresHuman };
    }
    record(8, "SuggestionProduced", "Agent", "WorkflowStarted", affectedEids, agentSummary, agentDetail, t);

    /* ── 9 Outcome：结果回流核验 → OutcomeRecorded ── */
    t = Date.now();
    assertNotBroken("Outcome", 9);
    const doneRows = await db.select({ id: decisions.id, eid: decisions.eid, outcome: decisions.outcome }).from(decisions).where(eq(decisions.status, "done"));
    record(9, "OutcomeRecorded", "Outcome", "SuggestionProduced", affectedEids,
      `结果回流通道就绪：历史已结案决策 ${doneRows.length} 条（won ${doneRows.filter((d) => d.outcome === "won").length} / lost ${doneRows.filter((d) => d.outcome === "lost").length}）`,
      { doneCount: doneRows.length, note: "本段核验回流通道与历史样本；新决策结案时经 transitionDecision 强制回填 outcome" }, t);

    /* ── 10 Learning：学习样本回流核验 → ModelRecalibrated ── */
    t = Date.now();
    assertNotBroken("Learning", 10);
    const samples = await collectOutcomes();
    const models = await db.select({ id: scoreModels.id, role: scoreModels.role }).from(scoreModels);
    record(10, "ModelRecalibrated", "Learning", "OutcomeRecorded", affectedEids,
      `学习引擎可用样本 ${samples.length} 条；模型登记 ${models.length} 个（challenger 生成与晋升需人审，管道不自动改权重）`,
      { samples: samples.length, models: models.length, note: "宪法P4：ModelRecalibrated 指样本回流+引擎就绪；实际晋升走 champion-challenger 人审" }, t);

    /* 落台账（整条 run 一条记录，事件流入 afterJson） */
    await db.insert(opsLedger).values({
      action: "pipeline_run", targetEid: runId, actor: opts.triggeredBy,
      detail: `[Pipeline] ${opts.adapterId} 导入触发十段链：${affectedEids.join(",") || "无企业"}（${events.length}/10 段完成）`,
      afterJson: JSON.stringify({ runId, events }),
    });
    return { ok: true, runId, events, ingest };
  } catch (e) {
    const err = e instanceof PipelineStageError ? e : new PipelineStageError("Unknown", 0, e instanceof Error ? e.message : String(e));
    // 断链留痕：显式失败，不静默
    await db.insert(opsLedger).values({
      action: "pipeline_run_failed", targetEid: runId, actor: opts.triggeredBy,
      detail: `[Pipeline] 第${err.seq}段 ${err.stage} 失败中止：${err.message}`,
      afterJson: JSON.stringify({ runId, events, failed: { seq: err.seq, stage: err.stage, error: err.message } }),
    });
    return { ok: false, runId, events, failedStage: { seq: err.seq, stage: err.stage, error: err.message }, ingest };
  }
}

/* ---------- 查询：最近的 pipeline 运行事件流（前端串联视图） ---------- */
export async function listPipelineRuns(limit = 10): Promise<Array<{ runId: string; ok: boolean; at: Date | null; actor: string | null; events: PipelineEvent[]; failed?: { seq: number; stage: string; error: string } }>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(opsLedger).where(inArray(opsLedger.action, ["pipeline_run", "pipeline_run_failed"]));
  return rows.slice(-limit).reverse().map((r) => {
    let payload: { runId?: string; events?: PipelineEvent[]; failed?: { seq: number; stage: string; error: string } } = {};
    try { payload = JSON.parse(r.afterJson ?? "{}"); } catch { /* noop */ }
    return { runId: payload.runId ?? r.targetEid ?? "", ok: r.action === "pipeline_run", at: r.createdAt, actor: r.actor, events: payload.events ?? [], failed: payload.failed };
  });
}
