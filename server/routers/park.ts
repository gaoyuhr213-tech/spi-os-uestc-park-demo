/* park 路由：所有业务计算由后端输出，前端仅渲染。
   - snapshot: 全量快照（KPI/线索列表/漏斗），支持脱敏开关（公开只读）
   - tasks: 触达任务清单（本周应触达/应复访，后端规则推演）
   - pitch: 双版话术（正式/轻量），模板不下发前端
   - importEnrichment: 情报导入（登录用户）
   - lifecycle.mark: 状态标记（登录用户）
   - rules.*: 规则中心（管理员）
   - admin.seedDb: 种子灌库（管理员） */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import {
  appendLedger, appendLifecycleEvent, buildExplainForEid, buildSnapshot, findEntityByName, loadEntities,
  buildTimelineForEid,
  buildWeeklyReview, loadLatestStageEvents, loadLatestStages, loadLedger, loadLifecycleHistory, loadRuleVersions, loadRules,
  loadWeekCompletions, loadWeekStageMoves, markTaskDone, resetRuleConfig, saveRuleConfig,
  seedDatabase, unmarkTaskDone, upsertEnrichment,
} from "../dataAdapter";
import { askAssistant } from "../aiAssistant";
import { listConnectors } from "../connectors";
import { listConnectorRegistry, listIngestionJobs } from "../connectors";
import { ingestViaAcl, parseCsvText, type AdapterId } from "../aclTransform";
import { scanExistingDuplicates, listDisambiguationQueue, decideMerge, matchEntity as resolveMatchEntity } from "../entityResolution";
import { predictDemand } from "../demandPredict";
import { buildFlywheel } from "../flywheel";
import { findReferralChains, loadGraph, seedGraph } from "../graphData";
import { matchEntity, parseIntelBatch, parseIntelText } from "../intelParser";
import { buildFieldSources, listParseHistory, recordParseHistory } from "../parseHistory";
import { buildShareCard } from "../shareCard";
import {
  buildDecisionFeed, buildDecisionRoi, buildEntityDecisionProfile, generateDecisions, transitionDecision,
  buildResourceUsage, buildMonthlyReport,
} from "../decisionEngine";
import { buildDecisionCard9, buildDecisionHealth } from "../decisionEngine2";
import { buildScenarioBoard, buildScenarioWorkspace } from "../scenarioEngine";
import { simulateAttract, simulatePolicy, simulateResource, whatIfEntity } from "../graphCompute";
import { searchMemory, memoryStats } from "../memoryEngine";
import { buildAgentBoard } from "../agentRegistry";
import { MARKET_CATALOG } from "../marketplace";
import { createResource, listResources, toggleResource, updateResource } from "../resourceMatch";
import { currentTenant, DEFAULT_TENANT } from "../tenantContext";
import { findScoredPaths, detectCommunities, findSimilarEntities, buildP0ReferralCoverage } from "../graphIntel";
import { runAgentTool, TOOL_REGISTRY } from "../agentRuntime";
import { detectInjection } from "../llmGateway";
import { runPipeline, listPipelineRuns } from "../pipelineOrchestrator";
import { runDemoSeed } from "../demoSeed";
import { traceSignalProvenance } from "../provenanceTrace";
import { runBackfill, externalConnectorStatus } from "../connectors/backfillOrchestrator";
import { buildHealth, buildMetrics, queryAuditLog } from "../observability";
import { buildAttribution } from "../attribution";
import { provisionPark } from "../parkProvision";
import { buildQualityMetrics, listQuarantine } from "../dataQuality";
import { trackEvent, buildOperationalMetrics, compareBaseline, type EventType } from "../analytics";
import { previewIngestion, commitIngestion, rollbackBatch, listBatches } from "../ingestionService";
import { listEvidenceByEntity, listEvidenceByField, verifyEvidence, rejectEvidence } from "../evidenceService";
import { listOpenConflicts, resolveConflict } from "../conflictService";
import { listSources } from "../sourceService";
import { listTestRuns, cleanupTestRun, getEnvironmentStats } from "../loadTestCleanup";
import { recomputeByBatch } from "../changeImpactService";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import {
  DEFAULT_RULES, STAGES, buildPitch, buildTaskList, calcEntity, calcFunnel,
  calcRuleImpact, isoWeekKey, type RuleSet,
} from "../ruleEngine";

const stageEnum = z.enum(STAGES);
const taskTypeEnum = z.enum(["首触", "复访", "培育跟进"]);

/** 规则中心提交的可编辑片段（saveScoring/saveTiering 复用 + 影响预览复用） */
const scoringInput = z.object({
  dims: z.array(z.object({ name: z.string(), weight: z.number().min(0).max(100) })).length(12)
    .refine((d) => Math.abs(d.reduce((s, x) => s + x.weight, 0) - 100) < 0.01, { message: "12维权重之和必须等于100" }),
  enrichBoost: z.object({
    jobsHigh: z.number().min(1).max(100), jobsHighBonus: z.number().min(0).max(20),
    jobsMid: z.number().min(1).max(100), jobsMidBonus: z.number().min(0).max(20),
    patentsHigh: z.number().min(1).max(500), patentsBonus: z.number().min(0).max(20),
    insuredHigh: z.number().min(1).max(10000), insuredBonus: z.number().min(0).max(20),
    fundingBonus: z.number().min(0).max(20), hiTechBonus: z.number().min(0).max(20), verifiedBonus: z.number().min(0).max(20),
  }),
  signalBoost: z.object({ tier1: z.number().min(0).max(20), tier2: z.number().min(0).max(20), max: z.number().min(0).max(40) }),
});
const tieringInput = z.object({
  p0Min: z.number().min(0).max(100), p1Min: z.number().min(0).max(100), p2Min: z.number().min(0).max(100),
  p0RequireSignal: z.boolean(),
}).refine((t) => t.p0Min > t.p1Min && t.p1Min > t.p2Min, { message: "阈值必须满足 P0 > P1 > P2" });

/** Excel 导入行（列名与回填模板一致，允许缺省） */
const importRow = z.object({
  eid: z.string().optional(),
  name: z.string().optional(),
  uscc: z.string().optional(),
  regCapital: z.string().optional(),
  founded: z.string().optional(),
  insured: z.number().nullable().optional(),
  legalRep: z.string().optional(),
  branches: z.number().nullable().optional(),
  jobs: z.number().nullable().optional(),
  topJobs: z.string().optional(),
  salaryRange: z.string().optional(),
  patents: z.number().nullable().optional(),
  softCopyrights: z.number().nullable().optional(),
  hiTech: z.string().optional(),
  funding: z.string().optional(),
  bidAmount: z.string().optional(),
  icp: z.string().optional(),
  keyContact: z.string().optional(),
  referralVia: z.string().optional(),
  referralNote: z.string().optional(),
  verified: z.enum(["待核验", "已核验", "存疑", "牌面遮挡"]).optional(),
  verifiedBy: z.string().optional(),
  remark: z.string().optional(),
  /** 迭代12 · 溯源元信息（AI 解析写入时由前端附带，不落 enrichments 表） */
  _source: z.enum(["ai_parse", "ai_parse_batch", "excel_import"]).optional(),
  _rawText: z.string().max(20000).optional(),
  _confidence: z.string().max(8).optional(),
});

export const parkRouter = router({
  /** 全量快照：KPI + 线索 + 漏斗。mask=true 输出脱敏数据（对外路演） */
  snapshot: publicProcedure
    .input(z.object({ mask: z.boolean().default(false) }).default({ mask: false }))
    .query(({ input }) => buildSnapshot({ maskSensitive: input.mask })),

  /** 迭代9 · 可解释性七问视图：依据/证据/信号/关系/时间线/模型逻辑/置信度（后端组装，零新数据源） */
  explain: publicProcedure
    .input(z.object({ eid: z.string(), mask: z.boolean().default(false) }))
    .query(async ({ input }) => {
      const view = await buildExplainForEid(input.eid, { maskSensitive: input.mask });
      if (!view) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
      return view;
    }),

  /** 迭代10 · 因果时间线：信号/富集/触达/打卡单一事件轴（后端聚合，倒序） */
  timeline: publicProcedure
    .input(z.object({ eid: z.string(), mask: z.boolean().default(false) }))
    .query(async ({ input }) => {
      const view = await buildTimelineForEid(input.eid, { maskSensitive: input.mask });
      if (!view) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
      return view;
    }),

  /** 迭代12 · 解析历史与字段级溯源：原文+结果快照回溯（登录用户；证据链强化） */
  parseHistory: router({
    list: protectedProcedure
      .input(z.object({ eid: z.string(), limit: z.number().min(1).max(50).default(20) }))
      .query(({ input }) => listParseHistory(input.eid, input.limit)),
    fieldSources: protectedProcedure
      .input(z.object({ eid: z.string() }))
      .query(({ input }) => buildFieldSources(input.eid)),
  }),

  /** 迭代12 · 企微/飞书分享卡片：解析完成/状态变更两场景，输出粘贴友好文本（登录用户；写台账） */
  shareCard: protectedProcedure
    .input(z.object({
      eid: z.string(),
      scene: z.enum(["parse", "stage"]),
      mask: z.boolean().default(false),
      fieldsWritten: z.array(z.string()).max(30).optional(),
      stage: z.string().max(16).optional(),
      note: z.string().max(256).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const card = await buildShareCard({
        eid: input.eid, scene: input.scene, mask: input.mask,
        extra: { fieldsWritten: input.fieldsWritten, stage: input.stage, note: input.note ?? null },
      });
      if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
      await appendLedger("share_card", input.eid, `生成分享卡片（${input.scene === "parse" ? "情报更新" : "作战推进"}）${input.mask ? "（脱敏）" : ""}`, ctx.user.name ?? ctx.user.openId);
      return card;
    }),

  /** 迭代11 · 需求预测引擎 v1：连接器驱动，可解释规则+权重（P0/P1 人才需求预测） */
  predict: router({
    list: publicProcedure
      .input(z.object({ mask: z.boolean().default(false) }).default({ mask: false }))
      .query(({ input }) => predictDemand({ maskSensitive: input.mask })),
    connectors: publicProcedure.query(() => listConnectors()),
  }),

  /** 迭代17 · 工单1 · 连接器框架 + ACL 防腐层（ADR-06 端口适配器） */
  connector: router({
    /** 连接器注册表状态（/connectors 页状态卡） */
    registry: protectedProcedure.query(() => listConnectorRegistry()),
    /** ingestionJob 历史 */
    jobs: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(200).default(50) }).default({ limit: 50 }))
      .query(({ input }) => listIngestionJobs(input.limit)),
    /** CSV/粘贴文本摄入：唯一入库通道（ACL → 实体解析 → 画像/信号装配） */
    ingest: protectedProcedure
      .input(z.object({
        adapterId: z.enum(["biz-registry", "job-board", "patent"]),
        csvText: z.string().min(1).max(200_000),
      }))
      .mutation(async ({ ctx, input }) => {
        const rawRows = parseCsvText(input.csvText);
        if (rawRows.length === 0) return { ok: false as const, error: "未解析到有效数据行（首行需为表头）", jobId: 0, rowsIn: 0, rowsOut: 0, rowsSkipped: 0, resolutions: [] };
        const result = await ingestViaAcl({
          adapterId: input.adapterId as AdapterId,
          rawRows,
          triggeredBy: ctx.user.name ?? ctx.user.openId,
        });
        return { ok: !result.error, error: result.error, ...result };
      }),
    /** 迭代24 · 工单13 · 外源连接器可用性状态（key 配置与降级模式） */
    external: protectedProcedure.query(() => externalConnectorStatus()),
    /** 迭代24 · 工单13 · 69 家批量回填复算（管理员；无 key 优雅降级不崩溃） */
    backfill: adminProcedure.mutation(({ ctx }) => runBackfill(ctx.user.name ?? "admin")),
  }),

  /** 迭代25 · 工单15 · 可观测性：/health + 指标 + 审计日志 */
  observability: router({
    health: publicProcedure.query(() => buildHealth()),
    metrics: protectedProcedure.query(() => buildMetrics()),
    audit: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100), action: z.string().optional(), actor: z.string().optional() }).default({ limit: 100 }))
      .query(({ input }) => queryAuditLog(input)),
  }),

  /** 迭代26 · 工单16 · ROI 归因看板 */
  attribution: protectedProcedure.query(() => buildAttribution()),

  /** 迭代26 · 工单17 · 一键开园（管理员；新建租户+加载配置包+seed样例+计时） */
  provision: adminProcedure
    .input(z.object({ parkId: z.string().min(1).max(32), parkName: z.string().min(1).max(128) }))
    .mutation(({ ctx, input }) => provisionPark(input.parkId, input.parkName, ctx.user.name ?? "admin")),

  /** 迭代27 · 工单20 · 数据质量看板 */
  quality: router({
    metrics: protectedProcedure.query(() => buildQualityMetrics()),
    quarantine: protectedProcedure.query(() => listQuarantine()),
  }),

  /** 迭代27 · 工单21 · 试点埋点 */
  analytics: router({
    track: protectedProcedure
      .input(z.object({ type: z.string(), decisionId: z.number().optional(), eid: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional() }))
      .mutation(({ ctx, input }) => trackEvent({ type: input.type as EventType, decisionId: input.decisionId, eid: input.eid, actor: ctx.user.name ?? ctx.user.openId, metadata: input.metadata, ts: new Date().toISOString() })),
    metrics: protectedProcedure
      .input(z.object({ days: z.number().min(1).max(90).default(7) }).default({ days: 7 }))
      .query(({ input }) => buildOperationalMetrics(input.days)),
    baseline: protectedProcedure
      .input(z.object({ days: z.number().min(1).max(90).default(7) }).default({ days: 7 }))
      .query(({ input }) => compareBaseline(input.days)),
  }),

  /** 迭代28 · 数据来源与证据治理 */
  ingestion: router({
    preview: protectedProcedure
      .input(z.object({
        sourceKey: z.string(), sourceName: z.string(), sourceCategory: z.string(),
        acquisitionChannel: z.string(), processingMethod: z.string(),
        records: z.array(z.object({ companyName: z.string(), fields: z.record(z.string(), z.string()), rawText: z.string().optional() })),
      }))
      .mutation(({ ctx, input }) => previewIngestion({ ...input, actor: ctx.user.name ?? ctx.user.openId })),
    commit: protectedProcedure
      .input(z.object({
        batchKey: z.string(), sourceKey: z.string(), sourceName: z.string(), sourceCategory: z.string(),
        acquisitionChannel: z.string(), processingMethod: z.string(),
        records: z.array(z.object({ companyName: z.string(), fields: z.record(z.string(), z.string()), rawText: z.string().optional() })),
      }))
      .mutation(({ ctx, input }) => commitIngestion({ ...input, actor: ctx.user.name ?? ctx.user.openId })),
    rollback: protectedProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(({ ctx, input }) => rollbackBatch(input.batchId, ctx.user.name ?? ctx.user.openId)),
    listBatches: protectedProcedure.query(() => listBatches()),
  }),
  evidence: router({
    byEntity: protectedProcedure.input(z.object({ eid: z.string() })).query(({ input }) => listEvidenceByEntity(input.eid)),
    byField: protectedProcedure.input(z.object({ eid: z.string(), fieldName: z.string() })).query(({ input }) => listEvidenceByField(input.eid, input.fieldName)),
    verify: protectedProcedure.input(z.object({ evidenceId: z.number() })).mutation(({ ctx, input }) => verifyEvidence(input.evidenceId, ctx.user.name ?? ctx.user.openId)),
    reject: protectedProcedure.input(z.object({ evidenceId: z.number() })).mutation(({ ctx, input }) => rejectEvidence(input.evidenceId, ctx.user.name ?? ctx.user.openId)),
  }),
  conflicts: router({
    list: protectedProcedure.query(() => listOpenConflicts()),
    resolve: protectedProcedure
      .input(z.object({ conflictId: z.number(), evidenceId: z.number() }))
      .mutation(({ ctx, input }) => resolveConflict(input.conflictId, input.evidenceId, ctx.user.name ?? ctx.user.openId)),
  }),
  sources: router({
    list: protectedProcedure.query(() => listSources()),
  }),

  /** 迭代28 · 数据环境隔离 · 压测管理 */
  loadTest: router({
    runs: protectedProcedure.query(() => listTestRuns()),
    cleanup: protectedProcedure
      .input(z.object({ testRunId: z.string() }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.role !== "admin") throw new Error("仅管理员可清理压测数据");
        return cleanupTestRun(input.testRunId, ctx.user.name ?? ctx.user.openId);
      }),
    envStats: protectedProcedure.query(() => getEnvironmentStats()),
  }),

  /** 统一影响管道：按 batch 补偿重算 */
  recompute: protectedProcedure
    .input(z.object({ batchId: z.number() }))
    .mutation(({ input }) => recomputeByBatch(input.batchId)),

  /** 迭代20 · 工单6 · 图谱智能：PathFinder / 社区发现 / 语义召回 / P0 引荐覆盖 */
  graphIntel: router({
    paths: publicProcedure
      .input(z.object({ targetKey: z.string().min(1).max(64), mask: z.boolean().default(false) }))
      .query(async ({ input }) => {
        const r = await findScoredPaths(input.targetKey, { maskSensitive: input.mask });
        if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "目标不在图谱中" });
        return r;
      }),
    communities: publicProcedure
      .input(z.object({ mask: z.boolean().default(false) }).default({ mask: false }))
      .query(({ input }) => detectCommunities({ maskSensitive: input.mask })),
    similar: publicProcedure
      .input(z.object({ eid: z.string().min(1).max(16), mask: z.boolean().default(false) }))
      .query(async ({ input }) => {
        const r = await findSimilarEntities(input.eid, { maskSensitive: input.mask });
        if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
        return r;
      }),
    p0Coverage: publicProcedure
      .input(z.object({ mask: z.boolean().default(false) }).default({ mask: false }))
      .query(({ input }) => buildP0ReferralCoverage({ maskSensitive: input.mask })),
  }),

  /** 迭代23 · 工单10 · 端到端 Decision Pipeline（ADR-11 十段事件驱动；一次导入触发全链） */
  pipeline: router({
    /** 一键触发：CSV 文本导入 → 十段链（断链显式报错） */
    run: protectedProcedure
      .input(z.object({
        adapterId: z.enum(["biz-registry", "job-board", "patent"]),
        csvText: z.string().min(1).max(200_000),
      }))
      .mutation(async ({ ctx, input }) => {
        const rawRows = parseCsvText(input.csvText);
        if (rawRows.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "未解析到有效数据行（首行需为表头）" });
        return runPipeline({ adapterId: input.adapterId as AdapterId, rawRows, triggeredBy: ctx.user.name ?? ctx.user.openId });
      }),
    /** 最近运行的事件流（串联视图） */
    runs: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(30).default(10) }).default({ limit: 10 }))
      .query(({ input }) => listPipelineRuns(input.limit)),
  }),

  /** 迭代23 · 工单12 · 一键演示 + 溯源钻取 */
  demo: router({
    /** 一键灌入演示企业（成都眸视科技）全链数据并触发十段 Pipeline（幂等可重复运行） */
    seed: protectedProcedure.mutation(() => runDemoSeed()),
    /** 信号溯源钻取：signal → connector → ingestionJob 原始证据（逐跳可点） */
    provenance: protectedProcedure
      .input(z.object({ eid: z.string().min(1).max(16), signalText: z.string().min(1).max(200) }))
      .query(({ input }) => traceSignalProvenance(input.eid, input.signalText)),
  }),

  /** 迭代20 · 工单7 · Agent Runtime：统一 Tool Contract + HITL（登录用户） */
  agent: router({
    tools: publicProcedure.query(() => TOOL_REGISTRY),
    run: protectedProcedure
      .input(z.object({
        tool: z.string().min(1).max(32),
        eid: z.string().max(16).optional(),
        text: z.string().max(2000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // 入站文本先过注入检测（网关内部还会再检，双保险）
        if (input.text) {
          const inj = detectInjection(input.text);
          if (!inj.safe) return { agent: "?", tool: input.tool, ok: false, requiresHuman: false, humanGateNote: null, output: null, error: "输入包含疑似提示注入内容，已拦截" };
        }
        return runAgentTool(input.tool, { eid: input.eid, text: input.text, actor: ctx.user.name ?? ctx.user.openId });
      }),
  }),

  /** 迭代17 · 工单2 · 实体解析引擎（USCC 主键/归一化/消歧队列） */
  resolution: router({
    /** 存量重复扫描（管理员触发，幂等） */
    scan: adminProcedure.mutation(async ({ ctx }) => scanExistingDuplicates(ctx.user.name ?? "admin")),
    /** 人工消歧队列 */
    queue: protectedProcedure.query(() => listDisambiguationQueue()),
    /** 人工裁定：确认合并/拆分/存疑/撤销 */
    decide: protectedProcedure
      .input(z.object({ id: z.number(), action: z.enum(["confirm", "split", "dismiss", "revert"]) }))
      .mutation(({ ctx, input }) => decideMerge({ ...input, actor: ctx.user.name ?? ctx.user.openId })),
    /** 单条名称试匹配（导入预检/调试） */
    match: protectedProcedure
      .input(z.object({ rawName: z.string().min(1).max(128), uscc: z.string().optional() }))
      .query(({ input }) => resolveMatchEntity({ rawName: input.rawName, uscc: input.uscc ?? null })),
  }),

  /** 迭代21 · 工单8 · 工作流引擎（WorkflowRuntime / TaskManager SLA / SagaCoordinator） */
  workflow: router({
    /** 由已采纳/执行中决策启动流程（同决策幂等一次） */
    start: protectedProcedure
      .input(z.object({ decisionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { startWorkflow } = await import("../workflowEngine");
        return startWorkflow(input.decisionId, ctx.user.name ?? ctx.user.openId);
      }),
    /** 流程实例清单（步骤状态/补偿记录） */
    instances: protectedProcedure.query(async () => {
      const { listInstances, seedWorkflowDefs } = await import("../workflowEngine");
      await seedWorkflowDefs();
      return listInstances();
    }),
    /** 待办 SLA 任务（open + escalated，含超时标记） */
    tasks: protectedProcedure.query(async () => {
      const { listOpenTasks } = await import("../workflowEngine");
      return listOpenTasks();
    }),
    /** 完成/失败人工任务（幂等重放；失败触发 Saga 补偿） */
    completeTask: protectedProcedure
      .input(z.object({ taskId: z.number(), failed: z.boolean().optional(), note: z.string().max(255).optional() }))
      .mutation(async ({ ctx, input }) => {
        const { completeTask } = await import("../workflowEngine");
        return completeTask(input.taskId, ctx.user.name ?? ctx.user.openId, { failed: input.failed, note: input.note });
      }),
    /** SLA 超时巡检（超时任务升级；管理员触发） */
    escalate: adminProcedure.mutation(async () => {
      const { escalateOverdueTasks } = await import("../workflowEngine");
      return escalateOverdueTasks();
    }),
  }),

  /** 迭代22 · 工单9 · 学习引擎（champion-challenger + 人审晋升 + 血缘；硬约束：不得自动上线） */
  learning: router({
    /** 当前 champion 基线（在线 scoring 权重 + 结果样本统计） */
    champion: protectedProcedure.query(async () => {
      const { championSnapshot } = await import("../learningEngine");
      return championSnapshot();
    }),
    /** 模型清单（challenger 候选 + 回测 + 血缘） */
    models: protectedProcedure.query(async () => {
      const { listModels } = await import("../learningEngine");
      return listModels();
    }),
    /** 生成 challenger（白盒重估 + 自动回测，不上线） */
    propose: adminProcedure.mutation(async ({ ctx }) => {
      const { proposeChallenger } = await import("../learningEngine");
      return proposeChallenger(ctx.user.name ?? "admin");
    }),
    /** 人审晋升：challenger → champion（写 ruleConfigs scoring 新版本，可回滚） */
    promote: adminProcedure
      .input(z.object({ modelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { promoteChallenger } = await import("../learningEngine");
        return promoteChallenger(input.modelId, ctx.user.name ?? "admin");
      }),
    /** 淘汰 challenger */
    archive: adminProcedure
      .input(z.object({ modelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { archiveModel } = await import("../learningEngine");
        return archiveModel(input.modelId, ctx.user.name ?? "admin");
      }),
  }),

  /** 迭代18 · 工单4 · RBAC-ABAC + PIPL 同意 + 字段级分级脱敏（ADR-04） */
  authz: router({
    /** 迭代19 · 工单5 · 多租户就绪：当前租户信息（TenantContext 注入；默认租户 uestc） */
    tenant: publicProcedure.query(() => ({
      tenantId: currentTenant(),
      isDefault: currentTenant() === DEFAULT_TENANT,
      note: "全部 16 张业务表已带 tenantId 隔离列；新租户开通即隔离，存量数据归属默认租户。",
    })),
    /** 策略清单（治理页配置 UI） */
    policies: protectedProcedure.query(async () => {
      const { listPolicies } = await import("../authz");
      return listPolicies();
    }),
    /** 管理员更新策略 */
    updatePolicy: adminProcedure
      .input(z.object({ id: z.number(), effect: z.enum(["allow", "mask", "deny"]), condition: z.string().max(255).nullable().optional() }))
      .mutation(async ({ ctx, input }) => {
        const { updatePolicy } = await import("../authz");
        const r = await updatePolicy({ ...input, actor: ctx.user.name ?? "admin" });
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
    /** 同意清单（可按企业过滤） */
    consents: protectedProcedure
      .input(z.object({ eid: z.string().optional() }).default({}))
      .query(async ({ input }) => {
        const { listConsents } = await import("../authz");
        return listConsents(input.eid);
      }),
    /** 记录同意授权 */
    grantConsent: protectedProcedure
      .input(z.object({
        eid: z.string().min(1).max(16),
        scope: z.enum(["contact_info", "hr_data", "finance_data", "full_profile"]),
        grantedBy: z.string().min(1).max(64),
        basis: z.string().min(1).max(255),
        expiresDays: z.number().int().min(1).max(3650).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { grantConsent } = await import("../authz");
        const r = await grantConsent({ ...input, actor: ctx.user.name ?? ctx.user.openId });
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
    /** 撤回同意（撤回后相关字段自动脱敏/拒绝） */
    revokeConsent: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const { revokeConsent } = await import("../authz");
        const r = await revokeConsent({ id: input.id, actor: ctx.user.name ?? ctx.user.openId });
        if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error });
        return r;
      }),
    /** 字段级授权读取：企业富集档案经 RBAC-ABAC 引擎输出（带审计） */
    readEnrichment: protectedProcedure
      .input(z.object({ eid: z.string().min(1).max(16) }))
      .query(async ({ ctx, input }) => {
        const { authorizeFields } = await import("../authz");
        const ents = await loadEntities();
        const ent = ents.find((x) => x.eid === input.eid);
        if (!ent) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
        const raw = (ent.enrichFull ?? {}) as Record<string, unknown>;
        return authorizeFields({
          role: (ctx.user.role as "user" | "admin") ?? "user",
          eid: input.eid, data: raw,
          actor: ctx.user.name ?? ctx.user.openId, audit: true,
        });
      }),
  }),

  /** 迭代11 · 学习飞轮 v1：成交/流失回填 → 命中统计 → 校准建议（人在环，只产建议不自动改规则） */
  flywheel: publicProcedure
    .input(z.object({ mask: z.boolean().default(false) }).default({ mask: false }))
    .query(({ input }) => buildFlywheel({ maskSensitive: input.mask })),

  /** 迭代13 · 决策闭环（Decision Loop）：决策一等对象 · 生成/流转/归因/画像 */
  decision: router({
    /** 决策中心建议流：按类型分组 + 原因链 + 星级 + 资源匹配快照（公开可读，支持脱敏） */
    feed: publicProcedure
      .input(z.object({
        mask: z.boolean().default(false),
        status: z.array(z.enum(["suggested", "adopted", "executing", "done", "dismissed"])).optional(),
      }).default({ mask: false }))
      .query(({ input }) => buildDecisionFeed({ maskSensitive: input.mask, status: input.status })),
    /** 决策级 ROI：采纳率/成交率/类型命中/收入归因（公开可读，仅聚合数字） */
    roi: publicProcedure.query(() => buildDecisionRoi()),
    /** V3 波次一 · 九要素 Decision Card（Provenance 全链：证据/置信度/风险/机会/影响/学习/反事实） */
    card9: publicProcedure
      .input(z.object({ id: z.number(), mask: z.boolean().default(false) }))
      .query(async ({ input }) => {
        const card = await buildDecisionCard9(input.id, { maskSensitive: input.mask });
        if (!card) throw new TRPCError({ code: "NOT_FOUND", message: "决策不存在" });
        return card;
      }),
    /** V3 波次一 · Decision Health 五维北极星（Velocity/Quality/Impact/ROI/Learning） */
    health: publicProcedure.query(() => buildDecisionHealth()),
    /** V3 波次二 · Scenario OS：场景看板（首页）与单场景 Workspace */
    scenarios: publicProcedure
      .input(z.object({ mask: z.boolean().default(false) }).default({ mask: false }))
      .query(({ input }) => buildScenarioBoard({ maskSensitive: input.mask })),
    scenarioWorkspace: publicProcedure
      .input(z.object({ sid: z.string(), mask: z.boolean().default(false) }))
      .query(async ({ input }) => {
        const ws = await buildScenarioWorkspace(input.sid, { maskSensitive: input.mask });
        if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "场景不存在" });
        return ws;
      }),
    /** V3 波次三 · Graph What-if：引入/流失企业的五维传导（税收/就业/面积/人才/产业链） */
    whatIf: publicProcedure
      .input(z.object({ eid: z.string(), action: z.enum(["add", "remove"]), mask: z.boolean().default(false) }))
      .query(async ({ input }) => {
        const r = await whatIfEntity(input.eid, input.action, { maskSensitive: input.mask });
        if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
        return r;
      }),
    /** V3 波次三 · Simulation Center：招商/政策/资源三模拟器 */
    simulate: publicProcedure
      .input(z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("attract"), ind: z.string().max(20), n: z.number().min(1).max(50), size: z.number().min(5).max(500) }),
        z.object({ kind: z.literal("policy"), coverage: z.number().min(10).max(100) }),
        z.object({ kind: z.literal("resource") }),
      ]))
      .query(({ input }) => {
        if (input.kind === "attract") return simulateAttract(input.ind, input.n, input.size);
        if (input.kind === "policy") return simulatePolicy(input.coverage);
        return simulateResource();
      }),
    /** V3 波次四 · Organizational Memory：五源合并检索（台账/决策/解析/状态/任务） */
    memorySearch: publicProcedure
      .input(z.object({ q: z.string().max(64).optional(), eid: z.string().optional(), limit: z.number().min(1).max(200).default(60), mask: z.boolean().default(false) }))
      .query(({ input }) => searchMemory({ q: input.q, eid: input.eid, limit: input.limit, maskSensitive: input.mask })),
    memoryStats: publicProcedure.query(() => memoryStats()),
    /** V3 波次四 · Multi-Agent 运行台：8 Agent 职责/输入/输出/协作 + 最近活动 */
    agentBoard: publicProcedure.query(() => buildAgentBoard()),
    /** V3 波次四 · Decision Marketplace 商品目录 */
    marketplace: publicProcedure.query(() => MARKET_CATALOG),
    /** 单企业决策画像：需求画布 + 生命周期 + 决策清单（企业360 决策 Tab） */
    entityProfile: publicProcedure
      .input(z.object({ eid: z.string(), mask: z.boolean().default(false) }))
      .query(({ input }) => buildEntityDecisionProfile(input.eid, { maskSensitive: input.mask })),
    /** 决策生成：全量 P0/P1 扫描 → 幂等入库（登录用户可触发，台账留痕） */
    generate: protectedProcedure.mutation(async ({ ctx }) => {
      const actor = ctx.user.name ?? ctx.user.openId;
      const res = await generateDecisions(actor);
      await appendLedger("decision_generate", null, `决策引擎扫描：生成 ${res.created} 条 / 幂等跳过 ${res.skipped} 条`, actor);
      return res;
    }),
    /** 决策状态机流转：采纳（指派）→执行→完成（必须回填结果）/放弃（台账留痕） */
    transition: protectedProcedure
      .input(z.object({
        id: z.number(),
        to: z.enum(["adopted", "executing", "done", "dismissed"]),
        assignee: z.string().max(64).optional(),
        outcome: z.enum(["won", "lost", "partial"]).optional(),
        outcomeNote: z.string().max(255).optional(),
        dealAmount: z.number().int().min(0).max(100_000_000).optional(),
        resourceId: z.number().int().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const actor = ctx.user.name ?? ctx.user.openId;
        const res = await transitionDecision({ ...input, assignee: input.assignee ?? actor, actor });
        if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.error });
        // 台账已由 transitionDecision 内 appendOrAbort 写入（append-or-abort 语义，写失败业务已回滚）
        return res.row;
      }),
    /** 迭代18 · 工单3 · 决策全链溯源：数据→规则→评分→决策→执行→结果 */
    trace: protectedProcedure
      .input(z.object({ id: z.number(), mask: z.boolean().default(false) }))
      .query(async ({ input }) => {
        const { traceDecision } = await import("../decisionLedger");
        const t = await traceDecision(input.id, input.mask);
        if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "决策不存在" });
        return t;
      }),
    /** 迭代14 · 成员名单：采纳时可指派任意已登录过的成员（多人协作分单） */
    members: protectedProcedure.query(async () => {
      const db = await getDb();
      const names = new Set<string>();
      if (process.env.OWNER_NAME) names.add(process.env.OWNER_NAME);
      if (db) {
        const rows = await db.select({ name: users.name }).from(users);
        for (const r of rows) if (r.name) names.add(r.name);
      }
      return Array.from(names).sort();
    }),
    /** 资源库清单（Marketplace 底座） */
    resources: publicProcedure.query(async () => {
      const rows = await listResources();
      return rows.map((r) => ({ id: r.id, rtype: r.rtype, name: r.name, org: r.org, needTags: r.needTags, indTags: r.indTags, stageTags: r.stageTags, capacity: r.capacity, note: r.note }));
    }),
    /** 迭代15 · 资源容量占用：executing 决策实时聚合（已占/总量展示与超容量预警） */
    resourceUsage: publicProcedure.query(() => buildResourceUsage()),
    /** 迭代15 · 月度经营报表：按成员/资源/决策类型汇总成交金额与转化率 */
    monthlyReport: protectedProcedure
      .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .query(({ input }) => buildMonthlyReport(input.month)),
    /** 迭代15 · 月度报表导出行（前端组装 Excel，导出留痕） */
    monthlyReportExport: protectedProcedure
      .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
      .mutation(async ({ input, ctx }) => {
        const rep = await buildMonthlyReport(input.month);
        const rows: string[][] = [];
        rows.push(["月度经营报表", rep.month]);
        rows.push([]);
        rows.push(["总览", "决策数", "已完成", "成交(won)", "转化率%", "成交金额(元)"]);
        rows.push(["", String(rep.totals.decisions), String(rep.totals.done), String(rep.totals.won), String(rep.totals.winRate), String(rep.totals.amount)]);
        rows.push([]);
        rows.push(["按负责人", "决策数", "已完成", "成交", "转化率%", "成交金额(元)"]);
        for (const a of rep.byAssignee) rows.push([a.assignee, String(a.total), String(a.done), String(a.won), String(a.winRate), String(a.amount)]);
        rows.push([]);
        rows.push(["按决策类型", "决策数", "已完成", "成交", "转化率%", "成交金额(元)"]);
        for (const t of rep.byType) rows.push([t.label, String(t.total), String(t.done), String(t.won), String(t.winRate), String(t.amount)]);
        rows.push([]);
        rows.push(["按资源", "决策数", "已完成", "成交", "成交金额(元)"]);
        for (const r of rep.byResource) rows.push([r.resource, String(r.total), String(r.done), String(r.won), String(r.amount)]);
        rows.push([]);
        rows.push(["口径说明", rep.note]);
        await appendLedger("export", null, `导出月度经营报表 ${input.month}`, ctx.user.name ?? ctx.user.openId);
        return { filename: `月度经营报表_${input.month}.xlsx`, rows };
      }),
    /** 迭代14 · 资源库管理（管理员）：全量清单（含停用）+ 新增/编辑/停用（台账留痕） */
    resourceAdmin: router({
      list: adminProcedure.query(async () => {
        const rows = await listResources();
        return rows.map((r) => ({ id: r.id, rtype: r.rtype, name: r.name, org: r.org, needTags: r.needTags, indTags: r.indTags, stageTags: r.stageTags, capacity: r.capacity, note: r.note, active: r.active === 1 }));
      }),
      create: adminProcedure
        .input(z.object({
          rtype: z.string().max(24), name: z.string().min(1).max(128), org: z.string().max(128).optional(),
          needTags: z.string().min(1).max(128), indTags: z.string().max(128).optional(), stageTags: z.string().max(128).optional(),
          capacity: z.number().int().min(0).max(999), note: z.string().max(255).optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const res = await createResource(input);
          if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.error });
          await appendLedger("resource_manage", null, `新增资源「${input.name}」（${input.rtype} · 容量${input.capacity}）`, ctx.user.name ?? ctx.user.openId);
          return { id: res.id };
        }),
      update: adminProcedure
        .input(z.object({
          id: z.number(),
          rtype: z.string().max(24).optional(), name: z.string().min(1).max(128).optional(), org: z.string().max(128).nullish(),
          needTags: z.string().min(1).max(128).optional(), indTags: z.string().max(128).nullish(), stageTags: z.string().max(128).nullish(),
          capacity: z.number().int().min(0).max(999).optional(), note: z.string().max(255).nullish(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...rest } = input;
          const res = await updateResource(id, rest);
          if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.error });
          await appendLedger("resource_manage", null, `编辑资源#${id}${rest.capacity !== undefined ? ` · 容量=${rest.capacity}` : ""}`, ctx.user.name ?? ctx.user.openId);
          return { ok: true };
        }),
      toggle: adminProcedure
        .input(z.object({ id: z.number(), active: z.boolean() }))
        .mutation(async ({ input, ctx }) => {
          const res = await toggleResource(input.id, input.active);
          if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.error });
          await appendLedger("resource_manage", null, `${input.active ? "启用" : "停用"}资源#${input.id}`, ctx.user.name ?? ctx.user.openId);
          return { ok: true };
        }),
    }),
  }),

  /** 迭代11 · 关系图谱（图数据驱动屏三）：全图查询 + 多跳引荐路径推演 */
  graph: router({
    get: publicProcedure
      .input(z.object({ mask: z.boolean().default(false) }).default({ mask: false }))
      .query(({ input }) => loadGraph({ maskSensitive: input.mask })),
    chains: publicProcedure
      .input(z.object({ targetKey: z.string(), mask: z.boolean().default(false) }))
      .query(async ({ input }) => {
        const out = await findReferralChains(input.targetKey, { maskSensitive: input.mask });
        if (!out) throw new TRPCError({ code: "NOT_FOUND", message: "目标节点不在图谱中" });
        return out;
      }),
    seed: adminProcedure.mutation(async ({ ctx }) => {
      const res = await seedGraph();
      await appendLedger("graph_seed", null, JSON.stringify(res).slice(0, 200), ctx.user.name ?? ctx.user.openId);
      return res;
    }),
  }),

  /** 触达任务清单：本周应触达 / 应复访 / 培育跟进（后端规则推演） */
  tasks: publicProcedure
    .input(z.object({ mask: z.boolean().default(false) }).default({ mask: false }))
    .query(async ({ input }) => {
      const [snap, stageEvents, rules, doneRows] = await Promise.all([
        buildSnapshot({ maskSensitive: input.mask }),
        loadLatestStageEvents(),
        loadRules(),
        loadWeekCompletions(),
      ]);
      const hv = snap.items.filter((i) => i.tier === "P0" || i.tier === "P1");
      const tasks = buildTaskList(hv, stageEvents, new Date(), rules.tasks);
      const iMap = new Map(snap.items.map((i) => [i.eid, i]));
      const doneSet = new Set(doneRows.map((d) => `${d.eid}|${d.taskType}`));
      return tasks.map((t) => {
        const x = iMap.get(t.eid)!;
        return {
          ...t, name: x.name, tier: x.tier, score: x.score, stage: x.stage, floor: x.floor, ind: x.ind,
          done: doneSet.has(`${t.eid}|${t.taskType}`),
        };
      });
    }),

  /** 任务完成打卡 / 撤销（登录用户；写台账） */
  taskDone: protectedProcedure
    .input(z.object({ eid: z.string(), taskType: taskTypeEnum, note: z.string().max(256).optional() }))
    .mutation(async ({ input, ctx }) => {
      const actor = ctx.user.name ?? ctx.user.openId;
      await markTaskDone(input.eid, input.taskType, input.note ?? null, actor);
      await appendLedger("task_done", input.eid, `${input.taskType} 完成打卡${input.note ? ` · ${input.note}` : ""}`, actor);
      return { ok: true };
    }),
  taskUndone: protectedProcedure
    .input(z.object({ eid: z.string(), taskType: taskTypeEnum }))
    .mutation(async ({ input, ctx }) => {
      await unmarkTaskDone(input.eid, input.taskType);
      await appendLedger("task_undone", input.eid, `${input.taskType} 撤销打卡`, ctx.user.name ?? ctx.user.openId);
      return { ok: true };
    }),

  /** 周报复盘（模块12 "周"节奏）：完成率 + 分类统计 + 本周状态推进 + 当前漏斗 */
  weeklyReview: publicProcedure
    .input(z.object({ mask: z.boolean().default(false) }).default({ mask: false }))
    .query(async ({ input }) => buildWeeklyReview({ maskSensitive: input.mask })),

  /** 导出数据（登录用户；后端组装行数据，前端仅生成 xlsx 文件；写台账） */
  exportData: protectedProcedure
    .input(z.object({ kind: z.enum(["leads", "tasks", "weekly"]), mask: z.boolean().default(false) }))
    .query(async ({ input, ctx }) => {
      const snap = await buildSnapshot({ maskSensitive: input.mask });
      const actor = ctx.user.name ?? ctx.user.openId;
      if (input.kind === "leads") {
        const rows = snap.items
          .filter((i) => i.tier === "P0" || i.tier === "P1")
          .map((i, idx) => ({
            顺位: idx + 1, 企业: i.name, 楼层: i.floor, 行业: i.ind, 优先级: i.tier, 评分: i.score,
            管道匹配: i.pipeMatch, 状态: i.stage, 信号数: i.signals.length,
            最新信号: i.signals[0]?.t ?? "", NBA动作: (i as { nba?: string }).nba ?? "", 引荐路径: i.path ?? "",
          }));
        await appendLedger("export", null, `导出作战名单 ${rows.length} 行${input.mask ? "（脱敏）" : ""}`, actor);
        return { rows, sheet: "P0P1作战名单", file: `SPI-OS_作战名单_${isoWeekKey()}` };
      }
      if (input.kind === "tasks") {
        const [stageEvents, rules, doneRows] = await Promise.all([loadLatestStageEvents(), loadRules(), loadWeekCompletions()]);
        const hv = snap.items.filter((i) => i.tier === "P0" || i.tier === "P1");
        const tasks = buildTaskList(hv, stageEvents, new Date(), rules.tasks);
        const iMap = new Map(snap.items.map((i) => [i.eid, i]));
        const doneSet = new Set(doneRows.map((d) => `${d.eid}|${d.taskType}`));
        const rows = tasks.map((t, idx) => {
          const x = iMap.get(t.eid)!;
          return {
            顺位: idx + 1, 任务类型: t.taskType, 企业: x.name, 优先级: x.tier, 评分: x.score,
            状态: x.stage, 任务说明: t.reason, 等待天数: t.daysWaiting ?? "", 本周完成: doneSet.has(`${t.eid}|${t.taskType}`) ? "✓" : "",
          };
        });
        await appendLedger("export", null, `导出任务清单 ${rows.length} 行${input.mask ? "（脱敏）" : ""}`, actor);
        return { rows, sheet: "本周任务清单", file: `SPI-OS_任务清单_${isoWeekKey()}` };
      }
      // weekly：周报复盘导出
      const [stageEvents, rules, doneRows, moves] = await Promise.all([
        loadLatestStageEvents(), loadRules(), loadWeekCompletions(), loadWeekStageMoves(7),
      ]);
      const hv = snap.items.filter((i) => i.tier === "P0" || i.tier === "P1");
      const stillOpen = buildTaskList(hv, stageEvents, new Date(), rules.tasks)
        .filter((t) => !doneRows.some((d) => d.eid === t.eid && d.taskType === t.taskType));
      const nameMap = new Map(snap.items.map((i) => [i.eid, i.name]));
      const rows = [
        ...doneRows.map((d) => ({ 类别: "已完成", 企业: nameMap.get(d.eid) ?? d.eid, "任务/动作": d.taskType as string, 说明: d.note ?? "", 执行人: d.actor ?? "", 时间: d.createdAt.toLocaleString("zh-CN") })),
        ...moves.map((m) => ({ 类别: "状态推进", 企业: nameMap.get(m.eid) ?? m.eid, "任务/动作": `→ ${m.stage}`, 说明: m.note ?? "", 执行人: m.actor ?? "", 时间: m.createdAt.toLocaleString("zh-CN") })),
        ...stillOpen.map((t) => ({ 类别: "待办", 企业: nameMap.get(t.eid) ?? t.eid, "任务/动作": t.taskType, 说明: t.reason, 执行人: "", 时间: "" })),
      ];
      await appendLedger("export", null, `导出周报复盘 ${rows.length} 行`, actor);
      return { rows, sheet: `周报${isoWeekKey()}`, file: `SPI-OS_周报复盘_${isoWeekKey()}` };
    }),

  /** 操作台账（轻量 Decision Ledger，管理员可查） */
  ledger: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      action: z.string().max(32).optional(),
      actor: z.string().max(64).optional(),
      sinceDays: z.number().min(1).max(365).optional(),
    }).default({ limit: 50 }))
    .query(({ input }) => loadLedger(input)),

  /** 双版引荐话术：由后端按规则模板生成，前端不持有模板 */
  pitch: publicProcedure
    .input(z.object({ eid: z.string(), version: z.enum(["formal", "light"]) }))
    .query(async ({ input }) => {
      const [rules, ents] = await Promise.all([loadRules(), loadEntities()]);
      const x = ents.find((e) => e.eid === input.eid);
      if (!x) return { text: "", error: "企业不存在" };
      const r = calcEntity(x, rules);
      return { text: buildPitch({ ...x, tier: r.tier }, input.version, rules), error: null };
    }),

  /** 单企业生命周期历史 */
  lifecycle: router({
    history: publicProcedure.input(z.object({ eid: z.string() })).query(({ input }) => loadLifecycleHistory(input.eid)),
    mark: protectedProcedure
      .input(z.object({
        eid: z.string(), stage: stageEnum, note: z.string().max(256).optional(),
        /** 成交原因编码（Cap-09 Outcome：标记"已成交"时附） */
        outcomeReason: z.enum(["价格合适", "管道对口", "暖引荐信任", "服务方案匹配", "其他"]).optional(),
        /** 流失/回退原因编码（Cap-09 Outcome：状态回退或放弃时附） */
        lossReason: z.enum(["预算不足", "已有供应商", "需求消失", "决策人变动", "竞对拿下", "其他"]).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const actor = ctx.user.name ?? ctx.user.openId;
        const reason = input.outcomeReason ?? input.lossReason;
        const prefix = input.outcomeReason ? `[成交:${input.outcomeReason}]` : input.lossReason ? `[流失:${input.lossReason}]` : "";
        const note = reason ? `${prefix}${input.note ? ` ${input.note}` : ""}` : (input.note ?? null);
        await appendLifecycleEvent(input.eid, input.stage, note, actor);
        await appendLedger("stage_mark", input.eid, `状态 → ${input.stage}${note ? ` · ${note}` : ""}`, actor);
        return { ok: true };
      }),
  }),

  /** Excel 情报批量导入（前端解析出行数组后提交；服务端匹配 eid/名称 → upsert → 复算在快照层自动发生）
   *  迭代6：逐行校验报告——每行返回 状态/匹配方式/写入字段/纠错建议 */
  importEnrichment: protectedProcedure
    .input(z.object({ rows: z.array(importRow).min(1).max(200) }))
    .mutation(async ({ input, ctx }) => {
      let ok = 0;
      let skipped = 0;
      const errors: { row: number; reason: string }[] = [];
      const report: { row: number; company: string; status: "成功" | "跳过" | "失败"; matchedBy: string; fields: number; suggestion: string }[] = [];
      for (let i = 0; i < input.rows.length; i++) {
        const r = input.rows[i];
        const company = r.name?.trim() || r.eid?.trim() || `第${i + 1}行`;
        try {
          let eid = r.eid?.trim();
          let matchedBy = "eid 精确匹配";
          if (!eid && r.name) {
            eid = (await findEntityByName(r.name)) ?? undefined;
            matchedBy = "企业名称匹配";
          }
          if (!eid) {
            skipped++;
            errors.push({ row: i + 1, reason: "无法匹配企业（eid 与名称均未命中）" });
            report.push({ row: i + 1, company, status: "跳过", matchedBy: "未匹配", fields: 0, suggestion: "核对企业全称是否与楼层名录一致（含「有限公司」后缀），或直接填写 eid 列（如 E703）" });
            continue;
          }
          const { eid: _e, name: _n, _source, _rawText, _confidence, ...fields } = r;
          const cleaned = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && v !== ""));
          if (Object.keys(cleaned).length === 0) {
            skipped++;
            errors.push({ row: i + 1, reason: "无有效字段" });
            report.push({ row: i + 1, company, status: "跳过", matchedBy, fields: 0, suggestion: "该行除企业标识外全部为空；请至少填写一个富集字段（如在招岗位数/参保人数/USCC）" });
            continue;
          }
          const tips: string[] = [];
          const uscc = (cleaned as Record<string, unknown>).uscc;
          if (typeof uscc === "string" && uscc && !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(uscc)) tips.push("USCC 应为 18 位统一社会信用代码（不含 I/O/S/V/Z）");
          const jobs = (cleaned as Record<string, unknown>).jobsOpen;
          if (typeof jobs === "number" && jobs > 500) tips.push("在招岗位数 >500 疑似异常，请复核 BOSS/猎聘口径");
          await upsertEnrichment({ eid, ...cleaned });
          // 迭代12 · 解析历史快照：每次写入留痕（原文+结果+写入字段清单），支撑字段级溯源
          await recordParseHistory({
            eid,
            sourceType: _source ?? "excel_import",
            rawText: _rawText ?? JSON.stringify(cleaned),
            result: cleaned,
            fieldsWritten: Object.keys(cleaned),
            confidence: _confidence ?? null,
            actor: ctx.user.name ?? ctx.user.openId,
          });
          ok++;
          report.push({ row: i + 1, company, status: "成功", matchedBy, fields: Object.keys(cleaned).length, suggestion: tips.join("；") || "—" });
        } catch (err) {
          errors.push({ row: i + 1, reason: err instanceof Error ? err.message : "写入失败" });
          report.push({ row: i + 1, company, status: "失败", matchedBy: "—", fields: 0, suggestion: "服务端写入异常，可重试该行；若持续失败请检查字段格式（数字列勿填文字）" });
        }
      }
      await appendLedger("import", null, `Excel 情报导入：成功 ${ok} / 跳过 ${skipped} / 失败 ${report.filter((x) => x.status === "失败").length}`, ctx.user.name ?? ctx.user.openId);
      return { ok, skipped, failed: report.filter((x) => x.status === "失败").length, errors, report };
    }),

  /** 规则中心（管理员专用）：在线调评分权重/分级阈值/管道匹配，写 ruleConfigs 即时生效 */
  rules: router({
    get: adminProcedure.query(async () => {
      const [rules, versions] = await Promise.all([loadRules(), loadRuleVersions()]);
      // 话术模板不在线编辑（涉及敏感表述），规则中心开放 scoring/tiering/pipeMatch/tasks
      return {
        scoring: rules.scoring,
        tiering: rules.tiering,
        pipeMatch: rules.pipeMatch,
        tasks: rules.tasks,
        defaults: { scoring: DEFAULT_RULES.scoring, tiering: DEFAULT_RULES.tiering, pipeMatch: DEFAULT_RULES.pipeMatch, tasks: DEFAULT_RULES.tasks },
        versions,
      };
    }),
    /** 影响预览（dry-run）：不落库，返回新旧规则下的 Tier 升级/降级差异 */
    preview: adminProcedure
      .input(z.object({
        scoring: scoringInput.optional(),
        tiering: tieringInput.optional(),
        pipeMatch: z.record(z.string(), z.number().min(0).max(100)).optional(),
      }))
      .query(async ({ input }) => {
        const [current, ents] = await Promise.all([loadRules(), loadEntities()]);
        const next: RuleSet = structuredClone(current);
        if (input.scoring) next.scoring = { ...next.scoring, ...input.scoring };
        if (input.tiering) next.tiering = { ...next.tiering, ...input.tiering };
        if (input.pipeMatch) next.pipeMatch = { ...next.pipeMatch, ...input.pipeMatch };
        return calcRuleImpact(ents, current, next);
      }),
    saveScoring: adminProcedure
      .input(scoringInput)
      .mutation(async ({ input, ctx }) => {
        const res = await saveRuleConfig("scoring", input, ctx.user.name);
        await appendLedger("rule_save", null, "修改评分规则（权重/富集加分/信号加分）", ctx.user.name ?? ctx.user.openId, { before: res.beforeJson, after: res.afterJson });
        return res;
      }),
    saveTiering: adminProcedure
      .input(tieringInput)
      .mutation(async ({ input, ctx }) => {
        const res = await saveRuleConfig("tiering", input, ctx.user.name);
        await appendLedger("rule_save", null, `修改分级阈值 P0≥${input.p0Min}/P1≥${input.p1Min}/P2≥${input.p2Min}`, ctx.user.name ?? ctx.user.openId, { before: res.beforeJson, after: res.afterJson });
        return res;
      }),
    savePipeMatch: adminProcedure
      .input(z.record(z.string(), z.number().min(0).max(100)))
      .mutation(async ({ input, ctx }) => {
        const res = await saveRuleConfig("pipeMatch", input, ctx.user.name);
        await appendLedger("rule_save", null, "修改管道匹配度", ctx.user.name ?? ctx.user.openId, { before: res.beforeJson, after: res.afterJson });
        return res;
      }),
    saveTasks: adminProcedure
      .input(z.object({
        touchedStallDays: z.number().min(1).max(90),
        meetingStallDays: z.number().min(1).max(180),
        p1NeedTier1Signal: z.boolean(),
      }))
      .mutation(async ({ input, ctx }) => {
        const res = await saveRuleConfig("tasks", input, ctx.user.name);
        await appendLedger("rule_save", null, `修改任务规则 复访${input.touchedStallDays}天/推进${input.meetingStallDays}天`, ctx.user.name ?? ctx.user.openId, { before: res.beforeJson, after: res.afterJson });
        return res;
      }),
    reset: adminProcedure
      .input(z.object({ key: z.enum(["scoring", "tiering", "pipeMatch", "tasks"]) }))
      .mutation(async ({ input, ctx }) => {
        const res = await resetRuleConfig(input.key);
        await appendLedger("rule_reset", null, `恢复默认规则：${input.key}`, ctx.user.name ?? ctx.user.openId);
        return res;
      }),
  }),

  /** 一次性种子灌库（幂等：已存在的 eid 跳过；管理员专用） */
  admin: router({
    seedDb: adminProcedure.mutation(() => seedDatabase()),
  }),

  /** AI 侧边助手（迭代6）：自然语言查询企业数据 + 招商方案生成；LLM 仅在后端调用，输出含看板联动高亮指令 */
  ai: router({
    ask: protectedProcedure
      .input(z.object({
        question: z.string().min(1).max(2000),
        mask: z.boolean().default(false),
        history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12).default([]),
      }))
      .mutation(async ({ input, ctx }) => {
        const res = await askAssistant(input.question, input.mask, input.history);
        await appendLedger("ai_ask", res.highlights[0]?.eid ?? null, `AI问答：${input.question.slice(0, 80)}${input.mask ? "（脱敏）" : ""}`, ctx.user.name ?? ctx.user.openId);
        return res;
      }),

    /**
     * 情报半自动解析（迭代7）：解析用户粘贴的公开工商信息文本 → 对齐回填模板字段的结构化数据。
     * 合规：仅解析粘贴文本，系统不访问外网/不调用第三方 API（正式版预留 IntelProvider 插槽）。
     * 写入仍走 importEnrichment 通道（预览确认后前端二次调用），保证校验/复算/台账链路一致。
     */
    parseIntel: protectedProcedure
      .input(z.object({
        eid: z.string().min(1),
        text: z.string().min(30, "粘贴文本过短，请粘贴完整的公开工商信息页面文本").max(20000),
      }))
      .mutation(async ({ input, ctx }) => {
        const items = await loadEntities();
        const target = items.find((x) => x.eid === input.eid);
        if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "企业不存在" });
        const parsed = await parseIntelText(target.name, input.text);
        await appendLedger("ai_parse_intel", input.eid, `AI解析工商文本：${target.name}（置信度${parsed.confidence}，疑点${parsed.warnings.length}条）`, ctx.user.name ?? ctx.user.openId);
        // Excel 片段：与回填模板列序对齐（eid、企业名称、USCC、注册资本、成立、参保、法人、在招、岗位、薪资、专利、软著、高企、融资）
        const tsv = [
          input.eid, target.name, parsed.uscc ?? "", parsed.regCapital ?? "", parsed.founded ?? "",
          parsed.insured ?? "", parsed.legalRep ?? "", parsed.jobs ?? "", parsed.topJobs ?? "",
          parsed.salaryRange ?? "", parsed.patents ?? "", parsed.softCopyrights ?? "", parsed.hiTech ?? "", parsed.funding ?? "",
        ].join("\t");
        return { parsed, row: { eid: input.eid, name: target.name, ...parsed }, tsv };
      }),

    /**
     * 批量解析（迭代8）：一次粘贴多家企业公开文本 → LLM 切分识别多主体 → 逐家抽取 →
     * 自动匹配园区主体（精确/模糊/未匹配三态，前端可手动修正）。
     * 写入仍走 importEnrichment 通道（预览勾选确认后一并提交），校验/复算/台账链路一致。
     */
    parseIntelBatch: protectedProcedure
      .input(z.object({
        text: z.string().min(50, "粘贴文本过短，请粘贴多家企业的完整公开工商信息文本").max(60000),
      }))
      .mutation(async ({ input, ctx }) => {
        const entities = await loadEntities();
        const parsedList = await parseIntelBatch(input.text);
        if (parsedList.length === 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "未能从文本中识别出企业主体，请确认粘贴的是公开工商信息页面内容" });
        }
        const rows = parsedList.map((p) => {
          const m = matchEntity(p.companyName, entities);
          return {
            parsedName: p.companyName,
            eid: m.eid,
            matchedName: m.matchedName,
            exact: m.exact,
            parsed: p,
          };
        });
        const matched = rows.filter((r) => r.eid).length;
        await appendLedger(
          "ai_parse_intel_batch", null,
          `AI批量解析工商文本：识别 ${parsedList.length} 家，自动匹配园区主体 ${matched} 家`,
          ctx.user.name ?? ctx.user.openId,
        );
        return { rows, total: parsedList.length, matched };
      }),
  }),
});
