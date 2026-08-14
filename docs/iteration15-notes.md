# 迭代15 进度笔记（防上下文压缩）

## 需求（用户原话四项）
1. 决策中心「我的决策」筛选视图（按负责人过滤）
2. 资源容量自动扣减：执行中占用、完成后释放，避免超额派单
3. 月度经营报表：按成员/资源/决策类型汇总成交金额与转化率，导出 Excel
4. 抽屉 Header 叠压 BUG 根治（硬性约束：Flex 文档流重构 + 全域排查清单 + 回归测试）

## Phase 1 已完成（Header 根治）
- **真根因（量化实证）**：模板 `.flex { min-height: 0 }` × SheetContent flex-col 固定高容器 → SheetHeader 默认 flex-shrink:1 被压缩至 16px，子行叠压穿透
- 修复：sheet.tsx SheetHeader 加 `flex-none`（公共层根治）；EntityDrawer Header 重构为块级分行（企业名/徽章+意图行/元信息行/Tab 独立行，Tab overflow-x-auto）；ExplainSheet 同规格；SheetContent 移动端(<sm)禁 transform 动画改 fade（截屏伪影）；html text-size-adjust 100%
- 量化验证：修复前 headerH=16 重叠2处 → 修复后 headerH=92 四行严格递增 0 重叠；大屏模式 118% 与长企业名场景 0 重叠
- 排查清单：docs/drawer-header-audit.md（Dialog=grid 免疫；IntelParse/Batch/AiPanel/Rules 弹窗无隐患）

## Phase 2 后端（已完成代码）
- schema decisions.resourceId 列（已 ALTER TABLE 应用）
- transitionDecision：to=executing 时锁资源（显式 resourceId > 匹配快照首选 id），超容量拦截（executing 计数 >= capacity 报错）；done/dismissed 释放（resourceId=null）
- buildResourceUsage()：executing 聚合每资源占用数
- buildMonthlyReport(month)：按 updatedAt 归属月，byAssignee/byType/byResource + totals（winRate=won/done，amount=dealAmount 合计）
- park.decision 新 API：resourceUsage(public) / monthlyReport(protected) / monthlyReportExport(protected mutation，返回 rows 二维数组由前端组装 Excel，台账 export 留痕)
- transition input 加 resourceId 可选

## Phase 3 前端待做
- DecisionCenter：「我的决策」筛选（按 assignee=当前用户过滤开关）；执行时可选资源（或默认首选）；容量满错误 toast
- ResourceAdmin 页 + 决策卡匹配资源：显示 已占/总量（resourceUsage join）
- 月度经营报表视图（放决策中心底部或 ResourceAdmin？→ 放决策中心 ROI 区旁，月份选择器）+ 导出 Excel（xlsx 库前端组装，参照既有导出实现 client 侧 exportExcel 工具）
- 既有导出参照：屏二导出名单按钮实现（搜 exportRoster / xlsx）

## Phase 4 待做
- vitest iteration15：容量拦截/释放/月报聚合/导出行结构
- 全量测试+构建+检查点发布

## 关键文件
- server/decisionEngine.ts（transitionDecision/buildResourceUsage/buildMonthlyReport）
- server/routers/park.ts decision 路由区（158-300行）
- client/src/pages/DecisionCenter.tsx（含 AssignPicker/OutcomeForm）
- client/src/pages/ResourceAdmin.tsx
- 生产域名：uestcpark-cizb47ei.manus.space；上一检查点 c9f10826
