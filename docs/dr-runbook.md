# SPI-OS 灾备切换手册（DR Runbook）

> 迭代27 · 工单22 · 逐步可执行 · 2026-07-31

---

## 1. 适用场景

- 主数据库不可恢复（硬件故障 / 数据损坏）
- 需要迁移到新环境（机房搬迁 / 云迁移）
- 演练验证（每季度一次）

---

## 2. 前置条件

- 最近一次全量备份（`scripts/backup.ts` 产出的 `backups/YYYY-MM-DD/` 目录）
- 目标环境已部署好 OceanBase/MySQL 实例（`docker compose up -d db`）
- 目标环境 DATABASE_URL 已配置

---

## 3. 灾备切换步骤

### Step 1: 确认最近备份可用

```bash
ls backups/ | tail -1
# 输出最近备份日期目录
cat backups/<date>/backup-meta.json
# 确认 timestamp、行数、版本
```

### Step 2: 在目标环境执行 Drizzle 迁移（建表）

```bash
DATABASE_URL=<target-url> npx drizzle-kit migrate
```

### Step 3: 恢复数据

```bash
DATABASE_URL=<target-url> npx tsx scripts/restore.ts backups/<date>/
```

验证输出：每张表恢复行数与备份元数据一致。

### Step 4: 验证读模型完整性

```bash
DATABASE_URL=<target-url> npx tsx scripts/benchmark.ts
# 确认评分复算正常、路径查询正常
```

### Step 5: 切换应用指向

修改 `deploy/config/<park>.env` 中的 DATABASE_URL 指向目标环境，重启应用：

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/config/<park>.env up -d app
```

### Step 6: 验证应用可用

```bash
curl http://localhost:3000/api/trpc/park.observability.health
# 确认 status=ok
```

---

## 4. 从 Ledger 重放重建读模型

> ADR-01：读模型永远可从 Decision Ledger 重建

如果只有 `opsLedger.json` 备份（极端情况）：

1. 恢复 opsLedger 表
2. 按时间顺序重放事件：
   - `ingest_*` 事件 → 重建 entities + enrichments
   - `decision_*` 事件 → 重建 decisions
   - `pipeline_run` 事件 → 重建评分快照
3. 验证：`npx tsx scripts/benchmark.ts` 确认数据完整

---

## 5. 定时备份配置

在 `docker-compose.yml` 中添加定时备份服务：

```yaml
  backup:
    image: spi-os:latest
    command: ["sh", "-c", "while true; do npx tsx scripts/backup.ts /backups/$(date +%Y-%m-%d); sleep 86400; done"]
    volumes:
      - ./backups:/backups
    environment:
      DATABASE_URL: ${DATABASE_URL}
```

或使用宿主机 cron：

```bash
0 2 * * * cd /opt/spi-os && DATABASE_URL=... npx tsx scripts/backup.ts /opt/spi-os/backups/$(date +\%Y-\%m-\%d)
```

---

## 6. 回滚（Rollback）

如果恢复后发现数据有问题：

1. 停止应用：`docker compose stop app`
2. 清空目标库：`DROP DATABASE spi_os; CREATE DATABASE spi_os;`
3. 重新执行 Step 2-6，使用更早的备份

---

## 7. 联系人

| 角色 | 联系方式 |
|------|---------|
| 运维负责人 | 按园区配置 |
| DBA | 按园区配置 |
| 产品负责人 | 按园区配置 |

