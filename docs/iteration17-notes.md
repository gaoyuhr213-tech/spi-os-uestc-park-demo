# 迭代17 完成记录（工单1+2）
- 表：connectors/ingestionJobs/mergeDecisions（webdev_execute_sql 建表）
- server/aclTransform.ts：ACL 防腐层（3 adapter transform + parseCsvText + ingestViaAcl 唯一入库通道）
- server/entityResolution.ts：normalizeName/aliasResolve/diceSimilarity/matchEntity（USCC=100/全等92/包含80/dice*85）+ resolveIncoming（≥90 auto / 60-89 queue）+ scanExistingDuplicates + decideMerge（confirm/split/dismiss/revert）
- park.ts：connector.registry/jobs/ingest + resolution.scan/queue/decide/match
- 前端：/connectors 数据接入中心（状态卡+摄入+消歧队列+job表）；侧栏管理员区入口
- 测试：iteration17.test.ts 13 用例全过；全量 130/130
- 注意：消歧队列的「人工消歧队列页」并入 /connectors 页（未单独建 Disambiguation.tsx，功能完整）

# 迭代18 进度（工单3+4）
## 已完成后端
- schema decisions +basedOn 列（SQL 已应用）；consents/accessPolicies 表已建
- server/decisionLedger.ts：appendOrAbort（LedgerWriteError 中止业务）/ snapshotRuleVersions / traceDecision（数据→规则→评分→决策→执行→结果，含版本漂移对照）
- decisionEngine.generateDecisions：创建必带 basedOn（signals/rules/ruleVersions/evidence/canvas/lifecycle/score）+ 批次 appendOrAbort
- decisionEngine.transitionDecision：+actor 参数，状态流转 appendOrAbort（[D#id] 标记），台账失败回滚业务更新
- server/authz.ts：FIELD_CLASSIFICATION 四级（public/business/sensitive/pii）、DEFAULT_POLICIES（admin pii 需同意；user sensitive=mask，pii=deny）、seedPolicies/listPolicies/updatePolicy、grantConsent/revokeConsent/listConsents（scope→fields 映射）、authorizeFields 主入口（allow/mask/deny + requires_consent 降级 + field_access 审计）
- park.ts：decision.trace API；authz 路由（policies/updatePolicy/consents/grantConsent/revokeConsent/readEnrichment）
## 待办前端
- Governance.tsx 加第四 Tab「安全合规」（策略配置 + 同意管理）；tab 类型加 "authz"
- DecisionCenter 决策卡加「溯源」按钮（decision.trace → ProvenanceDrawer 或复用 DecisionCard9Panel 展开区）
- iteration18.test.ts：trace 完整链/appendOrAbort 语义/授权矩阵（user 读 sensitive=mask、pii 剔除；admin pii 无同意=mask、有同意=原值；撤回后自动降级）
- Governance tab 现为 "memory"|"agents"|"market" 三值，位于 client/src/pages/Governance.tsx（172行）

## 迭代18 完成（2026-07-31）
- 前端：Governance 第四 Tab「安全合规」（策略矩阵点击轮换 allow→mask→deny，仅 admin；同意授权表单+撤回列表）；DecisionCard9Panel 追加 TraceBlock（五层链路：数据/规则版本漂移/评分对照/执行轨迹/结果）
- 测试：iteration18.test.ts 9 用例全过；全量 139/139；生产构建通过
- 验证：治理页组织记忆可见 decision_generate「均带 basedOn 溯源链」与 [D#id] 流转台账

## 迭代19 完成（2026-07-31）
- 16 张业务表 +tenantId（默认 uestc，带索引；node 脚本迁移，drizzle-kit migrate 因既有表 CREATE 冲突不可用）
- server/tenantContext.ts：AsyncLocalStorage TenantContext + tenantWhere() 仓储强制过滤 + withTenantValues() 写入附着 + 非法租户回退默认（防注入）
- park.authz.tenant API 暴露当前租户
- iteration19.test.ts 6 用例：双租户隔离/写入附着/存量归属默认租户/非法ID回退，全过；全量 145/145

## 迭代20 进行中（工单6+7）
- 工单6：server/graphIntel.ts（findScoredPaths 路径分=强度几何平均×新近度×意愿 / detectCommunities 连通分量+锚点 / findSimilarEntities 结构化特征向量余弦 / buildP0ReferralCoverage 二度=≤3跳含2中间人）
- 工单7：server/llmGateway.ts（GATEWAY_CONFIG 三档位 fast=gemini-2.5-flash quality/reasoning=claude-sonnet-4-5；detectInjection 7 模式；checkOutput 越权承诺拦截；gatewayInvoke 双护栏+llm_blocked 台账）
- 工单7：server/agentRuntime.ts（TOOL_REGISTRY 8 工具三 Agent：research/match/outreach；high 风险 send_outreach/commit_deal 强制 HITL 挡下；runAgentTool 统一入口 ADR-15 失败不静默）
- park.ts 路由：park.graphIntel.{paths,communities,similar,p0Coverage} + park.agent.{tools,run}（run 需登录，双注入检测）
- 测试：server/agentEval.test.ts（评测集：注入样例5攻击3良性/HITL/配置/确定性工具回归）+ server/iteration20.test.ts（PathFinder/社区/召回/P0全覆盖）
- 待办：前端接入（屏三 Referral 加 PathFinder 面板/治理页 Agent 运行台加试运行）+ 全量回归 + 检查点
- 注意：console 里 tenantid 报错是迁移前旧日志，现已正常
- todo.md 剩余未勾：346-347 行（工单6/7）、350（工单8）、353（工单9）、356（全链回归交付）
- 迭代20 完成：前端已接入（Referral.tsx PathFinder Top-3 路径分+语义召回+关系社区 / Governance.tsx AgentRunPanel 试运行台），162/162 测试通过，生产构建通过

## 迭代21 进行中（工单8 工作流引擎）
- schema 已加三表并 DDL 建库：workflowDefs（defKey/name/decisionType/stepsJson/active/version）/ workflowInstances（defKey/decisionId/eid/status running|done|failed|compensated/currentStep/stepStatesJson/startedBy）/ workflowTasks（instanceId/stepIndex/title/assignee/status open|done|escalated|cancelled/slaHours/dueAt/escalatedTo/doneAt）
- server/workflowEngine.ts 已建：seedWorkflowDefs（3 定义：wf_referral_outreach 引荐4步/wf_hr_service HR4步/wf_generic 通用3步，步骤含 kind human|auto/slaHours/escalateTo/compensation）；startWorkflow（adopted/executing 决策触发，同决策幂等一次）；advanceInstance（auto 步自动完成递归推进，human 步生成 SLA 任务幂等）；completeTask（done 幂等重放不重复；failed → Saga）；compensateInstance（逆序补偿 done 步 → compensated，pending/running → skipped，open 任务取消，台账 wf_compensate）；escalateOverdueTasks（dueAt 过期 open → escalated，升级至 escalateTo，台账 wf_escalate）；listInstances/listOpenTasks
- 待办：park.ts 挂路由（workflow.start/instances/tasks/completeTask/escalate）→ /tasks 页加流程实例+SLA 倒计时区块 → iteration21 测试（幂等/补偿/超时升级）→ 全量回归 → 检查点
- 验收：决策可编排为带 SLA 多步流程；超时升级；失败触发补偿；步骤幂等（重放不重复）
- todo.md 350 行工单8未勾；353 工单9未勾；356 全链回归未勾
- 工单9 要点（迭代22）：learningEngine.ts OutcomeCollector（won/lost/partial→标签）+ 逻辑回归简化重估 12 维权重 → challenger 版本 + champion-challenger 回测对照 + 人审晋升写 ruleConfigs 新版本（复用版本机制，可回滚）+ 血缘入 provenance + schema +scoreModels + Rules.tsx UI；约束：可解释、人审、不得自动上线
- 迭代21 完成：workflow 路由（start/instances/tasks/completeTask/escalate）+ Tasks.tsx WorkflowStrip + DecisionCenter 编排流程按钮；iteration21 8 测试通过；全量 170/170；构建通过
- 迭代22 完成：learningEngine.ts（OutcomeCollector/白盒重估/champion-challenger 回测/人审晋升写 scoring 新版本/血缘）+ scoreModels 表 + learning 路由 + LearningLabCard（规则中心）；iteration22 6 测试；全量 176/176；构建通过
