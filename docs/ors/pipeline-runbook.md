# ORS Runbook · Pipeline 十段链（Pipeline Orchestrator）

## 症状
- Pipeline 串联视图显示红色失败标记
- `pipeline_runs_1h` 指标正常但 `failedStage` 非空
- opsLedger 出现 `pipeline_run_failed` action

## 诊断
1. 查看最近失败事件：`SELECT * FROM opsLedger WHERE action='pipeline_run_failed' ORDER BY id DESC LIMIT 3`
2. 解析 `afterJson` 中的 `events` 数组，定位 `failedStage`
3. 对应段的独立测试：`npx vitest run server/iteration23.test.ts -t "Stage X"`

## 处置
| 失败段 | 常见根因 | 处置 |
|--------|---------|------|
| Entity | 实体解析全部 unmatched | 检查 entities 表 / 归一化规则 |
| Profile | enrichments 写入冲突 | 检查字段白名单 / 数据类型 |
| Signal | signalsJson 格式损坏 | 修复该企业 signalsJson（JSON.parse 验证） |
| Score | 规则配置异常 | 规则中心恢复默认 |
| Decision | 决策引擎内部错误 | 见 decision-runbook.md |
| Workflow | workflowDefs 未 seed | 执行 `seedWorkflowDefs()` |
| Agent | LLM 网关超时 | 检查 BUILT_IN_FORGE_API_URL 可达性 |
| Outcome | 无已完成决策 | 正常——Outcome 段在无 done 决策时跳过 |
| Learning | scoreModels 表为空 | 正常——Learning 段在样本不足时跳过 |

## 升级
单段失败不影响已完成段的数据（事件驱动，已写入的画像/信号/决策保留）。修复根因后重跑 pipeline 即可补齐后续段。
