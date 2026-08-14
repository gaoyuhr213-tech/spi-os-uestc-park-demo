import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/* ============================================================
 * SPI-OS 园区智能作战台 · 业务表
 * - entities = 企业主数据（L0 名录 + 演示口径信号/评分覆盖）
 * - enrichments = L1/L2 情报富集（一企一行，Excel 覆盖式导入）
 * - lifecycleEvents = 线索生命周期事件（追加式，漏斗由事件流聚合）
 * - ruleConfigs = 业务规则配置（评分权重/分级阈值/话术模板，仅后端持有）
 * ============================================================ */

export const entities = mysqlTable("entities", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  eid: varchar("eid", { length: 16 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  floor: varchar("floor", { length: 32 }).notNull(),
  room: varchar("room", { length: 64 }).notNull(),
  ind: varchar("ind", { length: 32 }).notNull(),
  nature: varchar("nature", { length: 64 }).notNull(),
  cross: int("cross").default(0).notNull(),
  tierRole: mysqlEnum("tierRole", ["tenant", "operator", "support"]).default("tenant").notNull(),
  hiringBase: mysqlEnum("hiringBase", ["高", "中", "低", "无"]).default("无").notNull(),
  note: text("note"),
  referralPath: mysqlEnum("referralPath", ["A", "B", "C", "D"]),
  entryPoint: text("entryPoint"),
  signalsJson: text("signalsJson"),
  dimsJson: text("dimsJson"),
  demo: int("demo").default(1).notNull(),
  dataEnvironment: mysqlEnum("dataEnvironment", ["production", "demo", "test", "load_test"]).default("production").notNull(),
  testRunId: varchar("testRunId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type EntityRow = typeof entities.$inferSelect;
export type InsertEntity = typeof entities.$inferInsert;

export const enrichments = mysqlTable("enrichments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  eid: varchar("eid", { length: 16 }).notNull().unique(),
  uscc: varchar("uscc", { length: 32 }),
  regCapital: varchar("regCapital", { length: 32 }),
  founded: varchar("founded", { length: 16 }),
  insured: int("insured"),
  legalRep: varchar("legalRep", { length: 64 }),
  branches: int("branches"),
  jobs: int("jobs"),
  topJobs: text("topJobs"),
  salaryRange: varchar("salaryRange", { length: 64 }),
  patents: int("patents"),
  softCopyrights: int("softCopyrights"),
  hiTech: varchar("hiTech", { length: 16 }),
  funding: varchar("funding", { length: 64 }),
  bidAmount: varchar("bidAmount", { length: 32 }),
  icp: varchar("icp", { length: 64 }),
  keyContact: varchar("keyContact", { length: 128 }),
  referralVia: varchar("referralVia", { length: 128 }),
  referralNote: text("referralNote"),
  verified: mysqlEnum("verified", ["待核验", "已核验", "存疑", "牌面遮挡"]).default("待核验").notNull(),
  verifiedBy: varchar("verifiedBy", { length: 64 }),
  remark: text("remark"),
  importedAt: timestamp("importedAt").defaultNow().onUpdateNow().notNull(),
});

export type EnrichmentRow = typeof enrichments.$inferSelect;
export type InsertEnrichment = typeof enrichments.$inferInsert;

export const lifecycleEvents = mysqlTable("lifecycleEvents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  eid: varchar("eid", { length: 16 }).notNull(),
  stage: mysqlEnum("stage", ["未触达", "已触达", "已约见", "已成交"]).notNull(),
  note: varchar("note", { length: 256 }),
  actor: varchar("actor", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type LifecycleEventRow = typeof lifecycleEvents.$inferSelect;

export const ruleConfigs = mysqlTable("ruleConfigs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  version: int("version").default(1).notNull(),
  configJson: text("configJson").notNull(),
  description: varchar("description", { length: 256 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RuleConfigRow = typeof ruleConfigs.$inferSelect;

/** 任务完成打卡：某企业某类任务在某 ISO 周被完成（周报复盘数据源） */
export const taskCompletions = mysqlTable("taskCompletions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  eid: varchar("eid", { length: 16 }).notNull(),
  taskType: mysqlEnum("taskType", ["首触", "复访", "培育跟进"]).notNull(),
  weekKey: varchar("weekKey", { length: 12 }).notNull(), // 如 2026-W31
  note: varchar("note", { length: 256 }),
  actor: varchar("actor", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TaskCompletionRow = typeof taskCompletions.$inferSelect;

/** 操作台账（轻量 Decision Ledger，对齐 ADR-16 留痕公理）：关键动作只增不改 */
export const opsLedger = mysqlTable("opsLedger", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  action: varchar("action", { length: 32 }).notNull(), // import/rule_save/rule_reset/stage_mark/task_done/export/seed
  targetEid: varchar("targetEid", { length: 16 }),
  detail: varchar("detail", { length: 512 }),
  actor: varchar("actor", { length: 64 }),
  /** 迭代6 审计升级：变更前后内容快照（JSON 字符串，规则修改等结构化变更时填写） */
  beforeJson: text("beforeJson"),
  afterJson: text("afterJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OpsLedgerRow = typeof opsLedger.$inferSelect;

/* ============================================================
 * 迭代11 · 关系图谱数据化：节点/边入库（图数据模型）
 * 节点类型：company 企业 / person 人 / platform 平台 / dept 院系
 * 边类型：referral 引荐 / alumni 校友 / pipeline 管道 / partner 合作
 * ============================================================ */
export const graphNodes = mysqlTable("graphNodes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  nodeKey: varchar("nodeKey", { length: 64 }).notNull().unique(), // 如 E703 / plat:xinruan / dept:swe
  kind: mysqlEnum("kind", ["company", "person", "platform", "dept"]).notNull(),
  label: varchar("label", { length: 128 }).notNull(),
  attrsJson: text("attrsJson"), // 附加属性 JSON（职务/主办方/楼层等）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const graphEdges = mysqlTable("graphEdges", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  fromKey: varchar("fromKey", { length: 64 }).notNull(),
  toKey: varchar("toKey", { length: 64 }).notNull(),
  relType: mysqlEnum("relType", ["referral", "alumni", "pipeline", "partner"]).notNull(),
  strength: int("strength").default(50).notNull(), // 0-100 关系强度
  evidence: varchar("evidence", { length: 255 }), // 证据描述（楼层索引实勘/公开信息/生态协议）
  pathTag: varchar("pathTag", { length: 8 }), // 归属暖引荐路径 A/B/C/D（可空）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GraphNodeRow = typeof graphNodes.$inferSelect;
export type GraphEdgeRow = typeof graphEdges.$inferSelect;

/* ============================================================
 * 迭代12 · 解析历史记录：每次 AI 解析/导入写入的原文与结果快照
 * - 证据链强化：支持回溯「这个字段是哪次解析写入的」
 * - sourceType：ai_parse 单家解析 / ai_parse_batch 批量解析 / excel_import Excel 导入
 * ============================================================ */
export const parseHistory = mysqlTable("parseHistory", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  eid: varchar("eid", { length: 16 }).notNull(),
  sourceType: mysqlEnum("sourceType", ["ai_parse", "ai_parse_batch", "excel_import"]).notNull(),
  rawText: text("rawText"), // 原文快照（AI 解析场景；Excel 导入为行 JSON）
  resultJson: text("resultJson").notNull(), // 抽取/写入结果快照 JSON
  fieldsWritten: text("fieldsWritten").notNull(), // 实际写入字段名清单（逗号分隔）
  confidence: varchar("confidence", { length: 8 }), // 解析置信度（AI 场景）
  actor: varchar("actor", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ParseHistoryRow = typeof parseHistory.$inferSelect;

/* ============================================================
 * 迭代13 · 决策闭环（Decision Loop）：决策成为一等对象
 * - 每条 AI 建议 = 一条 decision 记录，可采纳/指派/执行/回填结果
 * - 状态机：suggested → adopted → executing → done / dismissed
 * - dtype 五类：contact 立即联系 / mentor 安排导师 / hr_service HR服务
 *   / policy 政策申报 / referral 暖引荐
 * ============================================================ */
export const decisions = mysqlTable("decisions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  eid: varchar("eid", { length: 16 }).notNull(),
  dtype: mysqlEnum("dtype", ["contact", "mentor", "hr_service", "policy", "referral"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(), // 建议动作标题
  reason: text("reason").notNull(), // 原因链（信号/画布/阶段证据，分号分隔）
  stars: int("stars").default(3).notNull(), // 1-5 优先星级（决策引擎计算）
  needTag: varchar("needTag", { length: 16 }), // 关联需求维度（talent/funding/policy/...）
  matchedResources: text("matchedResources"), // 匹配资源快照 JSON（Top-3）
  status: mysqlEnum("status", ["suggested", "adopted", "executing", "done", "dismissed"]).default("suggested").notNull(),
  assignee: varchar("assignee", { length: 64 }), // 采纳时指派负责人
  outcome: varchar("outcome", { length: 16 }), // 结果：won / lost / partial（done 时回填）
  outcomeNote: varchar("outcomeNote", { length: 255 }), // 结果说明（成交金额/失败原因）
  dealAmount: int("dealAmount"), // 迭代14 · 成交金额（元，won/partial 时回填，金额口径 ROI 依据）
  revenueTier: varchar("revenueTier", { length: 24 }), // 归因收入层（marketplace/operation/consulting/ai_capability）
  resourceId: int("resourceId"), // 迭代15 · 执行占用的资源 ID（executing 时锁定名额，done/dismissed 释放）
  basedOn: text("basedOn"), // 迭代18 · 工单3 · 完整溯源链 JSON：{signals[],rules[],ruleVersions{},evidence[],canvas,lifecycle,score}（ADR-01）
  genKey: varchar("genKey", { length: 128 }).notNull().unique(), // 幂等键：eid:dtype:依据摘要，防重复生成
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DecisionRow = typeof decisions.$inferSelect;

/* 迭代13 · 资源库：Marketplace 收入层的产品底座
 * rtype：mentor 导师 / headhunter 猎头 / alumni 校友 / professor 教授
 *        / investor 投资人 / lawfirm 律所 / tax 财税 / vendor 服务商 / gaoyu 高于人力 */
export const resources = mysqlTable("resources", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  rtype: mysqlEnum("rtype", ["mentor", "headhunter", "alumni", "professor", "investor", "lawfirm", "tax", "vendor", "gaoyu"]).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  org: varchar("org", { length: 128 }), // 所属机构
  needTags: varchar("needTags", { length: 128 }).notNull(), // 可服务需求维度（逗号分隔：talent,funding,...）
  indTags: varchar("indTags", { length: 128 }), // 擅长行业（逗号分隔，空=全行业）
  stageTags: varchar("stageTags", { length: 128 }), // 适配生命周期阶段（逗号分隔，空=全阶段）
  capacity: int("capacity").default(5).notNull(), // 本期可承接名额
  graphKey: varchar("graphKey", { length: 64 }), // 关联图谱节点 key（复用暖引荐链路）
  note: varchar("note", { length: 255 }),
  active: int("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ResourceRow = typeof resources.$inferSelect;

/* ============================================================
 * 迭代17 · 工单1 · 连接器框架 + ACL 防腐层（ADR-06 端口适配器）
 * - connectorsTable：外部数据源统一注册表
 * - ingestionJobs：每次拉取/导入写一条 job 留痕（可售审计要求）
 * ============================================================ */
export const connectorsTable = mysqlTable("connectors", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  cid: varchar("cid", { length: 64 }).notNull().unique(), // biz-registry/job-board/patent/manual-enrichment
  name: varchar("name", { length: 128 }).notNull(),
  ctype: mysqlEnum("ctype", ["manual", "csv", "paste", "api"]).notNull(),
  status: mysqlEnum("status", ["active", "planned", "paused", "error"]).default("planned").notNull(),
  source: varchar("source", { length: 256 }), // 数据来源描述（证据链）
  configJson: text("configJson"),
  lastRunAt: timestamp("lastRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ConnectorTableRow = typeof connectorsTable.$inferSelect;

export const ingestionJobs = mysqlTable("ingestionJobs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  connectorId: varchar("connectorId", { length: 64 }).notNull(), // connectors.cid
  status: mysqlEnum("status", ["running", "success", "partial", "failed"]).default("running").notNull(),
  rowsIn: int("rowsIn").default(0).notNull(),   // 原始行数
  rowsOut: int("rowsOut").default(0).notNull(), // 经 ACL 转换后入库行数
  rowsSkipped: int("rowsSkipped").default(0).notNull(),
  error: text("error"),
  summaryJson: text("summaryJson"), // 明细摘要（写入字段/涉及企业/触发实体解析结果）
  triggeredBy: varchar("triggeredBy", { length: 64 }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  finishedAt: timestamp("finishedAt"),
});
export type IngestionJobRow = typeof ingestionJobs.$inferSelect;

/* ============================================================
 * 迭代17 · 工单2 · 实体解析引擎
 * mergeDecisions：合并决策（置信度+证据链+人工消歧状态机）
 * 状态机：auto_merged（高置信自动）/ pending（低置信进人工队列）
 *         → confirmed（人工确认合并）/ split（人工拆分）/ dismissed（存疑搁置）
 * ============================================================ */
export const mergeDecisions = mysqlTable("mergeDecisions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  sourceEids: text("sourceEids").notNull(),     // JSON 数组：候选合并 eid 列表
  targetEid: varchar("targetEid", { length: 16 }).notNull(),
  confidence: int("confidence").notNull(),      // 0-100 匹配置信度
  evidenceJson: text("evidenceJson").notNull(), // 证据链：归一化名/USCC/楼层/匹配规则命中
  status: mysqlEnum("status", ["auto_merged", "pending", "confirmed", "split", "dismissed"]).default("pending").notNull(),
  decidedBy: varchar("decidedBy", { length: 64 }), // 人工消歧操作人（自动合并为 engine）
  decidedAt: timestamp("decidedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type MergeDecisionRow = typeof mergeDecisions.$inferSelect;

/* ============================================================
 * 迭代18 · 工单4 · 安全合规产品化（ADR-04）
 * consents：PIPL 同意管理（主体/范围/有效期/撤回）
 * accessPolicies：RBAC-ABAC 属性策略（角色 × 数据分级 × 字段组）
 * ============================================================ */
export const consents = mysqlTable("consents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  eid: varchar("eid", { length: 16 }).notNull(), // 数据主体（企业）
  scope: mysqlEnum("scope", ["contact_info", "hr_data", "finance_data", "full_profile"]).notNull(), // 同意范围
  status: mysqlEnum("status", ["granted", "revoked", "expired"]).default("granted").notNull(),
  grantedBy: varchar("grantedBy", { length: 64 }), // 授权来源（联系人/合同编号/公开渠道声明）
  basis: varchar("basis", { length: 255 }), // 合法性基础（合同履行/公开信息/明示同意）
  expiresAt: timestamp("expiresAt"), // 有效期（空=长期，撤回即失效）
  revokedAt: timestamp("revokedAt"),
  revokedBy: varchar("revokedBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type ConsentRow = typeof consents.$inferSelect;

export const accessPolicies = mysqlTable("accessPolicies", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  role: mysqlEnum("role", ["user", "admin"]).notNull(),
  fieldGroup: mysqlEnum("fieldGroup", ["public", "business", "sensitive", "pii"]).notNull(), // 数据分级
  effect: mysqlEnum("effect", ["allow", "mask", "deny"]).notNull(),
  condition: varchar("condition", { length: 255 }), // 属性条件描述（如 requires_consent）
  updatedBy: varchar("updatedBy", { length: 64 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AccessPolicyRow = typeof accessPolicies.$inferSelect;

/* ============================================================
 * 迭代21 · 工单8 · 工作流引擎（Cap-07，依赖工单3）
 * workflowDefs：配置化流程定义（stepsJson = 步骤数组：kind/title/slaHours/compensation）
 * workflowInstances：流程实例（已批准决策触发；stepStatesJson 含每步状态/幂等键/补偿记录）
 * workflowTasks：人工任务（SLA 计时 + 超时升级）
 * ============================================================ */
export const workflowDefs = mysqlTable("workflowDefs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  defKey: varchar("defKey", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  decisionType: varchar("decisionType", { length: 32 }), // 绑定决策类型（contact/mentor/...，空=通用）
  stepsJson: text("stepsJson").notNull(),
  active: int("active").default(1).notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WorkflowDefRow = typeof workflowDefs.$inferSelect;

export const workflowInstances = mysqlTable("workflowInstances", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  defKey: varchar("defKey", { length: 64 }).notNull(),
  decisionId: int("decisionId"),
  eid: varchar("eid", { length: 16 }),
  status: mysqlEnum("status", ["running", "done", "failed", "compensated"]).default("running").notNull(),
  currentStep: int("currentStep").default(0).notNull(),
  stepStatesJson: text("stepStatesJson").notNull(),
  startedBy: varchar("startedBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type WorkflowInstanceRow = typeof workflowInstances.$inferSelect;

export const workflowTasks = mysqlTable("workflowTasks", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  instanceId: int("instanceId").notNull(),
  stepIndex: int("stepIndex").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  assignee: varchar("assignee", { length: 64 }),
  status: mysqlEnum("status", ["open", "done", "escalated", "cancelled"]).default("open").notNull(),
  slaHours: int("slaHours").default(72).notNull(),
  dueAt: timestamp("dueAt"),
  escalatedTo: varchar("escalatedTo", { length: 64 }),
  doneAt: timestamp("doneAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type WorkflowTaskRow = typeof workflowTasks.$inferSelect;

/* ============================================================
 * 迭代28 · 数据来源与证据治理系统
 * dataSources / ingestionBatches / evidenceRecords / dataConflicts
 * entityAliases / sourceFieldPolicies / decisionEvidenceLinks
 * ============================================================ */

/** 数据来源目录 */
export const dataSources = mysqlTable("dataSources", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  sourceKey: varchar("sourceKey", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  category: mysqlEnum("category", ["government", "company_official", "commercial_database", "recruitment", "media", "park_internal", "field_visit", "enterprise_submission", "other"]).notNull(),
  provider: varchar("provider", { length: 128 }),
  acquisitionChannel: mysqlEnum("acquisitionChannel", ["manual_paste", "excel", "api", "form", "system_sync", "file_upload", "email", "other"]).default("other").notNull(),
  sourceScope: varchar("sourceScope", { length: 255 }),
  homepageUrl: varchar("homepageUrl", { length: 512 }),
  ownerDepartment: varchar("ownerDepartment", { length: 64 }),
  ownerName: varchar("ownerName", { length: 64 }),
  authorizationType: mysqlEnum("authorizationType", ["public", "user_provided", "contractual", "internal", "unknown"]).default("unknown").notNull(),
  authorizationNote: text("authorizationNote"),
  refreshMode: mysqlEnum("refreshMode", ["one_time", "manual", "scheduled", "event_driven"]).default("manual").notNull(),
  refreshFrequency: varchar("refreshFrequency", { length: 32 }),
  reliabilityLevel: mysqlEnum("reliabilityLevel", ["A", "B", "C", "D", "ungraded"]).default("ungraded").notNull(),
  sensitivityLevel: varchar("sensitivityLevel", { length: 16 }),
  status: mysqlEnum("dsStatus", ["active", "paused", "planned", "retired"]).default("active").notNull(),
  lastSuccessfulSyncAt: timestamp("lastSuccessfulSyncAt"),
  lastFailedSyncAt: timestamp("lastFailedSyncAt"),
  lastFailureReason: text("lastFailureReason"),
  createdBy: varchar("createdBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DataSourceRow = typeof dataSources.$inferSelect;

/** 数据入库批次 */
export const ingestionBatches = mysqlTable("ingestionBatches", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  batchKey: varchar("batchKey", { length: 64 }).notNull().unique(),
  sourceId: int("sourceId").notNull(),
  acquisitionChannel: mysqlEnum("ibAcqChannel", ["manual_paste", "excel", "api", "form", "system_sync", "file_upload", "email", "other"]).default("excel").notNull(),
  processingMethod: mysqlEnum("processingMethod", ["ai_extract", "rule_parse", "direct_mapping", "manual_entry", "connector_sync"]).default("direct_mapping").notNull(),
  originalFileName: varchar("originalFileName", { length: 255 }),
  originalFileUrl: varchar("originalFileUrl", { length: 512 }),
  originalPageUrl: varchar("originalPageUrl", { length: 512 }),
  collectedAt: timestamp("collectedAt"),
  effectiveAt: timestamp("effectiveAt"),
  expiresAt: timestamp("expiresAt"),
  status: mysqlEnum("ibStatus", ["draft", "parsing", "review", "committed", "failed", "rolled_back"]).default("draft").notNull(),
  totalRecords: int("totalRecords").default(0).notNull(),
  matchedRecords: int("matchedRecords").default(0).notNull(),
  createdRecords: int("createdRecords").default(0).notNull(),
  updatedRecords: int("updatedRecords").default(0).notNull(),
  conflictRecords: int("conflictRecords").default(0).notNull(),
  failedRecords: int("failedRecords").default(0).notNull(),
  actor: varchar("ibActor", { length: 64 }).notNull(),
  notes: text("ibNotes"),
  beforeSnapshotJson: text("beforeSnapshotJson"),
  afterSnapshotJson: text("afterSnapshotJson"),
  createdAt: timestamp("ibCreatedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
  rolledBackAt: timestamp("rolledBackAt"),
  rolledBackBy: varchar("rolledBackBy", { length: 64 }),
});
export type IngestionBatchRow = typeof ingestionBatches.$inferSelect;

/** 字段级证据 */
export const evidenceRecords = mysqlTable("evidenceRecords", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  evidenceKey: varchar("evidenceKey", { length: 128 }).notNull().unique(),
  eid: varchar("eid", { length: 16 }).notNull(),
  fieldName: varchar("fieldName", { length: 64 }).notNull(),
  normalizedValue: text("normalizedValue"),
  originalValue: text("originalValue"),
  valueType: varchar("valueType", { length: 16 }),
  sourceId: int("sourceId").notNull(),
  batchId: int("batchId").notNull(),
  sourceRecordKey: varchar("sourceRecordKey", { length: 128 }),
  evidenceExcerpt: text("evidenceExcerpt"),
  evidenceLocation: varchar("evidenceLocation", { length: 128 }),
  originalUrl: varchar("originalUrl", { length: 512 }),
  originalFileName: varchar("erOriginalFileName", { length: 255 }),
  collectedAt: timestamp("erCollectedAt"),
  effectiveAt: timestamp("erEffectiveAt"),
  expiresAt: timestamp("erExpiresAt"),
  confidenceScore: int("confidenceScore"),
  confidenceLabel: mysqlEnum("confidenceLabel", ["high", "medium", "low", "unknown"]).default("unknown").notNull(),
  verificationStatus: mysqlEnum("verificationStatus", ["pending", "verified", "disputed", "rejected", "expired"]).default("pending").notNull(),
  verifiedBy: varchar("erVerifiedBy", { length: 64 }),
  verifiedAt: timestamp("erVerifiedAt"),
  processingMethod: varchar("erProcessingMethod", { length: 32 }),
  modelName: varchar("modelName", { length: 64 }),
  modelVersion: varchar("modelVersion", { length: 32 }),
  transformationRule: varchar("transformationRule", { length: 128 }),
  reliabilityScore: int("reliabilityScore"),
  isCurrent: int("isCurrent").default(0).notNull(),
  supersededByEvidenceId: int("supersededByEvidenceId"),
  createdAt: timestamp("erCreatedAt").defaultNow().notNull(),
});
export type EvidenceRecordRow = typeof evidenceRecords.$inferSelect;

/** 数据冲突 */
export const dataConflicts = mysqlTable("dataConflicts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  conflictKey: varchar("conflictKey", { length: 128 }).notNull().unique(),
  eid: varchar("dcEid", { length: 16 }).notNull(),
  fieldName: varchar("dcFieldName", { length: 64 }).notNull(),
  evidenceIdsJson: text("evidenceIdsJson"),
  currentValue: text("currentValue"),
  candidateValuesJson: text("candidateValuesJson"),
  recommendedEvidenceId: int("recommendedEvidenceId"),
  recommendedReason: text("recommendedReason"),
  resolutionStatus: mysqlEnum("resolutionStatus", ["open", "suggested", "resolved", "ignored"]).default("open").notNull(),
  resolutionMethod: mysqlEnum("resolutionMethod", ["manual", "source_priority", "newest_verified", "weighted_score", "rule_based"]),
  resolvedValue: text("resolvedValue"),
  resolvedEvidenceId: int("resolvedEvidenceId"),
  resolvedBy: varchar("resolvedBy", { length: 64 }),
  resolvedAt: timestamp("resolvedAt"),
  createdAt: timestamp("dcCreatedAt").defaultNow().notNull(),
  updatedAt: timestamp("dcUpdatedAt").defaultNow().onUpdateNow().notNull(),
});
export type DataConflictRow = typeof dataConflicts.$inferSelect;

/** 企业身份别名 */
export const entityAliases = mysqlTable("entityAliases", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  eid: varchar("eaEid", { length: 16 }).notNull(),
  aliasType: mysqlEnum("aliasType", ["legal_name", "former_name", "brand_name", "uscc", "domain", "phone", "address", "contract_name", "other"]).notNull(),
  aliasValue: varchar("aliasValue", { length: 255 }).notNull(),
  normalizedValue: varchar("eaNormalizedValue", { length: 255 }),
  sourceId: int("eaSourceId"),
  verified: int("eaVerified").default(0).notNull(),
  createdAt: timestamp("eaCreatedAt").defaultNow().notNull(),
});
export type EntityAliasRow = typeof entityAliases.$inferSelect;

/** 来源字段策略 */
export const sourceFieldPolicies = mysqlTable("sourceFieldPolicies", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  fieldName: varchar("sfpFieldName", { length: 64 }).notNull(),
  sourceCategory: varchar("sourceCategory", { length: 32 }).notNull(),
  priority: int("sfpPriority").default(50).notNull(),
  maxAgeDays: int("maxAgeDays").default(180).notNull(),
  requiresVerification: int("requiresVerification").default(0).notNull(),
  allowAutoApply: int("allowAutoApply").default(0).notNull(),
  notes: text("sfpNotes"),
  updatedAt: timestamp("sfpUpdatedAt").defaultNow().onUpdateNow().notNull(),
});
export type SourceFieldPolicyRow = typeof sourceFieldPolicies.$inferSelect;

/** 决策-证据关联 */
export const decisionEvidenceLinks = mysqlTable("decisionEvidenceLinks", {
  id: int("id").autoincrement().primaryKey(),
  decisionId: int("delDecisionId").notNull(),
  evidenceId: int("delEvidenceId").notNull(),
  role: mysqlEnum("delRole", ["trigger", "support", "counter_evidence"]).default("support").notNull(),
  createdAt: timestamp("delCreatedAt").defaultNow().notNull(),
});
export type DecisionEvidenceLinkRow = typeof decisionEvidenceLinks.$inferSelect;

/* ============================================================
 * 迭代22 · 工单9 · 学习引擎（Cap-08）
 * scoreModels：评分模型版本（champion 在线 / challenger 候选）
 * - weightsJson：12 维权重快照；backtestJson：回测对照结果；lineageJson：血缘（训练数据窗口/样本量/生成方法）
 * - 状态机：challenger（候选）→ promoted（人审晋升为 champion）/ archived（淘汰）
 * - 硬约束：不得自动上线——promote 必须管理员显式操作，写 ruleConfigs 新版本（可回滚）
 * ============================================================ */
export const scoreModels = mysqlTable("scoreModels", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: varchar("tenantId", { length: 32 }).default("uestc").notNull(),
  modelKey: varchar("modelKey", { length: 64 }).notNull().unique(), // 如 challenger-2026W31-1
  role: mysqlEnum("role", ["champion", "challenger", "archived"]).default("challenger").notNull(),
  weightsJson: text("weightsJson").notNull(),
  backtestJson: text("backtestJson"),
  lineageJson: text("lineageJson").notNull(),
  explanation: text("explanation"), // 可解释说明：每个权重调整的原因（人话）
  promotedAt: timestamp("promotedAt"),
  promotedBy: varchar("promotedBy", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type ScoreModelRow = typeof scoreModels.$inferSelect;
