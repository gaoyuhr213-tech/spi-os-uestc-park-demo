/* 迭代23 · 工单12 · 一键演示种子（demoSeed）
 *
 * 目标：一条命令/一次点击，把「一家真实企业」的全链数据灌入系统并触发十段 Pipeline，
 * 让演示者 10 秒讲清「决策为什么产生」。
 *
 * 选定企业：成都眸视科技有限公司（E703，园区真实入驻主体）
 * 数据口径：全部来自公开渠道（国家企业信用信息公示系统/园区楼层索引/公开招聘页），
 *          对外演示时敏感字段（法定代表人/联系人）经 authz 分级脱敏输出——种子本身不落 PII 明文。
 *
 * 可重复运行（幂等）：
 * - 每次运行先清理上一次演示的残留（demo-seed actor 标记的 ingestionJobs/opsLedger）
 * - 摄入走 ACL 唯一通道 → 实体解析归属到既有 E703（不新建重复主体）
 * - 触发 runPipeline 十段链，返回 runId + 事件流 + 每段一句话结论
 */
import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { ingestionJobs, opsLedger } from "../drizzle/schema";
import { runPipeline, type PipelineRunResult } from "./pipelineOrchestrator";
import type { RawExternalRecord } from "./aclTransform";

export const DEMO_ACTOR = "demo-seed";
export const DEMO_EID = "E703";
export const DEMO_COMPANY = "成都眸视科技有限公司";

/* 公开工商信息（国家企业信用信息公示系统口径，演示数据集） */
const DEMO_BIZ_ROWS: RawExternalRecord[] = [
  {
    "企业名称": "成都眸视科技有限公司",
    "统一社会信用代码": "91510100MA6CDT9X0F",
    "注册资本": "500万元",
    "成立年份": "2017",
    "参保人数": "38",
    "高企资质": "是",
  },
];

/* 公开招聘信息（招聘平台公开页口径，演示数据集） */
const DEMO_JOB_ROWS: RawExternalRecord[] = [
  {
    "企业名称": "成都眸视科技有限公司",
    "在招岗位数": "12",
    "核心岗位": "机器人算法工程师/嵌入式软件工程师/计算机视觉工程师",
    "薪资范围": "15-30K",
  },
];

export interface DemoSeedResult {
  ok: boolean;
  company: string;
  eid: string;
  cleaned: { jobs: number; ledger: number };
  runs: Array<{ adapterId: string; runId: string; ok: boolean; stages: number; failedStage?: string }>;
  pipeline: PipelineRunResult | null; // 最后一次（招聘源）完整事件流，供 DemoMode 引导展示
  story: Array<{ seq: number; stage: string; conclusion: string }>; // 每段一句话结论
}

/** 清理上次演示残留（幂等前提） */
async function cleanPreviousDemo(): Promise<{ jobs: number; ledger: number }> {
  const db = await getDb();
  if (!db) return { jobs: 0, ledger: 0 };
  const oldJobs = await db.select({ id: ingestionJobs.id }).from(ingestionJobs).where(eq(ingestionJobs.triggeredBy, DEMO_ACTOR));
  if (oldJobs.length > 0) await db.delete(ingestionJobs).where(inArray(ingestionJobs.id, oldJobs.map((j) => j.id)));
  const oldLedger = await db.select({ id: opsLedger.id }).from(opsLedger).where(eq(opsLedger.actor, DEMO_ACTOR));
  if (oldLedger.length > 0) await db.delete(opsLedger).where(inArray(opsLedger.id, oldLedger.map((l) => l.id)));
  return { jobs: oldJobs.length, ledger: oldLedger.length };
}

/** 一键演示：清理旧痕 → 工商源+招聘源两次摄入 → 十段链 → 输出分步结论 */
export async function runDemoSeed(): Promise<DemoSeedResult> {
  const cleaned = await cleanPreviousDemo();
  const runs: DemoSeedResult["runs"] = [];

  // 1) 工商登记源（画像基础字段）
  const bizRun = await runPipeline({ adapterId: "biz-registry", rawRows: DEMO_BIZ_ROWS, triggeredBy: DEMO_ACTOR });
  runs.push({ adapterId: "biz-registry", runId: bizRun.runId, ok: bizRun.ok, stages: bizRun.events.length, failedStage: bizRun.failedStage?.stage });

  // 2) 招聘源（需求信号触发源）——最后一跑，其事件流作为演示主线
  const jobRun = await runPipeline({ adapterId: "job-board", rawRows: DEMO_JOB_ROWS, triggeredBy: DEMO_ACTOR });
  runs.push({ adapterId: "job-board", runId: jobRun.runId, ok: jobRun.ok, stages: jobRun.events.length, failedStage: jobRun.failedStage?.stage });

  const ok = bizRun.ok && jobRun.ok;
  const story = jobRun.events.map((e) => ({ seq: e.seq, stage: e.stage, conclusion: e.summary }));

  return { ok, company: DEMO_COMPANY, eid: DEMO_EID, cleaned, runs, pipeline: ok ? jobRun : jobRun, story };
}
