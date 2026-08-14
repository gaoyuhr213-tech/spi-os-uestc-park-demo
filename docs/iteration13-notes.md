# 迭代13 实施笔记（内部进度，防上下文丢失）

## 用户核心指令（原文要点）
1. 拆解研读上传的来源提示词（pasted_content_3.txt：12模块建议）+《科创园区决策智能操作系统》PDF（六层收入模型+商业飞轮）
2. 审计原型决策闭环（对标 Palantir/6sense/Salesforce/Workday/ServiceNow/LinkedIn/ZoomInfo）——不加页面，加 Decision Loop
3. 补全业务/商业模式闭环。北极星：每个需求被识别→转化为可执行决策→自动匹配资源→形成可量化结果→沉淀学习能力
4. **用户已授权新增页面**（由我对标决策）→ 决定新增独立「决策中心 Decision Center」页面作为全站动线入口

## 附件要点（已研读）
- 12模块：①企业生命周期 ②需求画布 ③商机流水线 ④资源匹配 ⑤暖引荐 ⑥决策工作台 ⑦Service Marketplace ⑧Decision Playbook ⑨健康分 ⑩协作时间线 ⑪Enterprise Memory ⑫Outcome Learning + Decision Center（最重要）+ Decision Marketplace（商业飞轮：Need→Decision→Matching→Service→Outcome→Revenue→Learning）
- 商业模式：六层收入（订阅ARR/AI能力计费/Marketplace撮合佣金/产业运营/决策咨询/数据增值-授权分析），竞争策略=重新定义赛道为 Decision Intelligence Platform

## 已完成（后端）
- docs/decision-loop-audit.md 审计报告（六环节判定：识别✅ 决策⚠️ 匹配❌ 执行⚠️ 结果⚠️ 学习⚠️）
- drizzle/schema.ts：decisions 表（dtype 5类/状态机/genKey幂等/outcome/revenueTier归因）+ resources 表（rtype 9类/needTags/indTags/stageTags/capacity）— 迁移 0005 已应用
- server/decisionEngine.ts：buildNeedCanvas（7维需求画布）/ inferLifecycle（9段生命周期）/ draftDecisions（5类决策草案）/ generateDecisions（幂等生成）/ buildDecisionFeed（分组聚合）/ transitionDecision（状态机，done必须回填outcome）/ buildDecisionRoi（决策级ROI）/ buildEntityDecisionProfile（企业决策画像）
- server/resourceMatch.ts：12条资源种子（高于人力×2/教授×2/导师/校友会/投资人/律所/财税/服务商×2/猎头），matchResources 打分=needTag必配40+行业30+阶段20+容量10
- server/flywheel.ts：新增 decisionLearning（按决策类型 done/won 命中统计+校准提示）
- server/routers/park.ts：park.decision 路由（feed/roi/entityProfile 公开；generate/transition 登录+台账；resources 公开）
- server/iteration13.test.ts 已写（画布/生命周期/草案/匹配/幂等/状态机/ROI/画像/飞轮学习）
- API 已验证：decision.roi 空态 OK；decision.resources 播种 12 条 OK

## Phase 4/5 完成记录
- DecisionCenter.tsx 已建（/decision 路由，导航首位「中枢」）；EntityDrawer 决策 Tab 已嵌 DecisionProfilePane（画布/生命周期/决策清单）
- Tasks.tsx 已加 DecisionExecStrip 决策执行承接区；FlywheelCard 已加决策级学习表
- 测试 90/90 通过，生产构建通过；E703 画像 API 验证 OK（成长期/人才5星/2条决策）

## 关键约定
- 决策状态机：suggested→adopted→executing→done/dismissed；done 必须带 outcome(won/lost/partial)
- DTYPE_LABEL：contact立即联系/mentor安排导师/hr_service推荐HR服务/policy政策申报辅导/referral校友暖引荐
- 收入归因 DTYPE_REVENUE：hr_service+referral→marketplace；contact+mentor→operation；policy→consulting
- NEED_LABEL：talent人才/funding融资/policy政策/market市场/rnd研发/digital数字化/legal法务
