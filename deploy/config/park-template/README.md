# 园区配置包模板

此目录为新园区零代码开园的配置模板。`provisionPark()` 函数读取此处的 JSON 文件初始化业务数据。

## 文件说明

| 文件 | 用途 |
|------|------|
| entities.json | 样例企业名录（开园时 seed 到 entities 表） |
| park.env.example | 环境变量模板（docker compose 消费） |

## 新建园区流程

1. 复制 `park.env.example` → `<park-id>.env`，修改 PARK_ID/PARK_NAME/密码
2. `docker compose -f deploy/docker-compose.yml --env-file deploy/config/<park-id>.env -p <park-id> up -d`
3. 登录后在管理界面点击「一键开园」或调用 `park.provision` mutation
4. 验证：/health 返回 ok + 决策中心有初始建议

