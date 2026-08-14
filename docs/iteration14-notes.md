# 迭代14 实施笔记（内部进度）

## 用户四项需求
1. 决策中心加「负责人指派下拉」（多人协作分单，非仅指派给自己）
2. Outcome 回填加成交金额字段，ROI 从比率升级为金额口径（对齐六层收入模型报表）
3. 资源库管理页（管理员增删资源/容量维护），Marketplace 供给侧可运营
4. 修复企业360抽屉头部重叠 BUG（用户截图：企业名/P0徽章/已约见 与 Lead评分97/100(+9)/Tab栏/行业标签叠压穿透）+ 全站同类隐藏 BUG 全量审计修复

## 重叠 BUG 根因分析
- 用户截图窗口宽度约 489px（sm 断点 640px 以下），SheetContent 为 w-full；SheetTitle 原为 flex flex-wrap，长企业名+TierTag+StageTag 在窄视口折行，与下方 Lead评分行、Tab 栏（-mb-px 负边距）视觉叠压
- 已修复：SheetTitle 改为 inline 布局（企业名 span + 徽章组 whitespace-nowrap ml-2），去掉 flex-wrap；桌面端浏览器验证抽屉头部正常（截图确认：名称行、意图标签行、元信息行、Tab 行各自独立无叠压）
- 桌面端 1280 浏览器实测抽屉打开正常，无重叠；用户截图疑似移动端/窄窗口场景

## 全站同类审计点（待查）
- [ ] ExplainSheet 头部（同样 Sheet 结构）
- [ ] DecisionCenter 卡片长企业名截断
- [ ] 屏三 chains 面板窄视口
- [ ] toast action 长文本
- [ ] 移动端 375px 抽屉四 Tab 行溢出

## 后端待办
- park.members API（成员名单：从 users 表取 + OWNER_NAME 兜底）
- transition 支持 assignee 参数（adopted 时可指派任意成员）
- outcome 加 dealAmount（分/元？定：元，integer）；roi 加金额口径（byRevenueTier 金额聚合）
- resources CRUD（adminProcedure：create/update/toggle，台账留痕 resource_manage）

## 前端待办
- DecisionCenter 采纳按钮 → 指派下拉（成员名单）；OutcomeForm 加金额输入
- ROI 统计条加累计成交额 + 分层收入金额
- /resources 管理页（管理员，ScreenLayout 侧栏 rulesCenter 旁加入口）

## 关键文件
- server/decisionEngine.ts（transitionDecision/buildDecisionRoi）
- server/resourceMatch.ts（RESOURCE_SEEDS/matchResources）
- client/src/pages/DecisionCenter.tsx（OutcomeForm 在文件尾部）
- drizzle/schema.ts decisions 表已有 outcomeNote/assignee 字段；需确认是否有 dealAmount 字段（无则加迁移）
