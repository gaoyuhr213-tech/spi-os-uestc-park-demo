# ORS Runbook · 可观测性（Observability）

## 症状
- `/health` 返回 503 / status=down
- 指标全部为 0
- 审计日志查询超时

## 诊断
1. 检查数据库容器状态：`docker ps | grep oceanbase`
2. 检查应用容器日志：`docker logs ${PARK_ID}-spi-os --tail 50`
3. 验证 DATABASE_URL 格式（OceanBase 租户连接串 `user@tenant:password@host:port/db`）

## 处置
| 根因 | 处置 |
|------|------|
| OceanBase 未就绪 | 等待 healthcheck 通过（首次约 5-8 分钟） |
| 应用 OOM | 增加容器内存限制 / 检查是否有内存泄漏 |
| 磁盘满 | 清理 OceanBase 日志归档 / 扩容数据卷 |

## 升级
若 /health 持续 down：重启应用容器 → 若仍失败，重启数据库容器 → 若仍失败，检查宿主机资源。

