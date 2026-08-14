# 迭代23-26 工单规格摘要（源：SPI-OS_Manus迭代23-26工单书_v1.pdf）

总目标：把 9 个能力串成「能进政府门、能演示溯源、能收首笔款的可交付闭环」。锁死顺序：迭代23全绿才能进24。
不归 Manus：API key 采购、达梦/OB 生产部署、等保认证、签约。只做「代码就绪、可离线部署、可演示」。

## 工单10（迭代23,P0）端到端 Decision Pipeline 集成
- 新建 server/pipelineOrchestrator.ts，按 ADR-11 十段：Entity→Profile→Signal→Graph→Score→Decision→Workflow→Agent→Outcome→Learning，每段声明上下游
- 事件驱动串联：EntityMerged→ProfileUpdated→SignalDetected→EdgeAsserted→ScoreComputed→DecisionProposed→WorkflowStarted→SuggestionProduced→OutcomeRecorded→ModelRecalibrated
- 一次导入触发全链；断链显式报错不得静默；iteration23.test.ts 覆盖十段
- DecisionCenter.tsx 串联视图
- 验收：①导入触发十段每段事件可见 ②集成测试全绿 ③人为断 Score 段显式报错 ④park_eid 十段一致可追溯

## 工单11（迭代23,P0）回归验收 Harness
- server/acceptance/*.test.ts 覆盖工单1-9 全部验收（约36条），断言对齐原工单口径，不得弱化
- scripts/acceptanceReport.ts 生成 docs/acceptance-report.md 逐条 PASS/FAIL+证据
- 任一 FAIL 即红阻断；可重复运行结果稳定

## 工单12（迭代23,P0）一键演示脚本+溯源钻取
- server/demoSeed.ts 一键灌入一家真实企业全链数据（公开信息、对外脱敏）
- client DemoMode 引导式演示：分步十段，每步一句话结论，10秒讲清决策 why
- 溯源抽屉逐跳钻到 signal→connector→ingestionJob 原始证据
- prefers-reduced-motion 兼容
- 验收：①一键可重复 ②每跳可点下钻 ③10秒why ④演示脱敏正确

## 工单13（迭代24,P0）真连接器+69家回填复算
- server/connectors/qccConnector.ts（企查查/天眼查）+ jobBoardConnector.ts 实装；key 从 server/_core/env.ts 读，严禁硬编码
- 经 ACL 入本体；69家批量 ingest；低置信入消歧队列；回填后自动复算评分+信号刷新（复用管道）
- 无 key 优雅降级手工回填不崩溃
- 验收：①有 key 时关键字段回填≥90% ②去重≥99% ③无 key 回退不崩 ④复算更新雷达

## 工单14（迭代25,P0）容器化交付包+国产库适配
- Dockerfile + docker-compose.yml 一条命令拉起全栈；.env/config 包切换园区零代码
- server/db.ts 抽象方言，适配达梦或 OceanBase 至少一款，迁移+CRUD 跑通
- 单租户物理隔离部署形态；docs/deploy.md 离线安装手册
- 验收：①一条命令拉起 ②国产库迁移+回归通过 ③两租户独立部署不交叉 ④离线可部署

## 工单15（迭代25,P1）可观测性+ORS
- server/observability.ts：/health + 指标（ingestion_rate/score_latency/decision_rate/ledger_lag）
- 结构化日志 + trace id 贯穿 pipeline；审计看板（导入/决策/审批/规则变更可查）
- docs/ors/*.md 每能力 Runbook：症状→诊断→处置→升级

## 工单16（迭代26,P1）ROI 看板+决策归因
- server/attribution.ts 归因引擎（决策/信号/触点→成交，关联 provenance）
- client/src/pages/ROI.tsx：投入vs回款按 revenueTier 拆分、趋势+漏斗、一键导出、数字可点溯源回 decision
- 复用 flywheel.ts 与工单3溯源链

## 工单17（迭代26,P1）脱敏路演模式+一键新园区
- 路演模式：字段级脱敏+锁定深色作战台（复用现有美学）
- server/parkProvision.ts：一键新建租户+加载配置包+seed 样例数据，开园计时（验证 ADR-14 复制周期）
- deploy/config/park-template/*；新园区独立数据/配置零代码
- 验收：①路演脱敏+锁作战台 ②一键开园可计时 ③独立互不可见 ④零代码
