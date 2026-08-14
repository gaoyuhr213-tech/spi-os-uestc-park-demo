# 迭代23-26 实施进度笔记（防压缩）

工单规格详见 docs/workorder-23-26-spec.md（已保存全部 8 张工单要求与验收）。

## 迭代23 · 工单10 端到端 Pipeline
- server/pipelineOrchestrator.ts 已建：runPipeline（十段事件驱动，PipelineStageError 显式报错中止，STAGE_BREAKER 测试断链注入，事件流落 opsLedger action=pipeline_run/pipeline_run_failed，afterJson 存 events）+ listPipelineRuns
- 关键签名备忘：
  - ingestViaAcl({adapterId, rawRows, triggeredBy}) → IngestResult{jobId,rowsIn,rowsOut,rowsSkipped,resolutions,error}
  - resolveIncoming(draft, actor) → {kind:auto/queued/unmatched, eid, confidence, mergeId}
  - calcEntity(x: CalcInput, rules) → CalcResult{score,tier,...}（ruleEngine，非 calcLead）
  - generateDecisions(actor) → {created,skipped}；transitionDecision(opts)
  - seedWorkflowDefs(); startWorkflow(decisionId, actor); workflowDefs 字段=defKey/name/decisionType/stepsJson
  - runAgentTool(tool,{eid,actor}) → AgentRunResult{ok,requiresHuman,humanGateNote,output,error}
  - collectOutcomes() → OutcomeSample[]；scoreModels 表
  - enrichments 字段名：insured/jobs/patents/softCopyrights（非 insuredCount/openJobs）
  - opsLedger 字段：targetEid（非 target）、detail/actor/beforeJson/afterJson
- 待办：park.ts 挂 pipeline 路由（run/runs）→ DecisionCenter 串联视图 → iteration23.test.ts 十段集成测试（含断链显式报错、park_eid 一致性）

## 后续工单要点（详见 spec 文件）
- 工单11：server/acceptance/*.test.ts 36条 + scripts/acceptanceReport.ts → docs/acceptance-report.md
- 工单12：server/demoSeed.ts + DemoMode 引导 + 溯源钻取 signal→connector→ingestionJob
- 工单13：server/connectors/qccConnector.ts + jobBoardConnector.ts（env key 缺失优雅降级）+ 69家批量
- 工单14：Dockerfile/compose/deploy config/db 方言(OceanBase MySQL 兼容)/docs/deploy.md
- 工单15：server/observability.ts /health+metrics+traceId + Governance 审计看板 + docs/ors/*.md
- 工单16：server/attribution.ts + client/src/pages/ROI.tsx（revenueTier 拆分/漏斗/导出/点击溯源）
- 工单17：parkProvision.ts 一键开园计时 + deploy/config/park-template + 路演模式增强

## 工单11（已完成 · checkpoint e803daa8）
- server/acceptance/workorders.test.ts：36/36 通过，重复运行稳定；actor=acceptance-harness，afterAll 清理
- scripts/acceptanceReport.ts → docs/acceptance-report.md：vitest JSON reporter 逐条 PASS/FAIL+证据，FAIL 非零退出码
- grantConsent 升级：返回 { ok, id }（insertId）；全量回归 216/216

## 工单12（进行中）
- server/demoSeed.ts：runDemoSeed()（DEMO_ACTOR="demo-seed"，DEMO_EID="E703" 成都眸视科技）
  两次摄入：biz-registry（工商）+ job-board（招聘，表头=企业名称/在招岗位数/核心岗位/薪资范围）
  幂等：先清 triggeredBy=demo-seed 的 jobs 与 actor=demo-seed 的台账；返回 {ok, cleaned, runs, pipeline, story[10]}
- server/provenanceTrace.ts：traceSignalProvenance(eid, signalText) → {found, hops[signal→connector→ingestionJob]}
  信号不在主体轴 → found=false 且明示实勘/手工（不伪造）
- server/demoSeed.test.ts：5/5 通过（幂等/钻取三跳/非伪造/10段story/脱敏）
- tRPC：park.demo.seed（mutation）/ park.demo.provenance（query {eid, signalText}）
- 前端：DemoMode.tsx（DecisionCenter「一键演示」按钮，方向键翻步，STAGE_WHY 十段 why 文案）
  ProvenanceDrawer.tsx（EntityDrawer 信号Tab 每条信号「溯源」按钮，i18n key=provDrill）
  动画均 motion-reduce 兼容
- 待办：截图验证 UI → 全量回归 → checkpoint

## 工单13（已完成）
- server/connectors/externalTypes.ts + qccConnector.ts（QCC ECIV4 MD5 token 鉴权，env: QCC_API_KEY/QCC_SECRET_KEY/QCC_API_BASE）+ jobBoardApiConnector.ts（env: JOB_BOARD_API_KEY/JOB_BOARD_API_BASE）
- 无 key → ExternalFetchResult{degraded:true, degradedReason} 不抛异常
- server/connectors/backfillOrchestrator.ts：runBackfill(actor)（69家名录→双源取数→ingestViaAcl→消歧队列统计→buildSnapshot复算P0/P1/均分→opsLedger action=backfill_run）+ externalConnectorStatus()
- tRPC：park.connector.external（query）/ park.connector.backfill（adminProcedure mutation）
- 前端：Connectors.tsx ExternalBackfillPanel（key状态卡 live/降级 + 管理员批量回填按钮 + 回填报告）
- server/iteration24.test.ts 4/4（降级不崩/复算台账/去重100%/ACL映射契约）
