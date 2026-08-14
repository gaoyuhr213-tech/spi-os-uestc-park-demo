/* 迭代21 · 工单8 · 工作流引擎测试
 * 验收：决策可编排为带 SLA 多步流程；超时升级；失败触发补偿；步骤幂等（重放不重复）
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, like } from "drizzle-orm";
import { getDb } from "./db";
import { decisions, workflowInstances, workflowTasks, workflowDefs, opsLedger } from "../drizzle/schema";
import {
  seedWorkflowDefs, startWorkflow, completeTask, compensateInstance,
  escalateOverdueTasks, listInstances, listOpenTasks,
} from "./workflowEngine";

const T_EID = "E_WF21T";
let decisionId = 0;
let instanceId = 0;

beforeAll(async () => {
  const db = await getDb();
  if (!db) throw new Error("db unavailable");
  // 造一条已采纳的 referral 决策（触发 wf_referral_outreach）
  const [ins] = await db.insert(decisions).values({
    eid: T_EID, dtype: "referral", title: "迭代21测试决策", reason: "test", stars: 4,
    status: "adopted", genKey: `wf21test:${Date.now()}`,
  });
  decisionId = ins.insertId as number;
});

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  // 清理测试数据（防脏数据堆积）
  if (instanceId) {
    await db.delete(workflowTasks).where(eq(workflowTasks.instanceId, instanceId));
    await db.delete(workflowInstances).where(eq(workflowInstances.id, instanceId));
  }
  if (decisionId) await db.delete(decisions).where(eq(decisions.id, decisionId));
  await db.delete(opsLedger).where(like(opsLedger.detail, "%迭代21测试%"));
});

describe("工单8 · WorkflowRuntime", () => {
  it("流程定义播种幂等", async () => {
    await seedWorkflowDefs();
    const again = await seedWorkflowDefs();
    expect(again).toBe(0); // 第二次播种不重复
    const db = await getDb();
    const defs = await db!.select().from(workflowDefs);
    expect(defs.map((d) => d.defKey)).toContain("wf_referral_outreach");
    expect(defs.map((d) => d.defKey)).toContain("wf_generic");
  });

  it("已采纳决策启动流程；同决策幂等只启一次", async () => {
    const r1 = await startWorkflow(decisionId, "wf21-test");
    expect(r1.ok).toBe(true);
    expect(r1.instanceId).toBeGreaterThan(0);
    instanceId = r1.instanceId!;
    const r2 = await startWorkflow(decisionId, "wf21-test");
    expect(r2.ok).toBe(true);
    expect(r2.instanceId).toBe(instanceId); // 幂等：返回同一实例
  });

  it("auto 步自动完成，human 步生成 SLA 任务", async () => {
    const list = await listInstances(200);
    const inst = list.find((i) => i.id === instanceId)!;
    expect(inst).toBeTruthy();
    expect(inst.steps[0].status).toBe("done"); // prep_draft 是 auto 步
    expect(inst.steps[1].status).toBe("running"); // contact_via human 步等待
    const db = await getDb();
    const tasks = await db!.select().from(workflowTasks).where(eq(workflowTasks.instanceId, instanceId));
    expect(tasks.length).toBe(1);
    expect(tasks[0].slaHours).toBe(48);
    expect(tasks[0].dueAt).toBeTruthy();
  });

  it("完成任务推进流程；done 任务重放幂等不重复", async () => {
    const db = await getDb();
    const [task] = await db!.select().from(workflowTasks).where(eq(workflowTasks.instanceId, instanceId));
    const r1 = await completeTask(task.id, "wf21-test", { note: "迭代21测试完成" });
    expect(r1.ok).toBe(true);
    const r2 = await completeTask(task.id, "wf21-test"); // 重放
    expect(r2.ok).toBe(true);
    expect(r2.instanceStatus).toBe("unchanged"); // 幂等：不重复推进
    // 推进后应出现下一步任务（first_meet）
    const tasks = await db!.select().from(workflowTasks).where(eq(workflowTasks.instanceId, instanceId));
    expect(tasks.length).toBe(2);
  });

  it("失败步骤触发 Saga 补偿：已完成步骤逆序回滚，open 任务取消", async () => {
    const db = await getDb();
    const tasks = await db!.select().from(workflowTasks).where(eq(workflowTasks.instanceId, instanceId));
    const open = tasks.find((t) => t.status === "open")!;
    const r = await completeTask(open.id, "wf21-test", { failed: true, note: "迭代21测试失败补偿" });
    expect(r.ok).toBe(true);
    expect(r.instanceStatus).toBe("compensated");
    const [inst] = await db!.select().from(workflowInstances).where(eq(workflowInstances.id, instanceId));
    expect(inst.status).toBe("compensated");
    const states = JSON.parse(inst.stepStatesJson) as { status: string; compensationNote?: string }[];
    // 已完成且有补偿动作的步骤 → compensated
    expect(states.filter((s) => s.status === "compensated").length).toBeGreaterThan(0);
    expect(states.some((s) => s.compensationNote)).toBe(true);
    // 台账留痕
    const ledger = await db!.select().from(opsLedger).where(eq(opsLedger.action, "wf_compensate"));
    expect(ledger.length).toBeGreaterThan(0);
  });

  it("SLA 超时任务自动升级", async () => {
    const db = await getDb();
    // 造一个已超时的 open 任务
    const [ins] = await db!.insert(workflowTasks).values({
      instanceId, stepIndex: 99, title: "迭代21测试超时任务", slaHours: 1,
      dueAt: new Date(Date.now() - 3600_000), status: "open",
    });
    const taskId = ins.insertId as number;
    const r = await escalateOverdueTasks("wf21-test");
    expect(r.escalated).toBeGreaterThanOrEqual(1);
    const [t] = await db!.select().from(workflowTasks).where(eq(workflowTasks.id, taskId));
    expect(t.status).toBe("escalated");
    expect(t.escalatedTo).toBeTruthy();
    await db!.delete(workflowTasks).where(eq(workflowTasks.id, taskId));
  });

  it("listOpenTasks 输出超时标记", async () => {
    const tasks = await listOpenTasks();
    expect(Array.isArray(tasks)).toBe(true);
    for (const t of tasks) {
      expect(typeof t.overdue).toBe("boolean");
    }
  });

  it("compensateInstance 幂等：已补偿实例重复补偿不报错", async () => {
    const r = await compensateInstance(instanceId, "wf21-test", "迭代21测试重复补偿");
    expect(r.ok).toBe(true);
    expect(r.compensated.length).toBe(0); // 已补偿步骤不重复补偿
  });
});
