/* 迭代23 · 工单10 · 端到端 Decision Pipeline 集成测试
 * 验收对齐：
 * 1) 一次导入触发十段链，每段事件可见（EntityMerged→…→ModelRecalibrated）
 * 2) 集成测试全绿
 * 3) 人为断开 Score 段 → 显式报错中止（不静默 Success）
 * 4) 同一企业 park_eid 在十段中一致可追溯
 */
import { describe, expect, it, afterAll } from "vitest";
import { runPipeline, listPipelineRuns, STAGE_BREAKER, type PipelineEventName } from "./pipelineOrchestrator";
import { getDb } from "./db";
import { opsLedger } from "../drizzle/schema";
import { inArray, like } from "drizzle-orm";

const TRIGGER = "it23-pipeline-test";

/* E703（成都眸视科技）真实存在于主数据：用它保证解析可归属 */
const CSV = [
  "企业名称,统一社会信用代码,注册资本,成立日期,参保人数",
  "成都眸视科技有限公司,91510100MA6CDT9X0F,500万元,2018-06-12,45",
].join("\n");

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const cells = l.split(",");
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (cells[i] ?? "").trim()]));
  });
}

const EXPECTED: PipelineEventName[] = [
  "EntityMerged", "ProfileUpdated", "SignalDetected", "EdgeAsserted", "ScoreComputed",
  "DecisionProposed", "WorkflowStarted", "SuggestionProduced", "OutcomeRecorded", "ModelRecalibrated",
];

describe("工单10 · 十段 Pipeline 集成", () => {
  it("验收1+2：一次导入触发十段，每段事件可见且顺序正确", async () => {
    STAGE_BREAKER.broken.clear();
    const r = await runPipeline({ adapterId: "biz-registry", rawRows: parseCsv(CSV), triggeredBy: TRIGGER });
    expect(r.ok).toBe(true);
    expect(r.events).toHaveLength(10);
    expect(r.events.map((e) => e.name)).toEqual(EXPECTED);
    // 每段声明上下游
    expect(r.events[0].upstream).toBeNull();
    for (let i = 1; i < 10; i++) expect(r.events[i].upstream).toBe(EXPECTED[i - 1]);
    // 每段有一句话结论与耗时
    for (const e of r.events) {
      expect(e.summary.length).toBeGreaterThan(0);
      expect(e.ms).toBeGreaterThanOrEqual(0);
    }
  }, 60_000);

  it("验收4：park_eid 在十段中一致（E703 贯穿）", async () => {
    STAGE_BREAKER.broken.clear();
    const r = await runPipeline({ adapterId: "biz-registry", rawRows: parseCsv(CSV), triggeredBy: TRIGGER });
    expect(r.ok).toBe(true);
    for (const e of r.events) {
      expect(e.eids).toContain("E703");
    }
  }, 60_000);

  it("验收3：人为断开 Score 段 → 显式报错中止，不静默", async () => {
    STAGE_BREAKER.broken.add("Score");
    const r = await runPipeline({ adapterId: "biz-registry", rawRows: parseCsv(CSV), triggeredBy: TRIGGER });
    STAGE_BREAKER.broken.clear();
    expect(r.ok).toBe(false);
    expect(r.failedStage).toBeDefined();
    expect(r.failedStage!.stage).toBe("Score");
    expect(r.failedStage!.seq).toBe(5);
    expect(r.failedStage!.error).toContain("显式报错");
    // 断链前的段有事件，断链后没有
    expect(r.events).toHaveLength(4);
    expect(r.events.map((e) => e.name)).toEqual(EXPECTED.slice(0, 4));
  }, 60_000);

  it("事件流落台账可查（listPipelineRuns），失败 run 标记 ok=false", async () => {
    const runs = await listPipelineRuns(10);
    expect(runs.length).toBeGreaterThan(0);
    const okRun = runs.find((r) => r.ok && r.events.length === 10);
    expect(okRun).toBeDefined();
    const failRun = runs.find((r) => !r.ok);
    expect(failRun).toBeDefined();
    expect(failRun!.failed?.stage).toBe("Score");
  }, 30_000);
});

afterAll(async () => {
  // 清理本测试产生的 pipeline 台账，防脏数据堆积（保留生产 run）
  const db = await getDb();
  if (!db) return;
  const rows = await db.select({ id: opsLedger.id, actor: opsLedger.actor }).from(opsLedger)
    .where(inArray(opsLedger.action, ["pipeline_run", "pipeline_run_failed"]));
  const mine = rows.filter((r) => r.actor === TRIGGER).map((r) => r.id);
  if (mine.length > 0) {
    const { inArray: inArr } = await import("drizzle-orm");
    await db.delete(opsLedger).where(inArr(opsLedger.id, mine));
  }
});
