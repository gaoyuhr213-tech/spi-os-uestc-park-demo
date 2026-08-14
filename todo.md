# 迭代 2 · 三项新功能

- [x] 研读《从楼层名录到高价值链接与商机-情报作业标准》docx
- [x] 生成 26 家 P0/P1 富集回填模板（Excel：USCC/参保/在招岗位/专利/暖引荐路径等）
- [x] seed.ts 扩展富集字段（enrich 结构，含填报状态）+ 抽屉展示富集区块
- [x] 路演模式：全屏隐藏侧栏 + 方向键 ←/→ 翻屏 + ESC 退出
- [x] 屏二 P0 引荐话术草稿：按信号/切入点/路径拼装 + 一键复制
- [x] 截图验证三屏 + 话术抽屉 + 路演模式
- [x] 保存检查点并交付（附回填模板 Excel）

# 迭代 3 · 准生产全栈架构升级

## Phase 1 架构
- [x] webdev_add_feature 升级 web-db-user（数据库+后端）
- [x] 设计数据模型：entities / enrichments / lifecycle_events / rule_configs

## Phase 2 后端数据层+规则引擎
- [x] Schema + 种子迁移（69家主体入库）
- [x] 统一数据适配器（DB 优先 / 种子回退；Excel 经导入 API 写入 DB 后即成为 DB 源）
- [x] 规则引擎：12维评分、Tier分级、引荐路径、双版话术、KPI聚合（全部后端）
- [x] 规则配置存 DB（rule_configs），不暴露前端

## Phase 3 三项新功能
- [x] Excel 情报导入（前端解析回填模板→后端 rows 校验入库 enrichments→自动复算→联动刷新）
- [x] 双版话术 API（正式版/轻量版，按路径+信号+对接人层级）
- [x] 生命周期状态（未触达/已触达/已约见/已成交）手动标记 + 漏斗统计 API + 散点分色

## Phase 4 前端改接+安全
- [x] 三屏改为 tRPC 查询渲染（KPI/排序/漏斗均后端输出）
- [x] 数据脱敏开关（后端脱敏后输出，适配对外路演）
- [x] 全链路验证：导入→复算→三屏联动（E703 88→100 富集+12，漏斗/雷达联动确认，测试数据已清理）
- [x] vitest 12 用例全过 + 生产构建通过

## Phase 5 交付
- [x] 数据模型 + 业务规则说明文档（SPI-OS_数据模型与业务规则说明_v1.md）
- [x] 生产构建 + 检查点发布 + 交付

# 迭代 4 · 权限/规则中心/任务清单/双主题

## Phase 1 权限收敛
- [x] importEnrichment / lifecycle.mark 改为 protectedProcedure；rules.* / seedDb 改为 adminProcedure
- [x] 前端未登录操作自动跳转登录（模板 401 全局拦截），vitest 覆盖权限用例（4 例）

## Phase 2 规则中心（管理员专用）
- [x] /rules 页面：12维权重（合计=100校验）、富集/信号加分、分级阈值（P0>P1>P2校验）、管道匹配在线编辑
- [x] park.rules.get / saveScoring / saveTiering / savePipeMatch / reset API（写 ruleConfigs 版本自增即时生效）
- [x] 非管理员访问拦截（登录引导 + 权限提示），侧栏管理员才显示入口

## Phase 3 触达任务清单
- [x] 后端任务规则 buildTaskList：首触（P0未触达）/复访（已触达>7天、已约见>14天）/培育跟进（P1带Tier-1信号），vitest 4 例
- [x] /tasks 独立页面三列分组渲染，点击进企业360可直接标记状态，清单实时重算

## Phase 4 双主题切换
- [x] index.css 增加 .light 浅色办公模式变量集 + 业务语义色 CSS 变量（--tier-*/--stage-*/--path-*等），色相语义不变、浅底加深对比度
- [x] 侧栏全局切换按钮 + localStorage 持久化 + URL ?theme= 参数 + 实时切换无刷新
- [x] 路演模式自动锁定深色作战模式
- [x] 全组件硬编码色替换为 CSS 变量 + alpha()（三屏/散点/关系图/热力图/抽屉/弹窗/任务/规则页），双主题截图验证

## Phase 5 验证交付
- [x] vitest 21/21 全过 + 生产构建 + 截图验证双主题
- [x] 保存检查点（自动发布）并交付

# 迭代 5 · PRD 全量回溯核对 + 三项新功能

## Phase 1 文档回溯
- [x] 重新解压 ZIP，逐份研读 PRD/业务规则/交互规范/情报作业标准/拓客方案（14 份全读）
- [x] 建立需求条目清单（文档 → 需求 → 实现状态映射）

## Phase 2 三项新功能
- [x] 任务完成打卡：任务卡"已完成"勾选（taskCompletions 表 + 可撤销）+ 本周完成率统计 + 周报作战复盘（可导出）
- [x] 规则修改影响预览：保存前 dry-run 展示"X 家企业升级/降级"差异对比（rules.preview + 确认对话框）
- [x] Excel 导出：屏二作战名单 + 任务清单 + 周报复盘一键导出（后端组装行数据，导出留痕）

## Phase 3 需求补齐与架构加固
- [x] 补齐：信号新近度衰减（半衰期45/90天）+ Tier-0 风险层（降分+封顶P2）（模块03）
- [x] 补齐：NBA 动态生成下沉后端（条件模板可配，snapshot 透传）（模块08）
- [x] 补齐：任务阈值配置化（tasks 规则键 + 规则中心卡片）（Law-05）
- [x] 补齐：成交/流失原因编码（lifecycle.mark outcomeReason）（Cap-09）
- [x] 补齐：操作台账 opsLedger 留痕（导入/规则/状态/打卡/导出）（ADR-16）
- [x] 架构自查：分层解耦/安全预留/工程化移交就绪（MVP 范围项标注"规划中"，未擅自裁剪或虚报）

## Phase 4 交付文档
- [x] 需求核对清单（逐条 · 文档出处 · 实现位置 · 状态）
- [x] 架构说明文档（分层/数据模型/API/安全/扩展点）——合并为 SPI-OS_需求核对清单与架构说明_v2.md

## Phase 5 验证交付
- [x] vitest 33/33 全过 + 生产构建通过 + 双主题截图验证 + 匿名权限 401 验证
- [x] 保存检查点（自动发布）并交付

# 迭代 6 · 七项需求（周报推送/校验报告/AI助手/移动端/大屏/审计/i18n）

## Phase 1 周报推送 + 导入校验报告
- [x] 研读 webdev-periodic-updates 与 webdev-llm-integration 技能规范
- [x] 周报自动推送：每周五定时生成周报并通知园区运营负责人（Heartbeat 任务已创建并生效：task_uid kYQgjFtY2YsjT9tE6Zo27k，cron "0 0 1 * * 5" UTC=北京周五09:00，next 2026-07-31T01:00Z，回调 /api/scheduled/weeklyDigest 已随检查点 196c4dca 发布）
- [x] 导入逐行校验报告：成功/跳过/纠错建议逐行输出，导入对话框展示报告并可导出

## Phase 2 AI 侧边助手
- [x] 可收起侧边 AI 对话面板（全局挂载，不遮挡三屏布局）
- [x] 自然语言查询企业数据（后端 LLM + 快照上下文，结构化输出）
- [x] 生成招商决策方案（按企业/园区维度）
- [x] 查询结果联动看板高亮定位（定位到屏二散点/名单或企业360）

## Phase 3 审计升级 + i18n
- [x] 审计升级：opsLedger 增加变更前后内容（diff）、检索界面（按操作人/时间/行为筛选）
- [x] i18n 框架：中英文案字典 + 一键切换 + localStorage 持久化 + ?lang= 参数（当前覆盖侧栏/导航/顶栏/合规注记；页面正文与业务数据保持中文源语言）
- [x] i18n 深化（迭代7）：对外核心用户面全覆盖——三屏正文/KPI/图表标注/任务页/企业360抽屉/AI面板快捷指令（约120词条+术语口径表，英文态4页截图验证）。边界说明：管理员内部工具（规则中心页、Excel导入/AI解析对话框）为运营人员专用，保持中文，不属对外路演双语范围

## Phase 4 移动端 + 大屏模式
- [x] 响应式适配：三屏/任务/规则页移动端布局（顶栏 + 抽屉导航，屏三关系图横向滚动）
- [x] 移动端核心能力：线索查看/画像/话术复制/状态标记（企业360抽屉全宽自适应）
- [x] 数据大屏模式：投屏专用视图（隐藏侧栏/放大字号118%），快捷键 B 启停 / ESC 退出

## Phase 5 验证交付
- [x] 存量功能回归：双主题/路演/漏斗/富集导入/话术/导出/规则中心/任务打卡
- [x] vitest 39/39 全过 + 生产构建 + 多视口截图验证（375 移动端 + 1280 桌面 + ?lang=en）
- [x] 3.1/3.5 核对说明（已有能力核验加固，不重建）
- [x] 保存检查点（自动发布）并交付

# 迭代 7 · i18n全量/周报试跑/AI快捷指令/情报半自动解析填充

## Phase 1 情报解析填充后端
- [x] LLM 结构化抽取 API：解析用户粘贴的公开工商文本→按 Excel 模板字段规范输出（server/intelParser.ts，json_schema 严格模式+服务端兜底校验，样例文本 12 字段全对且自动忽略个人手机号）
- [x] 解析结果预览确认→写入 enrichments→自动重算 Lead 评分→联动雷达（复用 importEnrichment 通道+台账留痕 ai_parse_intel）
- [x] 合规边界：仅解析粘贴文本，不访问外网/不调 API；对话框内置合规声明条；IntelProvider 接口预留第三方工商 API 接入插槽

## Phase 2 前端接入
- [x] 企业360抽屉情报富集档案区加【AI解析填充】按钮→解析对话框（粘贴→解析→逐字段勾选预览核对→写入）
- [x] 支持输出 Excel 数据片段（TSV 一键复制，可粘贴到回填模板）
- [x] AI 面板加三个常驻快捷指令：今日该找谁 / 本周复盘 / 园区健康摘要

## Phase 3 i18n 全量覆盖
- [x] 核心业务术语英文口径表（暖引荐 Warm Referral / 信软管道 SWE Talent Pipeline / 作战名单 Action Roster / 培育池 Nurture Pool / 黄金象限 Golden Quadrant 等，i18n.ts 顶部注释固化）
- [x] 对外核心用户面双语化：三屏正文/按钮/KPI/图表标注/抽屉区块/任务页/AI快捷指令（约120词条）；企业名/信号/NBA 等业务数据保持中文源语言；管理员内部工具（规则中心/导入/解析对话框）保持中文（边界已在迭代6条目注明）
- [x] 英文态 4 页截图验证 + 中文态回归验证

## Phase 4 试跑与回归
- [x] weekly-digest 试跑验证：临时每分钟任务触发生产站 /api/scheduled/weeklyDigest，HTTP 200 · 3.6s · status success（周报生成+通知推送链路打通），试跑任务已删除，正式任务保留（周五北京09:00）
- [x] vitest 39/39 全过 + 生产构建通过

## Phase 5 交付
- [x] 保存检查点（自动发布）并交付

# 迭代 8 · 解析批量化 + 移动端快速解析闭环

## Phase 1 批量解析后端
- [x] 多企业文本切分：parseIntelBatch（切分锚点=企业全称/USCC，最多20家，服务端兜底校验同单家；端到端验证两家样例 12 字段全对、精确匹配、自动忽略个人手机号）
- [x] 批量解析 API（ai.parseIntelBatch，protected）：返回每行 parsedName/eid/matchedName/exact/parsed，matchEntity 三态匹配（精确/模糊/未匹配），台账 ai_parse_intel_batch 留痕
- [x] 批量写入复用 importEnrichment 通道：勾选行一并提交 rows→统一校验入库→复算→全看板联动（verified=待核验，remark 记录识别名）

## Phase 2 批量前端
- [x] 屏二工具条加「AI 批量解析」入口（与情报导入并列，i18n 词条 batchParse）
- [x] 批量预览：逐行匹配标签（精确/模糊/未匹配三色）+ 目标企业修正下拉 + 勾选取舍 + 抽取字段摘要/疑点展示 + 一并写入
- [x] 写入结果反馈：toast 报成功/跳过行数，评分统一复算联动看板

## Phase 3 移动端快速解析闭环
- [x] 解析对话框移动端全屏化：单家 IntelParseDialog 与批量 IntelBatchDialog 均 h-[100dvh] sm:h-auto 全屏 sheet + 大按钮触控
- [x] 剪贴板快捷读取：两对话框均加「从剪贴板粘贴」按钮（clipboard.readText，未授权降级提示手动粘贴）
- [x] 移动端验证：375px 视口截图确认入口可触达、对话框全屏样式生效；解析→写入→复算→联动为与桌面端同一后端通道（LLM 端到端直调验证 + vitest 覆盖），移动端交互闭环建议用户真机体验并反馈

## Phase 4 验证交付
- [x] vitest 47/47 全过（新增 iteration8：归一化/三态匹配/权限拦截/输入校验 8 例）+ 生产构建通过 + LLM 端到端验证
- [x] 保存检查点（自动发布）并交付（version 3282e54e 已自动发布上线）

# 迭代9 · 第一波升维（可解释性外显 + 白底工作台 + 情报工作面板 v1）

## Phase 1 可解释性后端
- [x] explain API（park.explain，public 遵循脱敏）：按企业组装七问视图数据——依据（评分/Tier/排名）、证据（12维得分明细+富集字段与核验状态）、信号（命中信号+Tier+衰减状态）、关系（暖引荐路径+切入点）、时间线事件（生命周期+富集写入）、模型逻辑（规则版本+权重+阈值）、置信度（数据完备度推导）
- [x] 置信度口径：以富集字段核验状态与信号新鲜度推导（已核验字段占比 + 活跃信号数），输出高/中/低 + 说明（E703 实测：中 60%，理由=字段2项覆盖不足/待核验/2条新鲜信号）
- [x] vitest：explain 输出结构完整性 + 脱敏模式下企业名脱敏（iteration9 8 例）

## Phase 2 白底办公模式默认化
- [x] 默认主题切换为浅色办公模式（localStorage 已有偏好者尊重其选择；路演/大屏模式仍强制深色）
- [x] 浅色模式按 Linear/Stripe 基准重打磨：近纯白基面、发丝线边框、卡片极浅阴影、侧栏微灰分层、信号色对比度适配
- [x] 双模式回归：深色（?theme=dark）屏一/屏二观感不变，浅色四页截图全检

## Phase 3 前端七问视图 + 情报工作面板 v1
- [x] 屏二作战名单每行加「为什么」按钮 → ExplainSheet 七问视图弹层（防嵌套按钮用 role=button）
- [x] EntityDrawer 改造为情报工作面板 v1：四 Tab——决策（评分+生命周期+话术+NBA）/ 信号流（时间倒序+衰减注记）/ 证据（富集档案+AI解析+12维）/ 历史（时间线节点样式事件流）+「为什么」Tab 内嵌七问
- [x] 工作面板 Tab 化交互 + i18n 词条补齐（whyBtn/exBasis~exConfidence/tabDecision~tabHistory 15 条）；移动端：375px 视口屏二渲染与「为什么」按钮触达已截图验证，抽屉沿用既有 w-full 全宽自适应（Tab 触控体验建议真机复核）

## Phase 4 验证交付
- [x] vitest 55/55 全过 + 生产构建通过 + 双主题截图验证 + E701/E703 explain 端到端验证（证据链 88+6+3-0=97 与评分同口径）
- [x] 保存检查点（自动发布）并交付（version c1a01f35 已自动发布上线）

# 迭代10 · 第二波升维（因果时间线 + 信号流水线 v1 + 意图标签）

## Phase 1 因果时间线后端
- [x] timeline API（park.timeline）：聚合信号命中/富集写入（Excel导入+AI解析）/生命周期触达/任务打卡为单一时间轴，因果注记 impact（信号加分通道/富集修正/漏斗更新）；规则变更为全局事件不入企业轴（v1 边界已在返回 note 注明）
- [x] 事件轴时间倒序，type/at/title/detail/actor/impact 字段，遵循脱敏（actor/detail 脱敏）；E703 端到端验证通过

## Phase 2 信号流水线 v1 + 意图标签引擎
- [x] 信号流水线 pipelineSignals：去重归并（同文本合并计数保留最近日期/最高Tier）、来源标注（楼层索引实勘/情报回填）、置信度评级（已核验回填=高，实勘/未核验=中，衰减过半降档）
- [x] 意图标签引擎 inferIntents（规则版可解释）：扩张中/抢人窗口/IPO股改倾向/AI转型 四条默认规则（signal_kw/enrich_field/ind_in/cross 条件组合），输出 label+触发规则+命中证据；E703 实测命中 3 标签
- [x] 意图规则并入 DEFAULT_RULES.intents（随规则引擎默认规则加载，ruleConfigs 键体系可覆盖）

## Phase 3 前端呈现
- [x] 情报工作面板"历史"Tab 升级为因果时间线 TimelinePane（事件类型徽章分色 + 因果注记 ↳ + 操作人，倒序）
- [x] "信号流"Tab 升级：来源标注（楼层索引实勘/情报回填）+ 置信度徽章（高/中/低分色）+ 归并计数 ×N + 新鲜度/衰减百分比
- [x] 意图标签上屏：雷达作战名单行 + 企业360头部 IntentBadge（◈ 标签，title=触发规则+命中证据）；屏二截图验证 E703 三标签正确显示
- [x] i18n 词条补齐（sigSource/sigConfidence/sigFresh/sigDecayed/tlTitle/tlDesc/intentTitle 共 7 条）

## Phase 4 验证交付
- [x] vitest 全量 61/61 通过（新增 iteration10.test.ts 6 用例：归并计数/来源置信度/衰减降档/意图命中/可解释输出/边界）+ 生产构建通过
- [x] 双主题回归审阅结论：深色屏二（全页截图）意图标签 ◈扩张中/抢人窗口/AI转型 三标签在 E703 名单行正确显示、对比度充足；浅色屏二同样正确（截图审阅确认）；英文态侧栏/工具条全英文正常
- [x] 修复 timeline 信号事件日期解析缺陷：DB 富集信号为 YYYY-MM-DD 格式被旧正则跳过，兼容后 E703 时间线从 3 事件恢复为 5 事件（3 状态推进 + 2 信号命中，倒序正确）
- [x] E703 抽屉数据链路验证：snapshot.intents 三标签（含触发规则+命中证据）、EntityDrawer 头部 238 行 IntentBadge 渲染接线确认；timeline API 端到端输出完整
- [x] 保存检查点 fca675bf（自动发布上线）并交付

# 迭代11 · 第三波升维（关系图谱数据化 + 需求预测引擎 v1 + 学习飞轮）

## Phase 1 关系图谱数据化
- [x] graphNodes/graphEdges 两张表建库（0003 迁移，SHOW TABLES 确认）
- [x] seedGraph 幂等播种：4 生态节点（信软学院/高于×感知/协会/专业服务网络）+ 31 企业节点 + 35 条边（referral 16/alumni 8/partner 9/pipeline 2），空库自动播种
- [x] graph API：park.graph.get（全图查询，公司节点遵循脱敏）+ park.graph.chains（BFS ≤3 跳路径推演，按平均强度排序）+ graph.seed（管理员，台账留痕）；E703 实测 2 条可达链路输出正确

## Phase 2 连接器抽象层 + 需求预测引擎 v1
- [x] connectors.ts 连接器抽象层：Connector 接口 + 手工回填数据源（active）+ 招聘 API 插槽（planned），fetchAllDemand 多源合并
- [x] demandPredict.ts 预测引擎：岗位方向（回填>信号>行业三级推断）+ 数量级 + 时间窗（Tier-1扩张/抢人窗口→0-30天）+ 依据清单 + 置信度三级
- [x] park.predict.list / park.predict.connectors API；实测 21 条 P0/P1 预测，E703 批量(≥10)/0-30天/依据3条输出正确，排序按紧迫度

## Phase 3 学习飞轮
- [x] 命中统计：flywheel.ts 结果判定（最新=已成交→won / 从更高状态回退→lost）+ 原因编码提取 + 命中指标（成交高价值占比/成交均分对比/流失P0占比）；park.flywheel API 实测正确（E703 流失"预算不足"）
- [x] 校准建议引擎：四类可解释建议（冷启动/上调信号权重/收紧P0阈值/保持现状），含依据与建议 patch，样本<5 置信度自动降档（人在环，只产建议）
- [x] 一键应用：规则中心新增"飞轮校准"卡片（FlywheelCard），展示命中统计/结果回填明细/建议 + 一键应用走影响预览→确认→保存流程（复用 rules.preview/save 体系，写台账）
## Phase 4 前端接入
- [x] 屏三改为图数据驱动：park.graph.get 渲染节点/边（企业节点按图边 pathTag 分组布点，连线粗细=图边强度，保留原视觉风格），备注栏标注"35 节点/35 边 · 图数据驱动"
- [x] 屏三新增"引荐路径推演"面板：点击企业节点（关系图/P0 顺位）→ park.graph.chains → 展示可达链路（summary + 逐跳 relType/强度/证据 + 平均强度徽章），选中节点带高亮环
- [x] 需求预测面板：屏二作战名单下方挂载 PredictPanel（时间窗分色徽章/岗位方向/数量级/置信度/展开依据清单/查看企业360 联动抽屉）
- [x] 规则中心"飞轮校准"卡片 + 连接器状态展示（手工回填=active 运行中，招聘API=planned 插槽）
- [x] i18n 词条补齐（predictTitle/predictSub/predictDirection/predictSource/confidence/view360/chainTitle/chainSub/chainEmpty/chainStrength/graphDriven 共 11 条）
## Phase 5 验证交付
- [x] vitest 全量 69/69 通过（新增 iteration11.test.ts 8 用例：播种幂等/图结构/脱敏掩码/E703 链路推演排序/不存在节点/预测字段完整性/连接器清单/飞轮建议结构）+ 生产构建通过
- [x] 端到端验证：chains API E703 返回 2 条链路（平台→园区股份→睐视 avg75；平台→信软学院→睐视）；屏二预测面板/屏三推演面板/规则中心飞轮卡片截图确认渲染正确
- [x] 保存检查点 eca55158（自动发布）并交付

# 迭代12 · 解析历史溯源 + Intent 补强 + 分享卡片

## Phase 1 后端：解析历史
- [x] parseHistory 表建库（原文快照 + 抽取结果 JSON + 写入字段清单 + 操作人 + 时间）
- [x] AI 解析写入（单家/批量）时同步落历史快照
- [x] park.parseHistory.list API（按企业筛选）+ 字段级溯源（fieldSources：字段→最近写入批次）
## Phase 2 后端：Intent 核对 + 分享卡片
- [x] 核对迭代10四类意图标签与用户附件建议口径（IPO倾向/AI转型/扩张），补齐缺口：IPO 与融资拆分独立标签，新增「融资活跃」
- [x] park.shareCard API：解析完成/状态变更两种场景生成企微/飞书友好分享文本卡片
## Phase 3 前端
- [x] 证据 Tab 富集档案字段旁展示溯源标记（来源：第N次解析/Excel导入）
- [x] 解析历史记录界面（抽屉内或独立区块：原文快照可展开 + 结果对照）
- [x] 分享卡片入口：解析完成后 + 状态标记后弹出「复制分享卡片」，格式适配企微/飞书粘贴（另加决策 Tab 常驻按钮）
- [x] i18n 词条补齐
## Phase 4 验证交付
- [x] vitest 新增用例 8 条 + 全量 77/77 通过 + 生产构建通过
- [x] 截图验证 + 保存检查点（自动发布）并交付

# 迭代13 · 决策闭环升维（Decision Loop · 对标 Palantir/6sense/Salesforce/ServiceNow）
## Phase 1 审计
- [x] 拆解研读来源提示词（12模块建议）与商业模式 PDF（六层收入+飞轮）
- [x] 盘点现有原型能力地图，产出决策闭环审计报告 docs/decision-loop-audit.md（六环节逐项判定）
## Phase 2 后端：决策对象化 + 需求画布 + 资源匹配
- [x] decisions 表 + resources 表建库（迁移 0005 已应用）
- [x] 需求画布（Need Canvas）：7类需求强度由信号/富集/意图推断（人才/融资/政策/市场/研发/数字化/法务）
- [x] 企业生命周期阶段推断（种子→初创→成长→Pre-A→A→B→IPO准备→上市→龙头）
- [x] resources 资源库表 + 匹配引擎：需求→自动匹配资源（导师/猎头/校友/投资人/服务商/高于人力），12条种子幂等播种
## Phase 3 后端：决策中心 + Outcome + 学习回路
- [x] Decision Center 聚合 API：今日 AI 建议按决策类型分组（联系/导师/HR咨询/政策/引荐）+ 原因 + 星级
- [x] 决策执行流转：建议→采纳（指派负责人）→执行中→结果回填（won/lost/partial，done 必须带 outcome）
- [x] Outcome 量化：决策级 ROI 统计（采纳率/执行率/成交率/收入归因六层模型映射）
- [x] 学习回路：决策结果回写学习飞轮，校准建议关联决策类型命中率
## Phase 4 前端（用户已授权新页面，对标 Palantir AIP / 6sense Action-First）
- [x] 新建「决策中心 Decision Center」独立页面（全站动线入口）：今日 AI 决策建议流（分组+原因+星级+一键采纳指派）+ 决策闭环漏斗 + 决策级 ROI 统计
- [x] 企业360 决策 Tab 增加需求画布（7维星级）+ 生命周期阶段 + 资源匹配推荐（DecisionProfilePane）
- [x] 任务页接入决策执行流转（DecisionExecStrip 承接 adopted/executing 决策）
- [x] 规则中心/飞轮卡片显示决策级学习统计（按决策类型命中率表）
## Phase 5 验证交付
- [x] vitest 新增 13 个迭代13用例，全量 90/90 通过 + 生产构建通过
- [x] 交付审计报告 + 升级后原型（检查点自动发布）

# 迭代14 · 协作分单 + 金额口径 ROI + 资源库管理 + 布局 BUG 全量修复
## Phase 1 布局 BUG 审计修复
- [x] 修复企业360抽屉头部重叠 BUG（企业名/徽章/评分/Tab 栏叠压穿透，用户截图实证）
- [x] 全站同类隐藏问题审计：重叠/溢出/遮挡/移动端挤压/长文本截断等，逐一修复
## Phase 2 后端
- [x] 成员名单 API + 决策指派（transition 支持 assignee 参数，adopted 时指派任意成员）
- [x] Outcome 回填加成交金额 dealAmount，ROI 升级金额口径（按收入层聚合金额，对齐六层收入模型）
- [x] 资源库 CRUD API（adminProcedure：新增/编辑/停用/容量维护，台账留痕）
## Phase 3 前端
- [x] 决策中心采纳时负责人指派下拉（成员名单）
- [x] 完成回填表单加成交金额输入；ROI 统计条加金额口径（累计成交额/分层收入）
- [x] 资源库管理页（管理员）：列表+新增/编辑/停用+容量维护，决策中心匹配实时联动
## Phase 4 验证交付
- [x] vitest 新增用例全量通过 + 生产构建 + 双主题/移动端截图回归
- [x] 保存检查点（自动发布）并交付

# 迭代15 · 抽屉Header根治 + 我的决策 + 容量自动扣减 + 月度经营报表
## Phase 1 抽屉 Header 根治（硬性约束）
- [x] 定位公共样式根因（真根因：.flex min-height:0 × SheetContent flex列 → SheetHeader 被 flex-shrink 压缩至16px，子行叠压；量化实证），复现样本：成都眸视科技
- [x] 标准 Flex 文档流重构：企业名/徽章/指标/Tab 严格分行，Tab 与 Header 解耦固定在头部下方，标签自动换行，容器自适应高度
- [x] 全域排查所有侧滑抽屉/详情头部组件（EntityDrawer/ExplainSheet/解析对话框/AiPanel/Dialog 等），输出排查清单 docs/drawer-header-audit.md
- [x] 边界场景回归：长企业名/多标签/移动端/大屏模式/双主题/路演模式
## Phase 2 后端
- [x] 资源容量自动扣减：采纳/执行占用容量，完成/放弃释放；超容量拦截派单（决策生成与转移双闸）
- [x] 月度经营报表 API：按成员/资源/决策类型汇总成交金额与转化率
- [x] 报表 Excel 导出 API（导出留痕）
## Phase 3 前端
- [x] 决策中心「我的决策」筛选视图（按负责人过滤）
- [x] 资源卡/管理页显示容量占用（已占/总量）
- [x] 月度经营报表视图 + 一键导出 Excel
## Phase 4 验证交付
- [x] vitest 新增用例全量通过 + 生产构建 + 排查清单交付
- [x] 保存检查点（自动发布）并交付

# 迭代16 · V3 升维：Decision Intelligence OS（十阶段指令）
## Phase 1 产品审计（不动代码）
- [x] 拆解评审意见 pasted_content_4 + V3 提示词十阶段要求
- [x] 输出七视图审计：IA / User Journey / Decision Journey / Data Flow / AI Flow / Agent Flow / Scenario Flow
- [x] P0/P1/P2 问题清单 + 重构 IA + 分波实施蓝图
## Phase 2 波次一：Decision Engine 2.0
- [x] 九要素 Decision Card（Score/Evidence/Reason/Confidence/Risk/Opportunity/Action/Impact/Learning）
- [x] Evidence Graph 可解释层（含 Counterfactual「不采纳会怎样」）
- [x] Decision Health 五维北极星（Velocity/Quality/Impact/ROI/Learning）
## Phase 3 波次二：Scenario OS
- [x] Scenario Workspace 数据模型与引擎（场景自动关联企业/政策/资源/决策）
- [x] 首页重构：Scenario 为首页，Dashboard 降为视图；IA 导航重组
## Phase 4 波次三：Graph What-if + Simulation
- [x] Graph 计算引擎：新增/流失企业 What-if 传导（税收/就业/产业链/面积/人才）
- [x] Simulation Center：招商/政策/资源 ROI 模拟器
## Phase 5 波次四：Memory + Agent + Marketplace
- [x] Organizational Memory（跨屏记忆检索，AI 自动引用）
- [x] Multi-Agent 体系（8 Agent 职责/输入/输出/协作可视化 + 运行日志）
- [x] Decision Marketplace（Playbook/模板/场景包，生态雏形）
## Phase 6 验证交付
- [x] 全量 vitest + 生产构建 + 双主题/移动端回归
- [x] 保存检查点（自动发布）+ 交付审计报告

## 迭代17-22 · 工单书（从路演 Demo 到可售产品）
### 迭代17（工单1+2）
- [x] 工单1: connectors/ingestionJobs 表 + AclTransform 防腐层 + 工商/招聘/专利三 adapter（CSV/粘贴入口）
- [x] 工单1: /connectors 页面（连接器状态卡 + ingestionJob 历史）
- [x] 工单2: entityResolution.ts（USCC 主键/归一化/模糊匹配打分）+ mergeDecisions 表
- [x] 工单2: 人工消歧队列页 Disambiguation.tsx（确认/撤销/存疑）+ opsLedger 留痕
### 迭代18（工单3+4）
- [x] 工单3: decisionLedger.ts append-or-abort + decisions.based_on 完整溯源链 + trace API + ProvenanceDrawer
- [x] 工单4: authz.ts RBAC-ABAC 中间件 + consents 表 + 字段级脱敏 + 治理页策略配置
### 迭代19（工单5）
- [x] 工单5: 业务表 +tenant_id + TenantContext + 仓储层强制过滤 + 双租户隔离 vitest
### 迭代20（工单6+7）
- [x] 工单6: PathFinder Top-3 可信路径 + CommunityDetection + embedding 语义召回 + 引荐页接入
- [x] 工单7: llmGateway 可插拔模型 + Tool Contract + 护栏（注入检测/HITL）+ agentEval 评测集
### 迭代21（工单8）
- [x] 工单8: workflowEngine（WorkflowRuntime/TaskManager SLA/SagaCoordinator）+ 任务页流程实例
### 迭代22（工单9）
- [x] 工单9: learningEngine（OutcomeCollector/权重重估/champion-challenger/人审晋升/血缘）
### 收尾
- [x] 全量测试 + 生产构建 + 检查点发布交付

# 迭代23-26（工单10-17 · 可交付闭环）
- [x] 工单10: pipelineOrchestrator 十段事件驱动流水线 + iteration23 集成测试 + DecisionCenter 串联视图
- [x] 工单11: acceptance 验收 Harness（36条）+ acceptanceReport 生成 docs/acceptance-report.md
- [x] 工单12: demoSeed 一键演示 + DemoMode 引导十段 + 溯源钻取到 ingestionJob
- [x] 工单13: qccConnector/jobBoardConnector 实装（env key/降级）+ 69家回填复算
- [x] 工单14: Dockerfile+compose+配置包+国产库(OceanBase MySQL 兼容)适配 + docs/deploy.md
- [x] 工单15: observability /health+metrics+traceId + 审计看板 + docs/ors Runbook
- [x] 工单16: attribution 归因引擎 + ROI.tsx 看板（revenueTier 拆分/漏斗/导出/溯源）
- [x] 工单17: 路演模式增强 + parkProvision 一键开园（计时/独立/零代码）
- [x] 全链回归 + 生产构建 + 检查点发布交付

# 迭代27（工单18-22 · 硬化收尾 · 封版）
- [x] 工单18: 安全加固（依赖漏洞扫描修复+越权回归套件+注入回归+密钥脱敏+docs/security-selfcheck.md）
- [x] 工单19: 性能压测（loadgen数千实体+benchmark压测+索引优化+docs/perf-report.md）
- [x] 工单20: 数据质量闸门（字段校验+置信度门禁+脏数据隔离区+质量看板）
- [x] 工单21: 试点埋点（行为埋点+运营度量看板+学习引擎回流+对照基线）
- [x] 工单22: 备份/恢复/迁移（一键备份+恢复演练+灾备手册+迁移工具）
- [x] 封版：全链回归 + 生产构建 + 检查点发布

# 迭代28（数据来源与证据治理 · 端到端链路）
- [x] Phase1: 数据地基（7张新表 dataSources/ingestionBatches/evidenceRecords/dataConflicts/entityAliases/sourceFieldPolicies/decisionEvidenceLinks + migration）
- [x] Phase2: 后端服务层（sourceService/ingestionService/evidenceService/conflictService/entityResolution v2 + tRPC路由）
- [x] Phase3: 端到端链路测试（上传→来源→匹配→证据→冲突→采用→回滚 12/12全绿）
- [x] Phase4: 前端最小UI（IngestionWizard五步向导 + 企业360字段级证据 + 冲突中心 + 来源目录 + 批次回滚）
- [x] Phase5: 全链回归252/252 + 生产构建通过 + 封版

## 迭代28 · 数据环境隔离（压测数据污染修复）
- [x] 排查压测入口（loadgen.ts → entities/enrichments/graphEdges 2000+2000+100 条）
- [x] 数据库迁移：entities 增加 dataEnvironment + testRunId 字段
- [x] 标记现有压测数据为 load_test（testRunId=legacy-loadgen-001）
- [x] 后端隔离：dataAdapter.loadEntities 过滤 production/demo，排除 test/load_test
- [x] 压测清理服务：listTestRuns/cleanupTestRun/getEnvironmentStats/validateLoadTestWrite
- [x] tRPC 路由：park.loadTest.runs/cleanup/envStats（管理员限定）
- [x] 压测脚本改造：唯一 testRunId + dataEnvironment=load_test + --cleanup 能力
- [x] 前端环境标识：ScreenLayout 顶部 DataEnvironmentBanner
- [x] 安全保护：validateLoadTestWrite 非管理员禁止写入压测数据
- [x] 测试验证 7/7：正式查询不返回 load_test / 清理不影响真实企业 / 权限校验
- [x] 全量回归 259/259 + 生产构建通过
