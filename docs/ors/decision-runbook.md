# ORS Runbook · 决策引擎（Decision Engine）

## 症状
- 决策中心无新建议（`decision_rate_1h` = 0 且有 P0/P1 企业）
- 生成决策报错 / 超时
- 决策健康分（Decision Health）骤降

## 诊断
1. 检查 `/health` → `decisionEngineReady` 是否为 true
2. 手动触发：`park.decision.generate` mutation，观察返回的 `created` / `skipped`
3. 查看规则配置：`SELECT * FROM ruleConfigs ORDER BY id DESC LIMIT 5`

## 处置
| 根因 | 处置 |
|------|------|
| 无 P0/P1 企业 | 正常——决策引擎只扫描高价值线索 |
| 规则配置被误改 | 规则中心「恢复默认」→ 重新生成 |
| 评分全部为 0 | 检查 enrichments 表是否有数据（回填是否执行） |
| 工作流启动失败 | 检查 workflowDefs 是否已 seed（`seedWorkflowDefs()`） |

## 升级
若决策引擎持续无法生成建议：检查 opsLedger 最近 pipeline_run 是否成功；必要时回滚规则版本。
