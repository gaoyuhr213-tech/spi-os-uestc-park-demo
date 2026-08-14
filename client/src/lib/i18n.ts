/* 迭代6 · 中英双语 i18n 框架
   - 界面文案字典（zh/en），业务数据（企业名/信号/话术正文）保持源语言（数据层内容，非 UI 文案）
   - 语言偏好 localStorage 持久化 + URL ?lang= 参数支持（便于分享）
   - zustand 全局状态，切换实时生效无需刷新 */
import { create } from "zustand";

export type Lang = "zh" | "en";

const DICT = {
  /* 品牌与导航 */
  brandSub: { zh: "园区智能 · Park Ops", en: "Park Intelligence OS" },
  brandDesc: { zh: "电子科大国家大学科技园\n人才生态路演看板", en: "UESTC National Science Park\nTalent Ecosystem Console" },
  navHome: { zh: "园区健康看板", en: "Park Health" },
  navScenario: { zh: "场景中枢", en: "Scenario OS" },
  navSim: { zh: "推演中心", en: "Simulation" },
  navGov: { zh: "记忆 · Agent · 市场", en: "Governance" },
  navDecision: { zh: "决策中心", en: "Decision Center" },
  navRadar: { zh: "P0/P1 线索雷达", en: "Lead Radar" },
  navReferral: { zh: "暖引荐地图", en: "Referral Map" },
  navTasks: { zh: "触达任务清单", en: "Action List" },
  numHome: { zh: "屏一", en: "S1" },
  numScenario: { zh: "场景", en: "OS" },
  numSim: { zh: "推演", en: "Sim" },
  numGov: { zh: "治理", en: "Gov" },
  numDecision: { zh: "中枢", en: "Hub" },
  numRadar: { zh: "屏二", en: "S2" },
  numReferral: { zh: "屏三", en: "S3" },
  numTasks: { zh: "任务", en: "Do" },
  /* 侧栏控件 */
  themeToLight: { zh: "切换 · 浅色办公模式", en: "Switch to Light Office" },
  themeToDark: { zh: "切换 · 深色作战模式", en: "Switch to Dark Ops" },
  maskOn: { zh: "数据脱敏 · 已开启", en: "Data Masking · ON" },
  maskOff: { zh: "数据脱敏 · 关闭", en: "Data Masking · OFF" },
  present: { zh: "进入路演模式", en: "Presentation Mode" },
  presentHint: { zh: "全屏 · 方向键翻屏 · ESC 退出 · 自动锁定深色", en: "Fullscreen · Arrow keys · ESC to exit · Dark locked" },
  bigScreen: { zh: "数据大屏模式", en: "Big Screen Mode" },
  bigScreenHint: { zh: "投屏专用 · 快捷键 B 启停", en: "For projection · Press B to toggle" },
  rulesCenter: { zh: "规则中心 · 管理员", en: "Rule Center · Admin" },
  resourceAdmin: { zh: "资源库管理 · 管理员", en: "Resources · Admin" },
  connectorCenter: { zh: "数据接入 · 管理员", en: "Data Ingestion · Admin" },
  langSwitch: { zh: "English", en: "中文" },
  complianceTitle: { zh: "合规红线", en: "Compliance" },
  compliance: { zh: "：仅用企业公开信息做企业级BD；候选人信息按劳动法/PIPL合规处理。", en: ": Corporate BD uses public info only; candidate data handled per labor law / PIPL." },
  footerSrc: { zh: "数据源：楼层索引 · 真实 69 家主体", en: "Source: Floor index · 69 real entities" },
  footerEngine: { zh: "评分/分级/漏斗 = 后端规则引擎 v1 实时计算", en: "Scores/tiers/funnel computed by backend rule engine v1" },
  footerMask: { zh: "脱敏开关适配对外路演信息安全要求", en: "Masking switch for external roadshow security" },
  maskBadge: { zh: "脱敏模式", en: "Masked" },
  exitPresent: { zh: "退出路演模式", en: "Exit presentation" },
  presentKeys: { zh: "← → 翻屏 · ESC 退出", en: "← → navigate · ESC exit" },
  /* AI 助手 */
  aiOpen: { zh: "AI 助手", en: "AI Copilot" },
  aiTitle: { zh: "AI 招商决策助手", en: "AI Investment Copilot" },
  aiSub: { zh: "基于后端实时快照 · 回答供人工决策参考", en: "Backed by live snapshot · For human decision reference" },
  /* 通用 */
  loading: { zh: "加载中…", en: "Loading…" },
  export: { zh: "导出", en: "Export" },
  login: { zh: "登录", en: "Sign in" },

  /* ===== 迭代7 全量覆盖 · 核心业务术语口径 =====
     暖引荐 Warm Referral / 信软管道 SWE Talent Pipeline / 作战名单 Action Roster
     培育池 Nurture Pool / 黄金象限 Golden Quadrant / 触达 Outreach / 线索 Lead */
  /* 屏一 · 园区健康看板 */
  s1Title: { zh: "园区健康看板", en: "Park Health Board" },
  s1Desc: { zh: "电子科大国家大学科技园 · 1F–13F 全楼宇 · 数据源：楼层索引（2026-07）+ 情报富集库 · KPI 由后端规则引擎实时计算", en: "UESTC National Science Park · Floors 1F–13F · Source: floor index (2026-07) + intel enrichment · KPIs computed live by backend rule engine" },
  kpiEntities: { zh: "入驻主体", en: "Tenant Entities" },
  kpiEntitiesNote: { zh: "唯一主体（原始72条合并）", en: "Unique entities (72 raw merged)" },
  kpiLeads: { zh: "高价值线索", en: "High-Value Leads" },
  kpiHealth: { zh: "园区健康指数", en: "Park Health Index" },
  kpiHealthNote: { zh: "平均 Lead 分加权（后端）", en: "Weighted avg lead score (backend)" },
  kpiMatch: { zh: "人才供需匹配率", en: "Talent Match Rate" },
  kpiMatchNote: { zh: "信软管道加权撮合（后端）", en: "SWE pipeline weighted (backend)" },
  kpiSignals: { zh: "活跃信号", en: "Active Signals" },
  tierDist: { zh: "优先级分布", en: "Priority Distribution" },
  tierDistSub: { zh: "Lead Tier · 双轴评分：招聘需求强度 × 信软管道匹配度", en: "Lead tier · dual-axis: hiring intensity × SWE pipeline match" },
  tierP0: { zh: "P0 立即触达", en: "P0 Outreach Now" },
  tierP1: { zh: "P1 重点培育", en: "P1 Key Nurture" },
  tierP2: { zh: "P2 机会型", en: "P2 Opportunistic" },
  tierN: { zh: "N 培育池", en: "N Nurture Pool" },
  indDist: { zh: "行业分布", en: "Industry Mix" },
  indDistSub: { zh: "软件/AI/芯片/通信合计约 30 家，与信软学院供给高度对口", en: "~30 firms in software/AI/chips/telecom, aligned with SWE school supply" },
  indLegend: { zh: "浅青灰 = 信软学院管道直供行业（软件 / AI / 芯片 / 通信）", en: "Light slate = industries fed by SWE pipeline (software / AI / chips / telecom)" },
  t1Signals: { zh: "Tier-1 关键信号", en: "Tier-1 Key Signals" },
  t1SignalsSub: { zh: "扩张 / 股改 / 高管需求 · 点击查看企业 360", en: "Expansion / restructuring / exec hiring · click for company 360" },
  floorHeat: { zh: "楼宇入驻热力", en: "Floor Occupancy Heat" },
  floorHeatSub: { zh: "1F–13F · 点亮 = 高价值", en: "1F–13F · lit = high value" },
  nextScreen: { zh: "下一屏", en: "Next" },
  backToS1: { zh: "回到屏一 · 园区健康看板", en: "Back to S1 · Park Health" },
  /* 屏二 · 线索雷达 */
  s2Title: { zh: "P0 / P1 高价值线索雷达", en: "P0 / P1 Lead Radar" },
  s2Desc: { zh: "双轴锁定 26 条高价值线索：横轴 = UESTC 信软管道匹配度，纵轴 = Lead 评分（后端规则引擎实时计算）· 点击任意目标查看企业 360", en: "26 leads on dual axes: X = SWE pipeline match, Y = lead score (computed live by backend). Click any dot for company 360" },
  exportLeads: { zh: "导出名单", en: "Export Roster" },
  importIntel: { zh: "情报导入", en: "Import Intel" },
  batchParse: { zh: "AI 批量解析", en: "AI Batch Parse" },
  colorBy: { zh: "散点分色", en: "Color by" },
  byTier: { zh: "按优先级", en: "By Tier" },
  byStage: { zh: "按触达状态", en: "By Stage" },
  goldenQuadrant: { zh: "黄金象限 · 高分 × 高匹配", en: "Golden Quadrant · High × High" },
  watchPool: { zh: "观察池", en: "Watch Pool" },
  highScoreWait: { zh: "高分 · 匹配待建", en: "High score · match TBD" },
  axisX: { zh: "信软管道匹配度 →", en: "SWE Pipeline Match →" },
  axisY: { zh: "Lead 评分", en: "Lead Score" },
  battleNote: { zh: "作战批注 · 屏二", en: "Ops Notes · S2" },
  todayRoster: { zh: "今日作战名单", en: "Today's Action Roster" },
  rosterSub: { zh: "按 Lead 评分排序（后端）· NBA 已生成", en: "Sorted by lead score (backend) · NBA generated" },
  funnelTitle: { zh: "90 天转化漏斗", en: "90-Day Conversion Funnel" },
  funnelSub: { zh: "P0+P1 共 26 家 · 后端事件流实时聚合", en: "26 P0+P1 firms · aggregated live from event stream" },
  funnelGoal: { zh: "90 天目标：签约 2–3 家付费 HR 服务", en: "90-day goal: sign 2–3 paid HR service deals" },
  stageUntouched: { zh: "未触达", en: "Untouched" },
  stageTouched: { zh: "已触达", en: "Contacted" },
  stageMet: { zh: "已约见", en: "Meeting Set" },
  stageWon: { zh: "已成交", en: "Won" },
  touchRate: { zh: "触达率", en: "Outreach rate" },
  /* 屏三 · 暖引荐地图 */
  s3Title: { zh: "暖引荐地图", en: "Warm Referral Map" },
  s3Desc: { zh: "三边闭环：信软学院（供给）× 高于×感知（平台）× 69 家租户（需求）· 园区股份是打通一切的枢纽 · 点击路径图例高亮", en: "Three-way loop: SWE School (supply) × GY×SPI (platform) × 69 tenants (demand). Park Holdings is the hub. Click legend to highlight paths" },
  whyWarm: { zh: "为何不是陌拜，而是暖引荐", en: "Why Warm Referral, Not Cold Call" },
  roadmap90: { zh: "90 天路线图", en: "90-Day Roadmap" },
  p0Order: { zh: "P0 首轮触达顺位", en: "P0 First-Round Outreach Order" },
  pathA: { zh: "路径A · 电子科大系", en: "Path A · UESTC Network" },
  pathB: { zh: "路径B · 园区锚点", en: "Path B · Park Anchor" },
  pathC: { zh: "路径C · 协会一对多", en: "Path C · Association 1:N" },
  pathD: { zh: "路径D · 专业服务互荐", en: "Path D · Pro-Service Referrals" },
  /* 任务页 */
  tasksTitle: { zh: "触达任务清单", en: "Outreach Action List" },
  tasksDesc: { zh: "本周作战节奏 · 任务由后端规则实时推演（首触/复访/培育跟进）· 勾选打卡计入周报，标记状态清单自动重算", en: "Weekly ops cadence · tasks derived live by backend rules (first-touch / revisit / nurture). Check off to log; roster recomputes on stage change" },
  exportTasks: { zh: "导出任务清单", en: "Export Tasks" },
  exportWeekly: { zh: "导出周报复盘", en: "Export Weekly Review" },
  weekRate: { zh: "完成率", en: "completion" },
  taskFirstTouch: { zh: "首触", en: "First Touch" },
  taskRevisit: { zh: "复访", en: "Revisit" },
  taskNurture: { zh: "培育跟进", en: "Nurture" },
  weekMoves: { zh: "本周作战动态", en: "This Week's Moves" },
  goS2Funnel: { zh: "查看屏二 · 转化漏斗", en: "View S2 · Funnel" },
  /* 企业360抽屉 */
  drawerScore: { zh: "Lead 评分", en: "Lead Score" },
  drawerTier: { zh: "优先级", en: "Priority" },
  drawerHiring: { zh: "招聘需求强度", en: "Hiring Intensity" },
  drawerCross: { zh: "跨楼层", en: "Multi-floor" },
  drawerPipe: { zh: "管道匹配度", en: "Pipeline Match" },
  drawerPath: { zh: "暖引荐路径", en: "Referral Path" },
  drawerEntry: { zh: "服务切入点", en: "Service Entry Point" },
  drawerLifecycle: { zh: "线索生命周期", en: "Lead Lifecycle" },
  drawerEnrich: { zh: "情报富集档案", en: "Intel Enrichment Dossier" },
  drawerPitch: { zh: "引荐话术", en: "Referral Pitch" },
  drawerDims: { zh: "Lead Score 拆解", en: "Lead Score Breakdown" },
  drawerSignals: { zh: "需求信号", en: "Demand Signals" },
  drawerNba: { zh: "推荐动作（NBA）", en: "Next Best Action (NBA)" },
  aiParse: { zh: "AI 解析填充", en: "AI Parse & Fill" },
  copied: { zh: "已复制", en: "Copied" },
  copyBtn: { zh: "一键复制", en: "Copy" },
  formalPitch: { zh: "正式版 · 决策层/高管", en: "Formal · Executives" },
  lightPitch: { zh: "轻量版 · HR/用人主管", en: "Light · HR / Managers" },
  /* AI 面板快捷指令 */
  quickWho: { zh: "今日该找谁", en: "Who to Contact Today" },
  quickReview: { zh: "本周复盘", en: "Weekly Review" },
  quickHealth: { zh: "园区健康摘要", en: "Park Health Digest" },
  /* 迭代9 · 七问解释链 */
  whyBtn: { zh: "为什么", en: "Why" },
  whyTitle: { zh: "为什么是这个结论", en: "Why This Conclusion" },
  exBasis: { zh: "依据 · 当前结论", en: "Basis · Conclusion" },
  exEvidence: { zh: "证据 · 评分构成", en: "Evidence · Score Breakdown" },
  exSignals: { zh: "信号 · 命中与衰减", en: "Signals · Hits & Decay" },
  exRelations: { zh: "关系 · 暖引荐通道", en: "Relations · Warm Referral" },
  exTimeline: { zh: "时间线 · 触达事件", en: "Timeline · Touch Events" },
  exModel: { zh: "模型逻辑 · 规则与阈值", en: "Model Logic · Rules & Thresholds" },
  exConfidence: { zh: "置信度 · 数据完备度", en: "Confidence · Data Completeness" },
  /* 迭代9 · 情报工作面板 Tab */
  tabDecision: { zh: "决策", en: "Decision" },
  tabSignals: { zh: "信号流", en: "Signals" },
  tabEvidence: { zh: "证据", en: "Evidence" },
  tabHistory: { zh: "历史", en: "History" },
  /* 迭代10 · 第二波：信号流水线 / 因果时间线 / 意图标签 */
  sigSource: { zh: "来源", en: "Source" },
  sigConfidence: { zh: "置信", en: "Conf." },
  provDrill: { zh: "溯源", en: "Trace" },
  sigFresh: { zh: "新鲜度", en: "Freshness" },
  sigDecayed: { zh: "已衰减至", en: "Decayed to" },
  tlTitle: { zh: "因果时间线", en: "Causal Timeline" },
  tlDesc: { zh: "信号命中 / 富集写入 / 状态推进 / 任务打卡合并为单一事件轴（后端聚合，倒序），每条事件附因果注记。", en: "Signals, enrichment, stage moves and task check-ins merged into one event axis (server-aggregated, newest first) with causal notes." },
  intentTitle: { zh: "意图标签", en: "Intent Tags" },
  /* 迭代11 · 第三波：需求预测 / 图谱路径推演 */
  predictTitle: { zh: "人才需求预测", en: "Talent Demand Forecast" },
  predictSub: { zh: "连接器驱动 · 可解释规则版 · 点击展开依据", en: "Connector-driven · Explainable rules · Click for basis" },
  predictDirection: { zh: "岗位方向", en: "Role direction" },
  predictSource: { zh: "数据来源", en: "Source" },
  confidence: { zh: "置信 ", en: "Conf. " },
  view360: { zh: "查看企业 360 →", en: "View company 360 →" },
  chainTitle: { zh: "引荐路径推演", en: "Referral Chain Inference" },
  chainSub: { zh: "点击图中企业节点 · 图数据 BFS ≤3 跳", en: "Click a company node · Graph BFS ≤3 hops" },
  chainEmpty: { zh: "点击关系图中任一企业节点，推演从平台出发的可达引荐链路", en: "Click any company node to infer reachable referral chains from the platform" },
  chainStrength: { zh: "链路强度", en: "Chain strength" },
  graphDriven: { zh: "图数据驱动", en: "Graph-data driven" },
  /* 迭代12 · 解析历史 / 字段溯源 / 分享卡片 */
  shareCard: { zh: "分享卡片", en: "Share Card" },
  shareCopied: { zh: "分享卡片已复制，可直接粘贴到企业微信 / 飞书群", en: "Card copied — paste into WeCom / Feishu" },
  shareHint: { zh: "生成企微/飞书分享卡片并复制", en: "Generate & copy WeCom/Feishu share card" },
  parseHistoryTitle: { zh: "解析历史", en: "Parse History" },
  parseHistorySub: { zh: "原文 + 结果快照 · 字段级溯源", en: "Raw + result snapshots · field provenance" },
  parseHistoryEmpty: { zh: "暂无解析/导入记录 · 通过「AI 解析填充」或「情报导入」写入后自动留痕", en: "No records yet — AI Parse & Fill or Intel Import writes are logged automatically" },
  rawTextView: { zh: "查看原文快照", en: "View raw snapshot" },
  rawTextHide: { zh: "收起原文", en: "Hide raw" },
  fieldsWrittenLabel: { zh: "写入字段", en: "Fields written" },
  sourceVia: { zh: "来源", en: "Via" },
} as const;

export type I18nKey = keyof typeof DICT;

function initialLang(): Lang {
  if (typeof window === "undefined") return "zh";
  const url = new URLSearchParams(window.location.search).get("lang");
  if (url === "en" || url === "zh") {
    localStorage.setItem("spi-lang", url);
    return url;
  }
  const saved = localStorage.getItem("spi-lang");
  return saved === "en" ? "en" : "zh";
}

interface I18nState {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: initialLang(),
  setLang: (l) => {
    localStorage.setItem("spi-lang", l);
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
    set({ lang: l });
  },
  toggleLang: () => set((s) => {
    const l = s.lang === "zh" ? "en" : "zh";
    localStorage.setItem("spi-lang", l);
    document.documentElement.lang = l === "zh" ? "zh-CN" : "en";
    return { lang: l };
  }),
}));

/** t(key)：取当前语言文案 */
export function useI18n() {
  const lang = useI18nStore((s) => s.lang);
  const toggleLang = useI18nStore((s) => s.toggleLang);
  const t = (key: I18nKey): string => DICT[key][lang];
  return { lang, t, toggleLang };
}
