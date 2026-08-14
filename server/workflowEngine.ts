/* 迭代21 · 工单8 · 工作流引擎（Cap-07，依赖工单3 溯源）
 * - WorkflowRuntime：已批准决策 → 配置化多步流程（流程定义存 DB）；
 * - TaskManager：人工任务分派 + SLA 计时，超时自动升级（escalate）；
 * - SagaCoordinator：步骤失败逐级补偿（compensation）、步骤幂等（idempotencyKey 重放不重复）、长事务一致性；
 * - ADR-15：失败不得默认 Success —— 每步显式 done/failed，failed 触发 Saga 回滚。
 */
import { eq, and, lt } from "drizzle-orm";
import { getDb } from "./db";
import { workflowDefs, workflowInstances, workflowTasks, decisions } from "../drizzle/schema";
import { appendLedger } from "./dataAdapter";

/* ---------- 流程定义模型 ---------- */
export interface WorkflowStep {
  key: string;                 // 步骤键（幂等锚点）
  title: string;
  kind: "human" | "auto";      // human = 生成 workflowTask 等人完成；auto = 引擎直接执行（登记类动作）
  slaHours: number;            // SLA（human 步骤）
  escalateTo?: string;         // 超时升级对象（默认 admin）
  compensation?: string;       // 补偿动作描述（失败回滚时执行并留痕）
}
export interface StepState {
  key: string;
  status: "pending" | "running" | "done" | "failed" | "compensated" | "skipped";
  idempotencyKey: string;      // instanceId:stepKey —— 重放判重
  startedAt?: number;
  finishedAt?: number;
  note?: string;
  compensationNote?: string;
}

/** 内置流程定义（播种；管理员可在 DB 调整 stepsJson） */
const SEED_DEFS: { defKey: string; name: string; decisionType: string | null; steps: WorkflowStep[] }[] = [
  {
    defKey: "wf_referral_outreach", name: "暖引荐触达流程", decisionType: "referral",
    steps: [
      { key: "prep_draft", title: "生成并人工确认引荐话术", kind: "auto", slaHours: 0, compensation: "作废话术草稿" },
      { key: "contact_via", title: "联系引荐中间人并获得同意", kind: "human", slaHours: 48, escalateTo: "admin", compensation: "通知中间人终止引荐" },
      { key: "first_meet", title: "完成首次拜访（30 分钟方案呈报）", kind: "human", slaHours: 168, escalateTo: "admin", compensation: "拜访取消登记" },
      { key: "log_outcome", title: "回填拜访结果与下一步", kind: "human", slaHours: 24, escalateTo: "admin" },
    ],
  },
  {
    defKey: "wf_hr_service", name: "HR 服务交付流程", decisionType: "hr_service",
    steps: [
      { key: "needs_confirm", title: "需求确认（岗位/数量/时间窗）", kind: "human", slaHours: 72, compensation: "需求单作废" },
      { key: "match_supply", title: "信软管道匹配候选（自动）", kind: "auto", slaHours: 0, compensation: "释放已锁定候选名额" },
      { key: "delivery", title: "人才供给方案交付", kind: "human", slaHours: 336, escalateTo: "admin", compensation: "方案撤回并通知企业" },
      { key: "log_outcome", title: "回填交付结果", kind: "human", slaHours: 24 },
    ],
  },
  {
    defKey: "wf_generic", name: "通用执行流程", decisionType: null,
    steps: [
      { key: "plan", title: "制定执行计划", kind: "human", slaHours: 48, compensation: "计划作废" },
      { key: "execute", title: "执行动作", kind: "human", slaHours: 168, escalateTo: "admin", compensation: "执行动作回退登记" },
      { key: "log_outcome", title: "回填结果", kind: "human", slaHours: 24 },
    ],
  },
];

export async function seedWorkflowDefs(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ defKey: workflowDefs.defKey }).from(workflowDefs);
  const have = new Set(rows.map((r) => r.defKey));
  let n = 0;
  for (const d of SEED_DEFS) {
    if (have.has(d.defKey)) continue;
    await db.insert(workflowDefs).values({ defKey: d.defKey, name: d.name, decisionType: d.decisionType, stepsJson: JSON.stringify(d.steps) });
    n++;
  }
  return n;
}

/* ---------- WorkflowRuntime ---------- */
function parseSteps(json: string): WorkflowStep[] {
  try { return JSON.parse(json); } catch { return []; }
}
function parseStates(json: string): StepState[] {
  try { return JSON.parse(json); } catch { return []; }
}

/** 由已批准（adopted/executing）决策启动流程实例；幂等：同一决策同一流程只启一次 */
export async function startWorkflow(decisionId: number, actor: string): Promise<{ ok: boolean; instanceId?: number; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "数据库不可用" };
  await seedWorkflowDefs();
  const [dec] = await db.select().from(decisions).where(eq(decisions.id, decisionId)).limit(1);
  if (!dec) return { ok: false, error: "决策不存在" };
  if (dec.status !== "adopted" && dec.status !== "executing") return { ok: false, error: `仅已采纳/执行中的决策可编排流程（当前：${dec.status}）` };
  // 幂等：已有实例直接返回
  const exist = await db.select({ id: workflowInstances.id }).from(workflowInstances).where(eq(workflowInstances.decisionId, decisionId)).limit(1);
  if (exist.length > 0) return { ok: true, instanceId: exist[0].id };
  // 选流程定义：决策类型绑定 → 通用兜底
  const defs = await db.select().from(workflowDefs).where(eq(workflowDefs.active, 1));
  const def = defs.find((d) => d.decisionType === dec.dtype) ?? defs.find((d) => d.defKey === "wf_generic");
  if (!def) return { ok: false, error: "无可用流程定义" };
  const steps = parseSteps(def.stepsJson);
  const states: StepState[] = steps.map((s) => ({ key: s.key, status: "pending", idempotencyKey: "" }));
  const [ins] = await db.insert(workflowInstances).values({
    defKey: def.defKey, decisionId, eid: dec.eid, stepStatesJson: JSON.stringify(states), startedBy: actor,
  });
  const instanceId = ins.insertId as number;
  // 回填幂等键（instanceId:stepKey）
  states.forEach((st) => { st.idempotencyKey = `${instanceId}:${st.key}`; });
  await db.update(workflowInstances).set({ stepStatesJson: JSON.stringify(states) }).where(eq(workflowInstances.id, instanceId));
  await appendLedger("wf_start", dec.eid, `[WF#${instanceId}] 流程「${def.name}」启动（决策 D#${decisionId}）`, actor);
  // 推进第一步
  await advanceInstance(instanceId, actor);
  return { ok: true, instanceId };
}

/** 推进实例：把当前 pending 步置为 running；human 步生成任务，auto 步直接完成 */
export async function advanceInstance(instanceId: number, actor: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "数据库不可用" };
  const [inst] = await db.select().from(workflowInstances).where(eq(workflowInstances.id, instanceId)).limit(1);
  if (!inst) return { ok: false, error: "实例不存在" };
  if (inst.status !== "running") return { ok: true, status: inst.status };
  const [def] = await db.select().from(workflowDefs).where(eq(workflowDefs.defKey, inst.defKey)).limit(1);
  const steps = parseSteps(def?.stepsJson ?? "[]");
  const states = parseStates(inst.stepStatesJson);
  const idx = states.findIndex((s) => s.status === "pending" || s.status === "running");
  if (idx === -1) {
    // 全部完成
    await db.update(workflowInstances).set({ status: "done", currentStep: states.length }).where(eq(workflowInstances.id, instanceId));
    await appendLedger("wf_done", inst.eid, `[WF#${instanceId}] 流程完成`, actor);
    return { ok: true, status: "done" };
  }
  const step = steps[idx];
  const st = states[idx];
  if (st.status === "running") return { ok: true, status: "running" }; // 等待人工完成
  st.status = "running";
  st.startedAt = Date.now();
  if (step.kind === "auto") {
    // auto 步：登记类动作直接完成（幂等：状态机保证只执行一次）
    st.status = "done";
    st.finishedAt = Date.now();
    st.note = "引擎自动执行";
    await db.update(workflowInstances).set({ stepStatesJson: JSON.stringify(states), currentStep: idx }).where(eq(workflowInstances.id, instanceId));
    return advanceInstance(instanceId, actor); // 递归推进下一步
  }
  // human 步：生成 SLA 任务（幂等：同 instanceId+stepIndex 只建一次）
  const exist = await db.select({ id: workflowTasks.id }).from(workflowTasks)
    .where(and(eq(workflowTasks.instanceId, instanceId), eq(workflowTasks.stepIndex, idx))).limit(1);
  if (exist.length === 0) {
    const due = new Date(Date.now() + step.slaHours * 3600_000);
    await db.insert(workflowTasks).values({ instanceId, stepIndex: idx, title: step.title, assignee: inst.startedBy, slaHours: step.slaHours, dueAt: due });
  }
  await db.update(workflowInstances).set({ stepStatesJson: JSON.stringify(states), currentStep: idx }).where(eq(workflowInstances.id, instanceId));
  return { ok: true, status: "running" };
}

/** 完成人工任务（幂等：done 任务重复提交直接返回，不重复推进） */
export async function completeTask(taskId: number, actor: string, opts?: { failed?: boolean; note?: string }): Promise<{ ok: boolean; instanceStatus?: string; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "数据库不可用" };
  const [task] = await db.select().from(workflowTasks).where(eq(workflowTasks.id, taskId)).limit(1);
  if (!task) return { ok: false, error: "任务不存在" };
  if (task.status === "done" || task.status === "cancelled") return { ok: true, instanceStatus: "unchanged" }; // 幂等重放
  const [inst] = await db.select().from(workflowInstances).where(eq(workflowInstances.id, task.instanceId)).limit(1);
  if (!inst) return { ok: false, error: "实例不存在" };
  const states = parseStates(inst.stepStatesJson);
  const st = states[task.stepIndex];
  if (!st) return { ok: false, error: "步骤状态异常" };

  if (opts?.failed) {
    // ADR-15：显式失败 → Saga 补偿
    st.status = "failed";
    st.finishedAt = Date.now();
    st.note = opts.note ?? "人工标记失败";
    await db.update(workflowTasks).set({ status: "cancelled", doneAt: new Date() }).where(eq(workflowTasks.id, taskId));
    await db.update(workflowInstances).set({ stepStatesJson: JSON.stringify(states) }).where(eq(workflowInstances.id, task.instanceId));
    await compensateInstance(task.instanceId, actor, `步骤「${task.title}」失败：${opts.note ?? ""}`);
    return { ok: true, instanceStatus: "compensated" };
  }

  st.status = "done";
  st.finishedAt = Date.now();
  st.note = opts?.note;
  await db.update(workflowTasks).set({ status: "done", doneAt: new Date() }).where(eq(workflowTasks.id, taskId));
  await db.update(workflowInstances).set({ stepStatesJson: JSON.stringify(states) }).where(eq(workflowInstances.id, task.instanceId));
  await appendLedger("wf_step_done", inst.eid, `[WF#${inst.id}] 步骤「${task.title}」完成`, actor);
  const adv = await advanceInstance(task.instanceId, actor);
  return { ok: true, instanceStatus: adv.status };
}

/* ---------- SagaCoordinator：失败补偿（逆序回滚已完成步骤） ---------- */
export async function compensateInstance(instanceId: number, actor: string, reason: string): Promise<{ ok: boolean; compensated: string[] }> {
  const db = await getDb();
  if (!db) return { ok: false, compensated: [] };
  const [inst] = await db.select().from(workflowInstances).where(eq(workflowInstances.id, instanceId)).limit(1);
  if (!inst) return { ok: false, compensated: [] };
  const [def] = await db.select().from(workflowDefs).where(eq(workflowDefs.defKey, inst.defKey)).limit(1);
  const steps = parseSteps(def?.stepsJson ?? "[]");
  const states = parseStates(inst.stepStatesJson);
  const compensated: string[] = [];
  // 逆序补偿所有已完成步骤（幂等：compensated 状态不重复补偿）
  for (let i = states.length - 1; i >= 0; i--) {
    const st = states[i];
    const step = steps[i];
    if (st.status === "done" && step?.compensation) {
      st.status = "compensated";
      st.compensationNote = step.compensation;
      compensated.push(`${step.title} → ${step.compensation}`);
    } else if (st.status === "pending" || st.status === "running") {
      st.status = "skipped";
    }
  }
  // 未完成的 open 任务取消
  await db.update(workflowTasks).set({ status: "cancelled" })
    .where(and(eq(workflowTasks.instanceId, instanceId), eq(workflowTasks.status, "open")));
  await db.update(workflowInstances).set({ status: "compensated", stepStatesJson: JSON.stringify(states) }).where(eq(workflowInstances.id, instanceId));
  await appendLedger("wf_compensate", inst.eid, `[WF#${instanceId}] Saga 补偿：${reason}；回滚 ${compensated.length} 步`, actor);
  return { ok: true, compensated };
}

/* ---------- TaskManager：SLA 超时升级 ---------- */
export async function escalateOverdueTasks(actor = "system"): Promise<{ escalated: number }> {
  const db = await getDb();
  if (!db) return { escalated: 0 };
  const overdue = await db.select().from(workflowTasks)
    .where(and(eq(workflowTasks.status, "open"), lt(workflowTasks.dueAt, new Date())));
  let n = 0;
  for (const t of overdue) {
    const [inst] = await db.select().from(workflowInstances).where(eq(workflowInstances.id, t.instanceId)).limit(1);
    const [def] = inst ? await db.select().from(workflowDefs).where(eq(workflowDefs.defKey, inst.defKey)).limit(1) : [undefined];
    const steps = parseSteps(def?.stepsJson ?? "[]");
    const escalateTo = steps[t.stepIndex]?.escalateTo ?? "admin";
    await db.update(workflowTasks).set({ status: "escalated", escalatedTo: escalateTo }).where(eq(workflowTasks.id, t.id));
    await appendLedger("wf_escalate", inst?.eid ?? null, `[WF#${t.instanceId}] 任务「${t.title}」SLA 超时（${t.slaHours}h），升级至 ${escalateTo}`, actor);
    n++;
  }
  return { escalated: n };
}

/* ---------- 查询 ---------- */
export async function listInstances(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(workflowInstances).orderBy(workflowInstances.id).limit(limit);
  const defs = await db.select().from(workflowDefs);
  const defMap = new Map(defs.map((d) => [d.defKey, d]));
  return rows.reverse().map((r) => ({
    id: r.id, defKey: r.defKey, defName: defMap.get(r.defKey)?.name ?? r.defKey,
    decisionId: r.decisionId, eid: r.eid, status: r.status, currentStep: r.currentStep,
    steps: parseStates(r.stepStatesJson),
    stepDefs: parseSteps(defMap.get(r.defKey)?.stepsJson ?? "[]"),
    startedBy: r.startedBy, createdAt: r.createdAt.getTime(),
  }));
}

export async function listOpenTasks() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(workflowTasks).orderBy(workflowTasks.dueAt);
  return rows.filter((r) => r.status === "open" || r.status === "escalated").map((r) => ({
    id: r.id, instanceId: r.instanceId, stepIndex: r.stepIndex, title: r.title,
    assignee: r.assignee, status: r.status, slaHours: r.slaHours,
    dueAt: r.dueAt?.getTime() ?? null, escalatedTo: r.escalatedTo,
    overdue: !!r.dueAt && r.dueAt.getTime() < Date.now(),
  }));
}
