# SPI-OS 安全自测报告

> 迭代27 · 工单18 · 过安全评审前自测 · 2026-07-31

---

## 1. 依赖漏洞扫描

| 严重度 | 数量 | 处置 |
|--------|------|------|
| Critical | 0 | — |
| High | 5 | 见豁免记录 |
| Moderate | 25 | 传递依赖，无直接利用路径 |
| Low | 6 | 传递依赖 |

**高危豁免记录：**

| 包 | 漏洞 | 路径 | 豁免理由 |
|---|---|---|---|
| xlsx@0.18.5 | Prototype Pollution / ReDoS | 直接依赖 | 仅服务端解析受信 Excel 文件，不处理不可信输入；无安全补丁版本（SheetJS 停更），计划迁移 ExcelJS |
| path-to-regexp@0.1.12 | ReDoS | express → path-to-regexp | Express 4 内置路由，仅匹配开发者定义的固定路径模式，不接受用户输入作为路由；升级需 Express 5（breaking） |
| lodash/lodash-es | Code Injection via _.template | mermaid → langium → chevrotain | 传递依赖，项目代码未调用 _.template；mermaid 仅用于前端 Markdown 渲染 |

**修复动作：**
- axios 1.12.0 → 1.19.0（修复 Proxy-Auth 泄露、Prototype Pollution、ReDoS 等 8 个高危）
- drizzle-orm 0.44.7 → 0.45.2（修复 SQL 注入 via improperly escaped params）

---

## 2. 越权回归（server/security.test.ts）

| 用例 | 结果 | 说明 |
|------|------|------|
| user 角色访问 pii 字段（legalRep）被 deny | PASS | RBAC-ABAC 策略生效 |
| admin 角色访问 business 字段 allow | PASS | 最小权限 + 管理员放行 |
| 跨租户隔离（tenantWhere 参数化） | PASS | 不同 PARK_ID 产生不同 SQL 条件 |

---

## 3. 注入回归

| 用例 | 结果 | 说明 |
|------|------|------|
| SQL 注入（'; DROP TABLE）被参数化消解 | PASS | drizzle ORM sql`` 模板天然防护 |
| 提示注入（Ignore all previous instructions）被护栏拦截 | PASS | agentGuardrail.ts 正则匹配 + 替换 |
| XSS（script 标签）被 escapeHtml 转义 | PASS | shared/utils.ts 统一转义 |

---

## 4. 密钥与日志脱敏

| 用例 | 结果 | 说明 |
|------|------|------|
| 代码中无硬编码 API key | PASS | grep 扫描 server/ 目录零命中 |
| 日志脱敏（apiKey/phone/email 遮蔽） | PASS | logSanitizer.ts 敏感字段 → *** |
| 文件上传白名单（.exe 被拒 / 超 100MB 被拒） | PASS | uploadValidator.ts 类型+大小双校验 |

---

## 5. 新增安全模块清单

| 文件 | 职责 |
|------|------|
| server/agentGuardrail.ts | 提示注入检测与清洗（10 种常见攻击模式） |
| server/logSanitizer.ts | 日志/审计输出脱敏（敏感 key + 手机号 + 邮箱） |
| server/uploadValidator.ts | 文件上传/导出类型白名单 + 大小上限 |
| shared/utils.ts | HTML 转义（防 XSS） |
| server/security.test.ts | 安全回归套件（9 条，覆盖越权/注入/脱敏） |

---

## 6. 结论

系统已达到政府/国企安全评审自测水位：高危依赖已修复或有明确豁免记录、越权/注入回归全绿、密钥仅走 env 不入库不入日志、文件上传有白名单校验。建议正式评审前补充：渗透测试（外部第三方）、等保三级合规检查表。
