/* ============================================================
 * SPI-OS 业务规则引擎（仅后端持有，规则明细不下发前端）
 * 承载：12维企业评分 / Tier 分级 / 引荐路径推演 / 双版话术生成 / KPI 聚合
 * 规则可配置：ruleConfigs 表按 key 覆盖默认配置（DEFAULT_RULES）
 * ============================================================ */
import type { SeedSignal } from "./parkData";
import { matchIndustryRule } from "./industryNormalizer";

/* ---------- 规则配置类型 ---------- */
export interface ScoringRules {
  /** 12 维名称与权重（总和=100） */
  dims: { name: string; weight: number }[];
  /** 富集修正：字段 -> 阈值/加分 */
  enrichBoost: {
    jobsHigh: number; jobsHighBonus: number;      // 在招岗位数 >= jobsHigh 时加分
    jobsMid: number; jobsMidBonus: number;
    patentsHigh: number; patentsBonus: number;    // 专利数
    insuredHigh: number; insuredBonus: number;    // 参保人数（规模）
    fundingBonus: number;                          // 有融资/股改
    hiTechBonus: number;                           // 高企资质
    verifiedBonus: number;                         // 已核验数据置信加分
  };
  /** 信号加分 */
  signalBoost: { tier1: number; tier2: number; max: number };
  /** 信号新近度衰减（白皮书模块03：半衰期按 Tier 配置，天） */
  signalDecay: { tier1HalfLifeDays: number; tier2HalfLifeDays: number; enabled: boolean };
  /** Tier-0 风险信号（模块03 风险层）：命中风险关键词时降分并标记 */
  riskRules: { keywords: string[]; penalty: number; capTier: "P2" | "N" };
}

export interface TieringRules {
  p0Min: number; p1Min: number; p2Min: number;    // 分数阈值
  p0RequireSignal: boolean;                        // P0 需至少一条信号
}

/** 触达任务规则（Law-05 配置优于定制：阈值天数全部配置化） */
export interface TaskRules {
  touchedStallDays: number;   // 已触达超 N 天未推进 → 复访
  meetingStallDays: number;   // 已约见超 N 天未成交 → 复访
  p1NeedTier1Signal: boolean; // P1 培育跟进是否要求 Tier-1 信号
}

export interface PitchTemplates {
  formal: { openerA: string; openerB: string; openerC: string; openerD: string; body: string; close: string };
  light: { openerA: string; openerB: string; openerC: string; openerD: string; body: string; close: string };
}

export interface RuleSet {
  scoring: ScoringRules;
  tiering: TieringRules;
  pitch: PitchTemplates;
  /** 信软管道匹配度（行业 -> 0-100），驱动屏二 X 轴与匹配率 KPI */
  pipeMatch: Record<string, number>;
  /** 触达任务规则 */
  tasks: TaskRules;
  /** NBA 动作库（模块08：动作模板按条件匹配，后端持有） */
  nbaActions: { cond: "tier1_hiring" | "tier1_other" | "p0" | "p1" | "default"; text: string }[];
  /** 意图标签规则（迭代10 · 第二波：规则版可解释推断，非黑盒预测）
   *  每条规则 = 多信号/字段条件组合（all 全部满足）→ 输出意图标签。
   *  cond 类型：signal_kw（信号文本含关键词）/ enrich_field（富集字段判断）/ ind_in（行业属于）/ cross（跨楼层） */
  intents: {
    tag: string;            // 标签 ID（expansion / ipo / ai_shift / talent_war）
    label: string;          // 中文标签
    labelEn: string;        // 英文标签
    conds: (
      | { type: "signal_kw"; kw: string[] }              // 任一信号文本命中任一关键词
      | { type: "enrich_field"; field: "funding" | "hiTech" | "jobs" | "patents"; op: "has" | "gte"; value?: number }
      | { type: "ind_in"; inds: string[] }
      | { type: "cross" }
    )[];
  }[];
}

/* ---------- 默认规则（v1，可被 ruleConfigs 表覆盖） ---------- */
export const DEFAULT_RULES: RuleSet = {
  scoring: {
    dims: [
      { name: "ICP契合", weight: 15 }, { name: "招聘需求", weight: 12 }, { name: "紧迫度", weight: 10 },
      { name: "关系强度", weight: 10 }, { name: "扩张", weight: 8 }, { name: "技术密度", weight: 8 },
      { name: "战略契合", weight: 8 }, { name: "支付能力", weight: 7 }, { name: "数字化", weight: 7 },
      { name: "融资", weight: 6 }, { name: "可达性", weight: 5 }, { name: "时机", weight: 4 },
    ],
    enrichBoost: {
      jobsHigh: 10, jobsHighBonus: 6, jobsMid: 5, jobsMidBonus: 3,
      patentsHigh: 10, patentsBonus: 2, insuredHigh: 50, insuredBonus: 2,
      fundingBonus: 3, hiTechBonus: 2, verifiedBonus: 2,
    },
    signalBoost: { tier1: 4, tier2: 2, max: 10 },
    signalDecay: { tier1HalfLifeDays: 45, tier2HalfLifeDays: 90, enabled: true },
    riskRules: { keywords: ["经营异常", "失信", "诉讼", "注销", "行政处罚"], penalty: 15, capTier: "P2" },
  },
  tiering: { p0Min: 75, p1Min: 60, p2Min: 40, p0RequireSignal: true },
  tasks: { touchedStallDays: 7, meetingStallDays: 14, p1NeedTier1Signal: true },
  nbaActions: [
    { cond: "tier1_hiring", text: "72h 内触达：信软学院定向实习/招聘专场提案 + 高于规模招聘方案，经{path}暖引荐约见" },
    { cond: "tier1_other", text: "72h 内触达：携《人才供给方案》经{path}暖引荐，7 日内完成首轮约见" },
    { cond: "p0", text: "本周首触：经{path}暖引荐递送话术，约 30 分钟人才供给方案呈报" },
    { cond: "p1", text: "纳入培育序列：内容触达（园区 HR 沙龙/信软管道案例），信号升温即提级" },
    { cond: "default", text: "保持监控：季度画像刷新，出现 Tier-1 信号自动进入触达队列" },
  ],
  intents: [
    { tag: "expansion", label: "扩张中", labelEn: "Expanding", conds: [{ type: "signal_kw", kw: ["扩租", "扩张", "跨楼层", "独占", "异地设点", "设点"] }] },
    { tag: "talent_war", label: "抢人窗口", labelEn: "Hiring Surge", conds: [{ type: "signal_kw", kw: ["批量招聘", "招聘高", "招高管", "研发批量", "算法招聘", "岗"] }, { type: "enrich_field", field: "jobs", op: "gte", value: 5 }] },
    { tag: "ipo", label: "IPO/股改倾向", labelEn: "IPO Track", conds: [{ type: "signal_kw", kw: ["股改", "上市", "辅导", "IPO"] }] },
    { tag: "funding_active", label: "融资活跃", labelEn: "Funding Active", conds: [{ type: "signal_kw", kw: ["融资", "轮融", "投资", "增资"] }] },
    { tag: "ai_shift", label: "AI 转型", labelEn: "AI Pivot", conds: [{ type: "signal_kw", kw: ["AI", "算法", "大模型", "CV"] }, { type: "ind_in", inds: ["软件", "AI", "通信", "芯片"] }] },
  ],
  pipeMatch: {
    软件: 92, AI: 90, 芯片: 78, 通信: 72, 检测: 60, 金融: 55, 教育: 45, 企服: 30, 园区: 35, 新能源: 40, 其他: 25,
  },
  pitch: {
    formal: {
      openerA: "【引荐人】{contact}您好，我是高于人力（电子科大信软学院实训/实习/就业共建方）。{short}与我们同属电子科大生态，冒昧经校企渠道向您正式引荐——",
      openerB: "【园区官方】{contact}您好，我们是电子科大科技园股份「人才服务进企业」合作方（高于人力×感知序列）。{short}是园区本期重点服务企业——",
      openerC: "【协会转介】{contact}您好，经成都新型显示行业协会正式介绍，了解到{short}近期有用人规划——",
      openerD: "【伙伴互荐】{contact}您好，经园区专业服务伙伴郑重介绍认识贵司——",
      body: "{sig}我们可提供：{entry}。核心差异是电子科大信软学院的实训/实习/就业管道——软件、AI、信息安全类人才定向直供，实习转化留用成本显著低于社招；同时配套高端寻访与 HR 体系诊断。",
      close: "拟于本周或下周向您当面呈报一份针对贵司在招岗位的《人才供给方案》（30 分钟），并附园区同类企业的合作案例。请问您本周四或下周二哪个时间方便？",
    },
    light: {
      openerA: "{contact}您好～我是高于人力的顾问，咱们都是电子科大这边的（我们和信软学院有实习就业共建），经校友渠道加您——",
      openerB: "{contact}您好～我是园区「人才服务进企业」项目的对接顾问（高于人力），科技园股份这边推荐先联系您——",
      openerC: "{contact}您好～显示行业协会的老师推荐我联系您，说贵司最近在扩团队——",
      openerD: "{contact}您好～园区里合作的伙伴推荐认识一下，说贵司近期有招人计划——",
      body: "{sig}我们手上有信软学院对口的实习生和应届生资源（软件/AI/安全方向），也做技术岗和高管的寻访，{entry}这块应该能直接帮上。",
      close: "方便的话约个 30 分钟碰一下？我带一份贵司在招岗位的人选情况过来，您看这周哪天顺？",
    },
  },
};

/* ---------- 计算输入统一结构（数据适配器输出） ---------- */
export interface CalcInput {
  eid: string;
  name: string;
  ind: string;
  baseScore: number;
  hiringBase: string;
  cross: boolean;
  tierRole: "tenant" | "operator" | "support";
  signals: SeedSignal[];
  referralPath?: "A" | "B" | "C" | "D" | null;
  entryPoint?: string | null;
  /** 备注（风险关键词扫描来源之一，可选） */
  note?: string | null;
  enrich?: {
    jobs?: number | null; patents?: number | null; insured?: number | null;
    funding?: string | null; hiTech?: string | null; verified?: string | null;
    keyContact?: string | null; topJobs?: string | null;
  } | null;
}

export interface CalcResult {
  eid: string;
  score: number;
  tier: string;           // P0/P1/P2/N/运营方/配套
  pipeMatch: number;      // 0-100
  dims: [string, number, number][]; // [名称, 0-5, 权重]
  enriched: boolean;      // 是否有富集修正
  scoreDelta: number;     // 富集/信号修正合计（相对 baseScore）
  risk: boolean;          // 命中 Tier-0 风险信号
  nba: string;            // Next-Best-Action（后端生成）
}

/* ---------- 信号衰减因子：2^(-ageDays/halfLife) ---------- */
function decayFactor(s: SeedSignal, rules: RuleSet, now: Date): number {
  if (!rules.scoring.signalDecay.enabled) return 1;
  const m = /^(\d{2})-(\d{2})$/.exec(s.d);
  if (!m) return 1;
  const year = now.getFullYear();
  let obs = new Date(year, parseInt(m[1]) - 1, parseInt(m[2]));
  if (obs.getTime() > now.getTime()) obs = new Date(year - 1, parseInt(m[1]) - 1, parseInt(m[2]));
  const ageDays = Math.max(0, (now.getTime() - obs.getTime()) / 86400000);
  const half = s.tier === 1 ? rules.scoring.signalDecay.tier1HalfLifeDays : rules.scoring.signalDecay.tier2HalfLifeDays;
  return Math.pow(2, -ageDays / half);
}

/* ---------- Tier-0 风险检测 ---------- */
function hasRisk(x: CalcInput, rules: RuleSet): boolean {
  const text = `${x.note} ${x.signals.map((s) => s.t).join(" ")} ${x.enrich?.funding ?? ""}`;
  return rules.scoring.riskRules.keywords.some((k) => text.includes(k));
}

/* ---------- NBA 生成（模块08：评分+信号+路径+生命周期驱动） ---------- */
const PATH_LABEL: Record<string, string> = { A: "校企通道", B: "园区官方", C: "行业协会", D: "伙伴互荐" };
export function buildNba(x: CalcInput, tier: string, rules: RuleSet): string {
  const path = PATH_LABEL[x.referralPath ?? "B"] ?? "园区官方";
  const t1 = x.signals.find((s) => s.tier === 1);
  let cond: RuleSet["nbaActions"][number]["cond"];
  if (t1 && /招|聘|岗/.test(t1.t)) cond = "tier1_hiring";
  else if (t1) cond = "tier1_other";
  else if (tier === "P0") cond = "p0";
  else if (tier === "P1") cond = "p1";
  else cond = "default";
  const tpl = rules.nbaActions.find((a) => a.cond === cond) ?? rules.nbaActions[rules.nbaActions.length - 1];
  return tpl.text.replaceAll("{path}", path);
}

/* ---------- 评分 + 分级 ---------- */
export function calcEntity(x: CalcInput, rules: RuleSet = DEFAULT_RULES, now: Date = new Date()): CalcResult {
  if (x.tierRole === "operator") return { eid: x.eid, score: 0, tier: "运营方", pipeMatch: matchIndustryRule(x.ind), dims: [], enriched: false, scoreDelta: 0, risk: false, nba: "—" };
  if (x.tierRole === "support") return { eid: x.eid, score: 0, tier: "配套", pipeMatch: matchIndustryRule(x.ind), dims: [], enriched: false, scoreDelta: 0, risk: false, nba: "—" };

  const { enrichBoost: eb, signalBoost: sb } = rules.scoring;
  let delta = 0;
  let enriched = false;
  const e = x.enrich;
  if (e) {
    if (e.jobs != null) { enriched = true; delta += e.jobs >= eb.jobsHigh ? eb.jobsHighBonus : e.jobs >= eb.jobsMid ? eb.jobsMidBonus : 0; }
    if (e.patents != null && e.patents >= eb.patentsHigh) { enriched = true; delta += eb.patentsBonus; }
    if (e.insured != null && e.insured >= eb.insuredHigh) { enriched = true; delta += eb.insuredBonus; }
    if (e.funding) { enriched = true; delta += eb.fundingBonus; }
    if (e.hiTech && /是|有|Y/i.test(e.hiTech)) { enriched = true; delta += eb.hiTechBonus; }
    if (e.verified === "已核验") { enriched = true; delta += eb.verifiedBonus; }
  }
  // 信号加分 × 新近度衰减（模块03：半衰期 Tier-1 45天 / Tier-2 90天，配置驱动）
  const sigBonus = Math.min(sb.max, x.signals.reduce((a, s) => a + (s.tier === 1 ? sb.tier1 : sb.tier2) * decayFactor(s, rules, now), 0));
  // baseScore 已含名录期信号判断；富集后信号加分仅取超出基线的一半，避免双计
  const risk = hasRisk(x, rules);
  const riskPenalty = risk ? rules.scoring.riskRules.penalty : 0;
  const score = Math.max(0, Math.min(100, Math.round(x.baseScore + delta + (enriched ? Math.round(sigBonus / 2) : 0) - riskPenalty)));

  const t = rules.tiering;
  let tier: string;
  if (score >= t.p0Min && (!t.p0RequireSignal || x.signals.length > 0)) tier = "P0";
  else if (score >= t.p1Min) tier = "P1";
  else if (score >= t.p2Min) tier = "P2";
  else tier = "N";
  // Tier-0 风险封顶（模块03：风险信号 → 降级/暂缓）
  if (risk && (tier === "P0" || tier === "P1")) tier = rules.scoring.riskRules.capTier;

  // 12 维拆解（确定性启发式：由总分与维度序号导出，人工覆盖 dimsJson 优先——在适配器处理）
  const dims = rules.scoring.dims.map(({ name, weight }, i) => {
    const v = Math.max(0, Math.min(5, Math.round(score / 20 + (i % 3) - 1)));
    return [name, v, weight] as [string, number, number];
  });

  return { eid: x.eid, score, tier, pipeMatch: matchIndustryRule(x.ind), dims, enriched, scoreDelta: score - x.baseScore, risk, nba: buildNba(x, tier, rules) };
}

/* ---------- 双版话术生成 ---------- */
export function buildPitch(
  x: CalcInput & { tier: string },
  version: "formal" | "light",
  rules: RuleSet = DEFAULT_RULES,
): string {
  const tpl = rules.pitch[version];
  const short = x.name.replace(/(有限公司|股份有限公司|有限责任公司)$/, "");
  const path = x.referralPath || "B";
  const opener = (path === "A" ? tpl.openerA : path === "C" ? tpl.openerC : path === "D" ? tpl.openerD : tpl.openerB)
    .replaceAll("{short}", short)
    .replaceAll("{contact}", x.enrich?.keyContact ? `${x.enrich.keyContact.split("(")[0].split("（")[0]} ` : "");
  const sig = x.signals.length
    ? `注意到贵司近期${x.signals.map((s) => s.t).join("、")}${x.enrich?.jobs ? `，在招岗位 ${x.enrich.jobs} 个` : ""}，判断正处在团队扩张窗口期。`
    : `注意到贵司在园区内保持稳定经营${x.enrich?.jobs ? `，当前在招岗位 ${x.enrich.jobs} 个` : ""}，人才储备正当其时。`;
  const body = tpl.body
    .replaceAll("{sig}", sig)
    .replaceAll("{entry}", x.entryPoint || (version === "formal" ? "信软学院定向实习/招聘专场、高端寻访与 HR 诊断组合服务" : "招人"));
  return `${opener}\n\n${body}\n\n${tpl.close}`;
}

/* ---------- KPI 聚合 ---------- */
export function calcKpis(results: (CalcResult & { signals: SeedSignal[] })[], rules: RuleSet = DEFAULT_RULES) {
  const tenants = results.filter((r) => r.tier !== "运营方" && r.tier !== "配套");
  const scored = tenants.filter((r) => r.score > 0);
  const p0 = tenants.filter((r) => r.tier === "P0");
  const p1 = tenants.filter((r) => r.tier === "P1");
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length) : 0;
  const signalCount = results.reduce((a, r) => a + r.signals.length, 0);
  const tier1Count = results.reduce((a, r) => a + r.signals.filter((s) => s.tier === 1).length, 0);
  // 人才供需匹配率 = 高价值线索（P0+P1）管道匹配度按分数加权
  const hv = [...p0, ...p1];
  const matchRate = hv.length
    ? Math.round(hv.reduce((a, r) => a + r.pipeMatch * r.score, 0) / hv.reduce((a, r) => a + r.score, 0))
    : 0;
  return {
    total: results.length,
    highValue: p0.length + p1.length,
    p0: p0.length,
    p1: p1.length,
    p2: tenants.filter((r) => r.tier === "P2").length,
    n: tenants.filter((r) => r.tier === "N").length,
    healthIndex: Math.min(100, Math.round(avg * 1.12)),
    matchRate,
    signalCount,
    tier1Count,
  };
}

/* ---------- 生命周期 / 漏斗 ---------- */
export const STAGES = ["未触达", "已触达", "已约见", "已成交"] as const;
export type Stage = (typeof STAGES)[number];

/* ---------- 触达任务清单（本周作战节奏） ----------
 * 规则（v1，后端持有）：
 * - 应触达：P0 且 未触达（顺位=评分降序）
 * - 应复访：已触达 超过 7 天未推进到约见；已约见 超过 14 天未成交
 * - 培育提醒：P1 未触达 且 带 Tier-1 信号（信号在衰减前跟进）
 */
export interface TaskItem {
  eid: string;
  taskType: "首触" | "复访" | "培育跟进";
  reason: string;
  priority: number; // 数字越小越靠前
  daysWaiting: number | null;
}

export function buildTaskList(
  items: { eid: string; tier: string; score: number; stage: Stage; signals: SeedSignal[] }[],
  stageEvents: Map<string, { stage: Stage; at: Date }>,
  now: Date = new Date(),
  taskRules: TaskRules = DEFAULT_RULES.tasks,
): TaskItem[] {
  const tasks: TaskItem[] = [];
  const dayMs = 86400000;
  for (const x of items) {
    const ev = stageEvents.get(x.eid);
    const days = ev ? Math.floor((now.getTime() - ev.at.getTime()) / dayMs) : null;
    if (x.tier === "P0" && x.stage === "未触达") {
      tasks.push({ eid: x.eid, taskType: "首触", reason: "P0 未触达 · 7 日内完成首轮约见", priority: 100 - x.score, daysWaiting: null });
    } else if (x.stage === "已触达" && days !== null && days > taskRules.touchedStallDays) {
      tasks.push({ eid: x.eid, taskType: "复访", reason: `已触达 ${days} 天未推进到约见`, priority: 200 - x.score - days, daysWaiting: days });
    } else if (x.stage === "已约见" && days !== null && days > taskRules.meetingStallDays) {
      tasks.push({ eid: x.eid, taskType: "复访", reason: `已约见 ${days} 天未成交 · 需推进方案`, priority: 150 - x.score - days, daysWaiting: days });
    } else if (x.tier === "P1" && x.stage === "未触达" && (!taskRules.p1NeedTier1Signal || x.signals.some((s) => s.tier === 1))) {
      tasks.push({ eid: x.eid, taskType: "培育跟进", reason: "P1 带 Tier-1 信号 · 信号衰减前跟进", priority: 300 - x.score, daysWaiting: null });
    }
  }
  return tasks.sort((a, b) => a.priority - b.priority);
}

export function calcFunnel(latestStages: Map<string, Stage>, hvEids: string[]) {
  const counts: Record<Stage, number> = { 未触达: 0, 已触达: 0, 已约见: 0, 已成交: 0 };
  hvEids.forEach((eid) => {
    counts[latestStages.get(eid) ?? "未触达"]++;
  });
  const reached = counts.已触达 + counts.已约见 + counts.已成交;
  const met = counts.已约见 + counts.已成交;
  const won = counts.已成交;
  const total = hvEids.length;
  return {
    counts,
    total,
    reachRate: total ? Math.round((reached / total) * 100) : 0,
    meetRate: reached ? Math.round((met / reached) * 100) : 0,
    winRate: met ? Math.round((won / met) * 100) : 0,
  };
}

/* ---------- 规则影响预览（dry-run diff）：新规则 vs 当前规则的 Tier 变化 ---------- */
export interface RuleImpactItem { eid: string; name: string; before: { score: number; tier: string }; after: { score: number; tier: string } }
export function calcRuleImpact(
  ents: CalcInput[],
  currentRules: RuleSet,
  nextRules: RuleSet,
): { upgraded: RuleImpactItem[]; downgraded: RuleImpactItem[]; scoreChanged: number; unchanged: number } {
  const TIER_ORDER: Record<string, number> = { P0: 4, P1: 3, P2: 2, N: 1, 运营方: 0, 配套: 0 };
  const upgraded: RuleImpactItem[] = [];
  const downgraded: RuleImpactItem[] = [];
  let scoreChanged = 0, unchanged = 0;
  const now = new Date();
  for (const x of ents) {
    const a = calcEntity(x, currentRules, now);
    const b = calcEntity(x, nextRules, now);
    const item: RuleImpactItem = { eid: x.eid, name: x.name, before: { score: a.score, tier: a.tier }, after: { score: b.score, tier: b.tier } };
    if ((TIER_ORDER[b.tier] ?? 0) > (TIER_ORDER[a.tier] ?? 0)) upgraded.push(item);
    else if ((TIER_ORDER[b.tier] ?? 0) < (TIER_ORDER[a.tier] ?? 0)) downgraded.push(item);
    else if (a.score !== b.score) scoreChanged++;
    else unchanged++;
  }
  return { upgraded, downgraded, scoreChanged, unchanged };
}

/* ---------- 周报复盘聚合（模块12 "周"节奏） ---------- */
export function isoWeekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export interface WeeklyReview {
  weekKey: string;
  openTasks: number;          // 当前待办任务数
  doneTasks: number;          // 本周已完成打卡数
  completionRate: number;     // 完成率 = done / (done + open)
  byType: Record<string, { open: number; done: number }>;
  stageMoves: { eid: string; name: string; stage: Stage; at: Date; actor: string | null }[]; // 本周状态推进
  funnelNow: ReturnType<typeof calcFunnel>;
}

/* ============================================================
 * 迭代10 · 第二波：信号流水线 v1 + 规则版意图标签
 * 信号流水线：去重归并（同文本合并计数）/ 来源标注 / 置信度评级
 * 意图标签：多条件组合规则推断（可解释，输出触发规则说明），规则存 intents 可配置
 * ============================================================ */
export interface PipelineSignal {
  date: string;           // 最近一次观察日期 MM-DD
  text: string;
  tier: number;
  count: number;          // 归并计数（同文本信号出现次数）
  source: string;         // 来源：楼层索引实勘 / 情报回填 / AI 解析
  sourceEn: string;
  confidence: "高" | "中" | "低";
  decayPct: number;
  fresh: boolean;
}

export function pipelineSignals(x: CalcInput, rules: RuleSet = DEFAULT_RULES, now: Date = new Date()): PipelineSignal[] {
  // 1) 去重归并：同文本信号合并，保留最近日期与最高 Tier，计数
  const merged = new Map<string, { d: string; t: string; tier: number; count: number }>();
  for (const s of x.signals) {
    const key = s.t.trim();
    const prev = merged.get(key);
    if (prev) {
      prev.count += 1;
      if (s.d > prev.d) prev.d = s.d;
      if (s.tier < prev.tier) prev.tier = s.tier;
    } else merged.set(key, { d: s.d, t: s.t, tier: s.tier, count: 1 });
  }
  // 2) 来源标注 + 3) 置信度评级
  const verified = x.enrich?.verified === "已核验";
  const hasEnrich = !!(x.enrich && (x.enrich.jobs != null || x.enrich.funding || x.enrich.topJobs));
  return Array.from(merged.values())
    .sort((a, b) => b.d.localeCompare(a.d))
    .map((m) => {
      const f = decayFactor({ d: m.d, t: m.t, tier: m.tier as 1 | 2 }, rules, now);
      // 来源推断：招聘/岗位类信号若有富集数据支撑 → 情报回填；其余 → 楼层索引实勘
      const isHiring = /招|聘|岗/.test(m.t);
      const source = isHiring && hasEnrich ? "情报回填" : "楼层索引实勘";
      const sourceEn = isHiring && hasEnrich ? "Intel Enrichment" : "Floor Census";
      // 置信度：已核验来源=高；实勘/未核验回填=中；已衰减过半=降一档
      let confidence: PipelineSignal["confidence"] = verified && source === "情报回填" ? "高" : "中";
      if (f <= 0.5) confidence = confidence === "高" ? "中" : "低";
      return { date: m.d, text: m.t, tier: m.tier, count: m.count, source, sourceEn, confidence, decayPct: Math.round(f * 100), fresh: f > 0.5 };
    });
}

export interface IntentTag {
  tag: string;
  label: string;
  labelEn: string;
  rule: string;           // 触发规则说明（可解释）
  hits: string[];         // 命中的证据（信号文本/字段值）
}

function condHit(x: CalcInput, c: RuleSet["intents"][number]["conds"][number]): string[] | null {
  switch (c.type) {
    case "signal_kw": {
      const hits = x.signals.filter((s) => c.kw.some((k) => s.t.includes(k))).map((s) => s.t);
      return hits.length ? Array.from(new Set(hits)) : null;
    }
    case "enrich_field": {
      const e = x.enrich;
      if (!e) return null;
      if (c.field === "funding") return e.funding ? [`融资/股改：${e.funding}`] : null;
      if (c.field === "hiTech") return e.hiTech && /是|有|Y/i.test(e.hiTech) ? [`高企资质：${e.hiTech}`] : null;
      const v = c.field === "jobs" ? e.jobs : e.patents;
      if (v == null) return null;
      if (c.op === "gte" && v >= (c.value ?? 0)) return [`${c.field === "jobs" ? "在招岗位" : "专利"} ${v}`];
      return null;
    }
    case "ind_in":
      return c.inds.includes(x.ind) ? [`行业：${x.ind}`] : null;
    case "cross":
      return x.cross ? ["跨楼层入驻"] : null;
  }
}

const COND_LABEL: Record<string, string> = { signal_kw: "信号关键词", enrich_field: "富集字段", ind_in: "行业范围", cross: "跨楼层" };

export function inferIntents(x: CalcInput, rules: RuleSet = DEFAULT_RULES): IntentTag[] {
  if (x.tierRole !== "tenant") return [];
  const out: IntentTag[] = [];
  for (const r of rules.intents) {
    const allHits: string[] = [];
    let ok = true;
    for (const c of r.conds) {
      const h = condHit(x, c);
      if (!h) { ok = false; break; }
      allHits.push(...h);
    }
    if (ok && allHits.length) {
      out.push({
        tag: r.tag,
        label: r.label,
        labelEn: r.labelEn,
        rule: r.conds.map((c) => COND_LABEL[c.type]).join(" + "),
        hits: Array.from(new Set(allHits)).slice(0, 4),
      });
    }
  }
  return out;
}

/* ============================================================
 * 迭代9 · 可解释性七问视图（Explainability，提示词强制规范）
 * 每条推荐/评分必须回答：依据 / 证据 / 信号 / 关系 / 时间线 / 模型逻辑 / 置信度
 * 全部由现有数据组装（零新数据源），后端计算，前端仅渲染
 * ============================================================ */
export interface ExplainView {
  eid: string;
  /** ① 依据：当前结论（评分/Tier/雷达排名） */
  basis: { score: number; tier: string; rank: number | null; pipeMatch: number; nba: string };
  /** ② 证据：评分构成明细（基线分/富集加分/信号加分/风险扣分）+ 富集字段清单 */
  evidence: {
    baseScore: number;
    enrichDelta: number;
    signalBonus: number;
    riskPenalty: number;
    fields: { label: string; value: string; verified: string }[];
  };
  /** ③ 信号：命中信号 + Tier + 衰减状态 */
  signals: { date: string; text: string; tier: number; decayPct: number; fresh: boolean }[];
  /** ④ 关系：暖引荐路径 + 切入点 */
  relations: { path: string | null; pathLabel: string; entryPoint: string | null };
  /** ⑤ 时间线：生命周期事件（倒序） */
  timeline: { at: Date; event: string; actor: string | null }[];
  /** ⑥ 模型逻辑：规则版本 + 关键参数 */
  model: { engine: string; dimsCount: number; thresholds: { p0Min: number; p1Min: number; p2Min: number }; decay: string; riskCap: string };
  /** ⑦ 置信度：数据完备度推导 */
  confidence: { level: "高" | "中" | "低"; pct: number; reasons: string[] };
}

export function buildExplain(
  x: CalcInput,
  result: CalcResult,
  rank: number | null,
  timeline: { at: Date; event: string; actor: string | null }[],
  rules: RuleSet = DEFAULT_RULES,
  now: Date = new Date(),
): ExplainView {
  const { enrichBoost: eb, signalBoost: sb } = rules.scoring;
  // 复演证据构成（与 calcEntity 同口径）
  let enrichDelta = 0;
  const fields: ExplainView["evidence"]["fields"] = [];
  const e = x.enrich;
  const v = e?.verified ?? "待核验";
  if (e) {
    if (e.jobs != null) { enrichDelta += e.jobs >= eb.jobsHigh ? eb.jobsHighBonus : e.jobs >= eb.jobsMid ? eb.jobsMidBonus : 0; fields.push({ label: "在招岗位", value: `${e.jobs} 个`, verified: v }); }
    if (e.patents != null) { if (e.patents >= eb.patentsHigh) enrichDelta += eb.patentsBonus; fields.push({ label: "专利数", value: `${e.patents} 条`, verified: v }); }
    if (e.insured != null) { if (e.insured >= eb.insuredHigh) enrichDelta += eb.insuredBonus; fields.push({ label: "参保人数", value: `${e.insured} 人`, verified: v }); }
    if (e.funding) { enrichDelta += eb.fundingBonus; fields.push({ label: "融资/股改", value: e.funding, verified: v }); }
    if (e.hiTech && /是|有|Y/i.test(e.hiTech)) { enrichDelta += eb.hiTechBonus; fields.push({ label: "高企资质", value: e.hiTech, verified: v }); }
    if (e.verified === "已核验") enrichDelta += eb.verifiedBonus;
  }
  const sigBonusRaw = Math.min(sb.max, x.signals.reduce((a, s) => a + (s.tier === 1 ? sb.tier1 : sb.tier2) * decayFactor(s, rules, now), 0));
  const signalBonus = result.enriched ? Math.round(sigBonusRaw / 2) : 0;
  const riskPenalty = result.risk ? rules.scoring.riskRules.penalty : 0;

  const signals = x.signals.map((s) => {
    const f = decayFactor(s, rules, now);
    return { date: s.d, text: s.t, tier: s.tier, decayPct: Math.round(f * 100), fresh: f > 0.5 };
  });

  // 置信度：已核验字段占比 + 新鲜信号 + 富集覆盖
  const reasons: string[] = [];
  let pts = 0;
  if (fields.length >= 3) { pts += 40; reasons.push(`富集字段 ${fields.length} 项已回填`); }
  else if (fields.length > 0) { pts += 20; reasons.push(`富集字段仅 ${fields.length} 项，覆盖不足`); }
  else reasons.push("无富集数据，仅名录期基线评估");
  if (e?.verified === "已核验") { pts += 30; reasons.push("字段经人工核验"); }
  else if (fields.length > 0) { pts += 10; reasons.push("字段待核验（AI 解析/导入未复核）"); }
  const freshCount = signals.filter((s) => s.fresh).length;
  if (freshCount > 0) { pts += 30; reasons.push(`${freshCount} 条信号处于半衰期内（新鲜）`); }
  else if (signals.length > 0) { pts += 10; reasons.push("信号均已衰减过半，建议刷新情报"); }
  else reasons.push("无活跃信号");
  const level: ExplainView["confidence"]["level"] = pts >= 70 ? "高" : pts >= 40 ? "中" : "低";

  return {
    eid: x.eid,
    basis: { score: result.score, tier: result.tier, rank, pipeMatch: result.pipeMatch, nba: result.nba },
    evidence: { baseScore: x.baseScore, enrichDelta, signalBonus, riskPenalty, fields },
    signals,
    relations: { path: x.referralPath ?? null, pathLabel: PATH_LABEL[x.referralPath ?? "B"] ?? "园区官方", entryPoint: x.entryPoint ?? null },
    timeline,
    model: {
      engine: "规则引擎 v1（ruleConfigs 可配置）",
      dimsCount: rules.scoring.dims.length,
      thresholds: { p0Min: rules.tiering.p0Min, p1Min: rules.tiering.p1Min, p2Min: rules.tiering.p2Min },
      decay: `信号半衰期 T1=${rules.scoring.signalDecay.tier1HalfLifeDays}天 / T2=${rules.scoring.signalDecay.tier2HalfLifeDays}天`,
      riskCap: `风险关键词命中 → 扣 ${rules.scoring.riskRules.penalty} 分并封顶 ${rules.scoring.riskRules.capTier}`,
    },
    confidence: { level, pct: Math.min(100, pts), reasons },
  };
}
