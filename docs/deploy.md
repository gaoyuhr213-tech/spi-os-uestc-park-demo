# SPI-OS 私有化部署手册

> 迭代25 · 工单14 · 容器化交付包 + 国产数据库适配 + 离线安装

---

## 1. 系统要求

| 项目 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 4 核 | 8 核 |
| 内存 | 8 GB | 16 GB（OceanBase mini 模式需 8G） |
| 磁盘 | 50 GB SSD | 200 GB SSD |
| 操作系统 | CentOS 7+ / Ubuntu 20.04+ / 银河麒麟 V10 | 同左 |
| Docker | 24.0+ | 同左 |
| Docker Compose | v2.20+ | 同左 |

---

## 2. 离线安装（无外网环境）

### 2.1 准备离线包

在有网络的构建机上执行：

```bash
# 构建应用镜像
cd /path/to/uestc-park-demo
docker build -f deploy/Dockerfile -t spi-os:latest .

# 拉取 OceanBase CE 镜像
docker pull oceanbase/oceanbase-ce:4.2.1

# 导出离线包
docker save spi-os:latest oceanbase/oceanbase-ce:4.2.1 | gzip > spi-os-offline.tar.gz
```

### 2.2 目标机导入

```bash
# 导入镜像
gunzip -c spi-os-offline.tar.gz | docker load

# 复制配置包
scp -r deploy/ target-host:/opt/spi-os/deploy/
```

---

## 3. 一条命令拉起

```bash
# 复制配置模板并修改
cp deploy/config/park.env.example deploy/config/uestc.env
# 编辑 uestc.env：修改密码、JWT_SECRET、园区标识等

# 一条命令拉起全栈
docker compose -f deploy/docker-compose.yml --env-file deploy/config/uestc.env up -d
```

首次启动 OceanBase 初始化约 5-8 分钟（mini 模式），应用容器会自动等待数据库就绪后执行 Drizzle 迁移并启动。

---

## 4. 国产数据库适配

### 4.1 OceanBase CE（MySQL 兼容租户）

**零改动直连**：OceanBase CE 4.x 的 MySQL 兼容租户在协议层与标准 MySQL 一致，`drizzle-orm/mysql2` 驱动无需任何适配。连接串格式：

```
DATABASE_URL=mysql://root@spi_os:password@host:2881/spi_os
```

其中 `root@spi_os` 为「用户名@租户名」（OceanBase 特有格式），mysql2 驱动正确解析。

### 4.2 达梦（预留）

达梦数据库需 JDBC 桥接或 `dmdb` Node.js 驱动（当前 drizzle-orm 未原生支持）。预留方案：

1. 设置 `DB_DIALECT=dameng`
2. 在 `server/db.ts` 中按分支加载达梦驱动
3. Schema 层面 MySQL 与达梦 SQL 语法差异由 drizzle-kit 方言适配器处理

当前口径：OceanBase CE 已验证可用；达梦为预留分支（需客户提供测试环境验证）。

---

## 5. 多租户物理隔离

每个园区一套独立 compose 栈（独立容器名、数据卷、端口、密钥），互不交叉：

```bash
# 园区 A
docker compose -f deploy/docker-compose.yml --env-file deploy/config/uestc.env up -d

# 园区 B（独立端口/卷/密钥）
docker compose -f deploy/docker-compose.yml --env-file deploy/config/tianfu.env -p tianfu up -d
```

验证隔离：两套栈的数据卷名、容器名、网络名均带 `PARK_ID` 前缀，物理层面无共享。

---

## 6. 运维操作

| 操作 | 命令 |
|------|------|
| 查看日志 | `docker compose -f deploy/docker-compose.yml logs -f app` |
| 重启应用 | `docker compose -f deploy/docker-compose.yml restart app` |
| 数据库 CLI | `docker exec -it ${PARK_ID}-oceanbase obclient -h127.0.0.1 -P2881 -uroot@spi_os -p` |
| 备份数据卷 | `docker run --rm -v ob-data:/data -v $(pwd):/backup alpine tar czf /backup/ob-backup.tar.gz /data` |
| 升级应用 | 重新构建镜像 → `docker compose pull && docker compose up -d` |

---

## 7. 安全加固

- 所有密码/密钥通过 `.env` 文件注入，严禁硬编码或提交 Git
- 生产环境建议启用 TLS（OceanBase 支持 SSL 连接；应用前置 Nginx 反向代理 + HTTPS）
- 外源连接器 API key 缺省自动降级手工回填，不影响核心功能
- 定期备份数据卷（OceanBase 支持物理备份 + 日志归档）

---

## 8. 故障排查

| 症状 | 诊断 | 处置 |
|------|------|------|
| 应用启动超时 | OceanBase 初始化慢 | 等待 healthcheck 通过（首次约 5-8 分钟） |
| 迁移失败 | 连接串格式错误 | 检查 DATABASE_URL 中 `@租户名` 格式 |
| 连接器降级 | API key 未配置 | 正常行为；配置 key 后重启即恢复 live 模式 |
| 两园区数据交叉 | 共用了同一 env 文件 | 确保 PARK_ID / 端口 / 卷名不同 |

