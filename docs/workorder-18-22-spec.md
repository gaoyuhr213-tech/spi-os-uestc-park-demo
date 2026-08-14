# 工单书 3-9 关键要求速查（源：SPI-OS_Manus迭代17-22工单书_v1.pdf）

## 工单3 · 迭代18 · 真事件溯源 Ledger（P0，ADR-01/16）
- decisionLedger.ts：append-or-abort 语义（写失败必须中止业务动作，不静默）
- decisions 补 based_on 完整溯源链：signals/rules/rule_version/evidence 引用
- trace API：给定 decisionId 返回完整证据链（数据→规则→评分→决策→执行→结果）
- ProvenanceDrawer 前端：一键查看任意决策的溯源链
- 验收：决策创建必带 based_on；ledger 写失败业务动作中止；trace 可从 outcome 回溯到最初 signal

## 工单4 · 迭代18 · 安全合规产品化（P0，ADR-04）
- authz.ts：RBAC-ABAC 中间件（role + 属性策略：数据分级/部门/场景）
- consents 表：PIPL 同意管理（主体/范围/有效期/撤回）
- 字段级分级脱敏：敏感字段按角色+同意状态输出
- 治理页：策略配置 UI
- 验收：未授权角色读敏感字段被拒；同意撤回后字段自动脱敏；审计可查每次访问

## 工单5 · 迭代19 · 多租户就绪（P0，ADR-02/07/10）
- 业务表 + tenant_id（默认 'uestc'）；TenantContext 注入 ctx
- 仓储层强制租户过滤（不依赖调用方记得加 where）
- 双租户隔离 vitest：租户A读不到租户B数据
- 验收：跨租户读写被拦截；现有单租户功能零回归

## 工单6 · 迭代20 · 图谱智能升级（P1，Cap-03 TD-06）
- PathFinder：Top-3 最短可信路径，路径分=关系强度×新近度×意愿
- CommunityDetection：电子科大系/同园强连通子图
- _core/llm.ts 生成节点 embedding 存 JSON，语义相似召回
- /referral：每个 P0 账户 ≥1 条二度内暖引荐路径 + 话术草稿
- 验收：P0 全覆盖路径；路径分可解释；语义召回找同类企业

## 工单7 · 迭代20 · Agent Runtime + LLM Gateway（P1）
- llmGateway.ts：统一入口按 config 路由可插拔模型（Claude/GPT/Qwen/DeepSeek/GLM），业务代码不绑定具体模型
- 三类 Agent（研究/匹配/触达）统一 Tool Contract
- 护栏：提示注入检测 + 越权拦截 + 关键动作强制人审 HITL
- server/agentEval.test.ts 评测集：固定输入回归输出质量
- 验收：切换模型不改业务代码；注入样例被拦截；关键动作人审；评测集通过

## 工单8 · 迭代21 · 工作流引擎（P1，Cap-07，依赖工单3）
- workflowEngine.ts：WorkflowRuntime（已批准决策→配置化多步流程，流程定义存 DB）
- TaskManager：人工任务分派 + SLA 计时超时自动升级
- SagaCoordinator：步骤失败补偿、步骤幂等、长事务一致性
- schema +workflowInstances/+tasks；/tasks 页流程实例+SLA 倒计时
- 约束：ADR-15 失败不得默认 Success
- 验收：决策可编排为带 SLA 多步流程；超时升级；失败触发补偿；步骤幂等（重放不重复）

## 工单9 · 迭代22 · 学习引擎（P2，Cap-10，依赖工单3）
- learningEngine.ts：OutcomeCollector（won/lost/partial→训练标签）
- 离线重估 12 维权重（逻辑回归/GBDT 简化可用），生成 challenger 版本
- champion-challenger 对照回测 + 人审晋升 → 写 ruleConfigs 新版本（复用现有版本机制）
- 模型血缘入 provenance：数据→训练→回测→晋升→审批人
- schema +scoreModels；Rules.tsx champion-challenger UI
- 约束：权重更新可解释、人审晋升、不得自动上线
- 验收：回填后权重可解释更新；challenger 人审晋升；晋升写 ruleConfigs 可回滚；血缘可溯源

## 全局铁律（工单书）
- 在现有代码上升级不重造；锁死顺序 17→22；每迭代独立测试发布
- 失败不得静默 Success；关键动作 HITL；全程台账留痕
