# ORS Runbook · 数据摄入（Ingestion）

## 症状
- 连接器状态卡显示 `error` / `failed`
- ingestionJobs 表最近批次 status=failed
- 指标 `ingestion_rate_1h` 降至 0

## 诊断
1. 检查 `/health` 端点：`db.connected` 是否为 true
2. 查看最近失败批次：`SELECT * FROM ingestionJobs WHERE status='failed' ORDER BY id DESC LIMIT 5`
3. 检查连接器 key 状态：`park.connector.external` API 返回 `hasKey` 字段

## 处置
| 根因 | 处置 |
|------|------|
| 数据库不可达 | 检查 OceanBase 容器状态 / 网络 / 端口 |
| API key 失效 | 更新 env 中 QCC_API_KEY/JOB_BOARD_API_KEY → 重启应用 |
| ACL 映射失败 | 检查 CSV 表头是否与适配器中文口径一致 |
| 实体解析全部 unmatched | 检查 entities 表是否有对应企业名（归一化后） |

## 升级
若 30 分钟内无法恢复：通知运维负责人 + 切换为手工回填模式（功能不中断）。
