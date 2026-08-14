# 迭代16 · V3 升维进度笔记（防上下文压缩）

## 审计
- docs/v3-audit.md 已完成：七视图 + 18 项 P0/P1/P2 + 重构 IA + 四波蓝图

## 波次一（已完成代码）Decision Engine 2.0
- server/decisionEngine2.ts：buildDecisionCard9（九要素：score/evidence[分渠道]/reason/confidence[4渠道加权 w35/25/20/20]/risks/opportunity/action/impact/learning+counterfactual）+ buildDecisionHealth（五维：velocity中位采纳时长/quality won占比/impact成交万元/roi采纳率/learning回流覆盖 + overall 加权 20/25/15/20/20）+ typeHitRate（Learning 回流参与置信度 = Policy Update 闭环）
- park.decision.card9（public）/ park.decision.health（public）
- client DecisionCard9Panel.tsx 挂在决策卡展开区（替换原扁平原因链）；DecisionCenter 加 Health 五维条
- API 实测：score 87 / confidence 58 / evidence 6 / breakdown 4渠道 / health overall 47

## 波次二（待做）Scenario OS
- [已完成后端] scenarioEngine.ts：SCENARIOS 注册表（attract/cultivate/talent/fund 4开箱 + lowaltitude/coldchain/crossborder 3扩展位）；buildScenarioBoard（场景卡：KPI+Top3企业+decisionQuestion）；buildScenarioWorkspace（决策队列12+资源6+需求侧写）
- [已完成] park.decision.scenarios / park.decision.scenarioWorkspace 路由
- [待做前端] Scenarios.tsx 新首页（/ 路由改指向；原 Home 移至 /park-health）；导航分区：作业域（场景/决策/情报三屏/推演/任务）+ 治理域（规则/资源/市场）；App.tsx 路由 / → Scenarios；Home path=/park-health；ScreenLayout NAV 重组 + i18n

## V3 提示词十阶段核心要求（防压缩备忘）
1审计七视图；2 Scenario OS 首页（Dashboard 非首页）；3 Decision Engine 九要素卡；4 Explainability（Evidence Graph+Counterfactual）；5 Graph=计算引擎（What-if：税收/就业/招商/产业链/面积/人才/政策）；6 Simulation Center（政策/招商/产业/基金/资源/ROI 模拟）；7 Organizational Memory（会议/电话/拜访/合同长期记忆，AI 自动引用）；8 Multi-Agent（Scout/Research/Industry/Policy/Investment/Execution/Review/Learning 八 Agent，职责/输入/输出/协作）；9 Decision Loop（Signal→Evidence→Decision→Execution→Outcome→Learning→Policy Update→Next）；10 Decision Marketplace（Playbook/Agent/Workflow/Industry Graph/Scenario Package/Template）。
Hard Constraints：无装饰动画；不降低决策效率；每模块回答帮助完成哪个决策；AI 推荐必须证据链+置信度+下一步；减少点击/上下文切换；北美企业级设计规范一致性。
评审意见（pasted_content_4）五优先级：Decision Engine 2.0 > Scenario OS > Graph+Explainability > Simulation > Marketplace+Agent Store。数字孪生（Digital Park）为第九类建议——楼宇/楼层/热力已有雏形（屏一楼宇热力），暂不单独立项。

## 波次三（待做）Graph What-if + Simulation
- server/graphCompute.ts：whatIfEntity(eid, action=add/remove) → 税收/就业/面积/人才/产业链五维传导（系数【假设】标注）
- Simulation.tsx：/simulation 招商模拟（引进 N 家 X 行业）/政策模拟/资源配置模拟

## 波次四（待做）Memory + Agent + Marketplace
- server/memory.ts：统一记忆检索（ledger+parseHistory+decisions+signals 跨表检索 API）
- server/agents.ts：8 Agent 注册表（职责/输入/输出/协作）+ 映射现有自动化为 Agent 运行日志
- Marketplace 页（治理域）：Playbook/决策模板/场景包 目录（种子数据）

## 关键提醒
- 生产域名 uestcpark-cizb47ei.manus.space；上检查点 a9a35458；vitest 目前 102 + 新增
- 决策feed现有分组卡在 DecisionCenter.tsx；抽屉=EntityDrawer；导航=ScreenLayout NAV + i18n nav 词条

## 波次二完成记录
- Scenarios.tsx 新首页（/ 路由）：4 开箱场景卡（decisionQuestion+KPI+Top3+Agents）+ 3 扩展位 + 单场景 Workspace（决策队列/需求侧写/资源池/Agent）；Home 移至 /park-health；NAV 首位=场景中枢；i18n navScenario/numScenario 已加
- 截图验证：场景卡与屏一均正常渲染，路由无冲突

## 波次三后端完成记录
- server/graphCompute.ts：whatIfEntity（五维传导：税收/就业/面积/人才/产业链，IND_COEF 行业系数标注【假设】，产业链传导用 loadGraph edges from/to/relType，企业节点 key=eid，脱敏由 loadGraph 内部处理）；simulateAttract(ind,n,size)/simulatePolicy(coverage)/simulateResource() 三模拟器返回 SimResult{inputs/outputs/timeline/risks/assumption}
- park.decision.whatIf / park.decision.simulate（discriminatedUnion kind）已接入，API 实测 E703 remove：-202.5万税收/-45就业/释放540㎡
- [待做前端] Simulation.tsx（/simulation）：What-if 企业选择器 + 三模拟器表单/结果卡；NAV 作业域加「推演中心」（navSim/numSim i18n）；屏三节点可跳 What-if
- 检查点 4450a6e5 = 波次一+二已发布

## 波次三前端完成记录
- Simulation.tsx（/simulation，NAV「推演」位于屏三与任务之间）：左 What-if（企业下拉+流失/引入切换，五维卡+产业链传导明细）；右三模拟器 Tab（招商 ind/n/size、政策 coverage 滑杆、资源无参）。截图验证：招商模拟 5家AI×30人 → +675万税收/+150就业/1800㎡/105技术岗/约2单撮合
- 待做波次四：memories 表+Organizational Memory（企业360历史Tab升级）、agents 运行台（8 Agent 注册表+决策卡标注生成 Agent）、Marketplace 页（Playbook/Scenario Package/Agent 商品卡）

## 波次四完成记录
- server/memoryEngine.ts：searchMemory 五源合并（opsLedger/decisions/parseHistory/lifecycleEvents/taskCompletions，字段 actor/sourceType/targetEid，getDb 判空）+ memoryStats
- server/agentRegistry.ts：AGENTS 8个（scout/research/industry/policy/investment/execution/review/learning，role/inputs/outputs/collaborators/engine/loopStage），buildAgentBoard 从台账/决策/解析推断 lastActivity
- server/marketplace.ts：MARKET_CATALOG 8 商品六类（playbook/agent/workflow/graph/scenario/template，pricing 标注【假设】）
- 路由：park.decision.memorySearch/memoryStats/agentBoard/marketplace
- Governance.tsx（/governance，NAV「治理」在任务后）三 Tab：组织记忆（检索框+统计+彩点时间流）/ Agent 运行台（Loop 泳道+8卡）/ Marketplace（商品卡）
- API 实测：agents 8 个 research last=解析写入 E703；market 8 items 6 cats；治理页截图正常
- 剩余 Phase 6：iteration16.test.ts 补波次二三四用例（scenarios/whatIf/simulate/memory/agents/market）→ pnpm test → pnpm build → 检查点+交付（附 docs/v3-audit.md）
