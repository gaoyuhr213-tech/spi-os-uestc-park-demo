/* V3 波次二 · Scenario OS：场景即 Decision Workspace
   对标：Palantir Foundry Workspace / ServiceNow Workspaces / 6sense Segments。
   设计：场景 = 需求标签集 × 行业集 × 阶段集 × 决策类型集 的业务切面；
        每个场景自动聚合：KPI、决策队列（按场景过滤）、关联企业、匹配资源、负责 Agent。
   场景定义为代码内注册表（可扩展为 DB 表），保证开箱即用与可打包复制（Scenario Package 雏形）。 */
import { inArray } from "drizzle-orm";
import { getDb } from "./db";
import { decisions } from "../drizzle/schema";
import { loadEntities, loadLatestStages, loadRules, maskEntityName } from "./dataAdapter";
import { calcEntity, inferIntents } from "./ruleEngine";
import { buildNeedCanvas, inferLifecycle, DTYPE_LABEL, type DType, type NeedTag } from "./decisionEngine";
import { listResources } from "./resourceMatch";

export interface ScenarioDef {
  sid: string;
  name: string;
  nameEn: string;
  tagline: string;           // 一句话：这个场景帮领导完成什么决策
  decisionQuestion: string;  // 场景核心决策问题（Hard Constraint：每个模块回答帮助完成哪个决策）
  needTags: NeedTag[];       // 场景关注的需求维度
  dtypes: DType[];           // 场景相关决策类型
  inds: string[] | null;     // 行业过滤（null=全行业）
  intents: string[];         // 关联意图标签
  agents: string[];          // 负责的 Agent（波次四对齐）
  extensible?: boolean;      // 是否为预留扩展位（低空经济等）
}

/** 场景注册表：4 个开箱场景 + 3 个扩展位（低空经济/冷链/跨境，数据到位即激活） */
export const SCENARIOS: ScenarioDef[] = [
  {
    sid: "attract", name: "产业招商", nameEn: "Industry Attraction",
    tagline: "把扩张/异地信号变成招商动作",
    decisionQuestion: "本月应优先触达哪些扩张窗口期企业？投入多少资源？",
    needTags: ["market", "talent"], dtypes: ["contact", "referral"],
    inds: null, intents: ["expanding", "hiring_window"],
    agents: ["Scout Agent", "Research Agent", "Investment Agent", "Execution Agent"],
  },
  {
    sid: "cultivate", name: "企业培育", nameEn: "Enterprise Cultivation",
    tagline: "把资质/知识产权存量变成申报与成长服务",
    decisionQuestion: "哪些企业到了高企/专精特新/股改申报窗口？谁来辅导？",
    needTags: ["policy", "rnd", "legal"], dtypes: ["policy", "mentor"],
    inds: null, intents: ["ipo_intent", "ai_transform"],
    agents: ["Policy Agent", "Research Agent", "Execution Agent"],
  },
  {
    sid: "talent", name: "人才服务", nameEn: "Talent Services",
    tagline: "把招聘信号变成信软管道撮合（Marketplace 核心）",
    decisionQuestion: "本周应向哪些企业推送人才供给方案？管道容量如何分配？",
    needTags: ["talent"], dtypes: ["hr_service", "contact"],
    inds: ["软件", "AI", "芯片", "通信"], intents: ["hiring_window", "expanding"],
    agents: ["Scout Agent", "Execution Agent", "Review Agent"],
  },
  {
    sid: "fund", name: "产业基金", nameEn: "Industry Fund",
    tagline: "把融资/股改信号变成资本对接",
    decisionQuestion: "哪些企业进入融资/IPO 窗口？校友资本与产业基金如何介入？",
    needTags: ["funding", "legal"], dtypes: ["referral"],
    inds: null, intents: ["funding_active", "ipo_intent"],
    agents: ["Investment Agent", "Research Agent", "Review Agent"],
  },
  {
    sid: "lowaltitude", name: "低空经济", nameEn: "Low-altitude Economy",
    tagline: "扩展位：数据接入后自动激活",
    decisionQuestion: "园区低空产业链应引进哪些环节企业？",
    needTags: ["market", "rnd"], dtypes: ["contact", "referral"], inds: ["低空", "无人机"],
    intents: ["expanding"], agents: ["Scout Agent", "Industry Agent"], extensible: true,
  },
  {
    sid: "coldchain", name: "冷链物流", nameEn: "Cold Chain",
    tagline: "扩展位：数据接入后自动激活",
    decisionQuestion: "冷链场景的仓储/设备/服务企业如何组链？",
    needTags: ["market", "digital"], dtypes: ["contact"], inds: ["物流", "冷链"],
    intents: ["expanding"], agents: ["Scout Agent", "Industry Agent"], extensible: true,
  },
  {
    sid: "crossborder", name: "跨境电商", nameEn: "Cross-border",
    tagline: "扩展位：数据接入后自动激活",
    decisionQuestion: "跨境生态的支付/物流/合规服务如何配套？",
    needTags: ["market", "legal"], dtypes: ["contact", "policy"], inds: ["跨境", "电商"],
    intents: ["expanding"], agents: ["Scout Agent", "Policy Agent"], extensible: true,
  },
];

export interface ScenarioSummary {
  sid: string; name: string; nameEn: string; tagline: string; decisionQuestion: string;
  active: boolean; extensible: boolean;
  kpi: { entities: number; pendingDecisions: number; executing: number; done: number; won: number; avgStars: number };
  agents: string[];
  topEntities: Array<{ eid: string; name: string; tier: string; score: number; reason: string }>;
}

/** 场景聚合：每场景的 KPI + Top 企业（首页场景卡） */
export async function buildScenarioBoard(opts: { maskSensitive: boolean }): Promise<ScenarioSummary[]> {
  const db = await getDb();
  const [rules, ents] = await Promise.all([loadRules(), loadEntities()]);
  const now = new Date();
  const calcs = ents.map((x) => ({ x, r: calcEntity(x, rules, now), lc: inferLifecycle(x), intents: inferIntents(x) }));
  const allDecisions = db ? await db.select().from(decisions) : [];

  return SCENARIOS.map((s) => {
    // 企业归属：行业匹配 或 意图匹配 或 需求画布高星匹配
    const members = calcs.filter(({ x, r, lc, intents }) => {
      if (r.tier !== "P0" && r.tier !== "P1" && !s.extensible) return false;
      const indHit = s.inds === null ? true : s.inds.some((i) => x.ind.includes(i));
      const intentHit = intents.some((it) => s.intents.includes(it.tag));
      const canvas = buildNeedCanvas(x, lc);
      const needHit = s.needTags.some((t) => (canvas.find((c) => c.tag === t)?.stars ?? 0) >= 3);
      return s.inds !== null ? indHit && (intentHit || needHit || s.extensible) : (intentHit || needHit);
    });
    const dset = allDecisions.filter((d) => s.dtypes.includes(d.dtype as DType) && members.some((m) => m.x.eid === d.eid));
    const pending = dset.filter((d) => d.status === "suggested").length;
    const executing = dset.filter((d) => d.status === "adopted" || d.status === "executing").length;
    const done = dset.filter((d) => d.status === "done").length;
    const won = dset.filter((d) => d.outcome === "won").length;
    const avgStars = dset.length > 0 ? Math.round((dset.reduce((sum, d) => sum + d.stars, 0) / dset.length) * 10) / 10 : 0;
    const top = members
      .sort((a, b) => b.r.score - a.r.score)
      .slice(0, 3)
      .map(({ x, r }) => ({
        eid: x.eid,
        name: opts.maskSensitive ? maskEntityName(x.name) : x.name,
        tier: r.tier, score: r.score,
        reason: x.signals[0]?.t ?? `${x.ind} · Lead ${r.score}`,
      }));
    const active = !s.extensible && members.length > 0;
    return {
      sid: s.sid, name: s.name, nameEn: s.nameEn, tagline: s.tagline, decisionQuestion: s.decisionQuestion,
      active, extensible: !!s.extensible,
      kpi: { entities: members.length, pendingDecisions: pending, executing, done, won, avgStars },
      agents: s.agents,
      topEntities: top,
    };
  });
}

export interface ScenarioWorkspace extends ScenarioSummary {
  decisionQueue: Array<{
    id: number; eid: string; name: string; dtype: string; dtypeLabel: string;
    title: string; stars: number; status: string; assignee: string | null;
  }>;
  matchedResources: Array<{ id: number; name: string; rtype: string; capacity: number }>;
  needProfile: Array<{ tag: string; label: string; avgStars: number; count: number }>;
}

/** 单场景 Workspace：决策队列 + 资源 + 需求侧写（场景详情） */
export async function buildScenarioWorkspace(sid: string, opts: { maskSensitive: boolean }): Promise<ScenarioWorkspace | null> {
  const def = SCENARIOS.find((s) => s.sid === sid);
  if (!def) return null;
  const board = await buildScenarioBoard(opts);
  const summary = board.find((b) => b.sid === sid)!;
  const db = await getDb();
  const ents = await loadEntities();
  const nameMap = new Map(ents.map((e) => [e.eid, e.name]));
  const rules = await loadRules();
  const now = new Date();
  // 场景成员 eid 集合（与 board 相同口径）
  const memberEids = new Set<string>();
  for (const x of ents) {
    const r = calcEntity(x, rules, now);
    if (r.tier !== "P0" && r.tier !== "P1" && !def.extensible) continue;
    const lc = inferLifecycle(x);
    const intents = inferIntents(x);
    const indHit = def.inds === null ? true : def.inds.some((i) => x.ind.includes(i));
    const intentHit = intents.some((it) => def.intents.includes(it.tag));
    const canvas = buildNeedCanvas(x, lc);
    const needHit = def.needTags.some((t) => (canvas.find((c) => c.tag === t)?.stars ?? 0) >= 3);
    if (def.inds !== null ? indHit && (intentHit || needHit || def.extensible) : (intentHit || needHit)) memberEids.add(x.eid);
  }
  // 决策队列
  const rows = db ? await db.select().from(decisions).where(inArray(decisions.status, ["suggested", "adopted", "executing"])) : [];
  const queue = rows
    .filter((d) => def.dtypes.includes(d.dtype as DType) && memberEids.has(d.eid))
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 12)
    .map((d) => ({
      id: d.id, eid: d.eid,
      name: opts.maskSensitive ? maskEntityName(nameMap.get(d.eid) ?? d.eid) : (nameMap.get(d.eid) ?? d.eid),
      dtype: d.dtype, dtypeLabel: DTYPE_LABEL[d.dtype as DType] ?? d.dtype,
      title: d.title, stars: d.stars, status: d.status, assignee: d.assignee,
    }));
  // 场景资源（needTags 匹配）
  const res = await listResources();
  const matched = res
    .filter((r) => r.active === 1 && def.needTags.some((t) => r.needTags.split(",").map((s2) => s2.trim()).includes(t)))
    .slice(0, 6)
    .map((r) => ({ id: r.id, name: r.name, rtype: r.rtype, capacity: r.capacity }));
  // 需求侧写：场景成员的需求画布均值
  const needAgg = new Map<string, { label: string; sum: number; count: number }>();
  for (const eid of Array.from(memberEids)) {
    const x = ents.find((e) => e.eid === eid)!;
    const canvas = buildNeedCanvas(x, inferLifecycle(x));
    for (const c of canvas) {
      if (!def.needTags.includes(c.tag)) continue;
      const cur = needAgg.get(c.tag) ?? { label: c.label, sum: 0, count: 0 };
      cur.sum += c.stars; cur.count++;
      needAgg.set(c.tag, cur);
    }
  }
  const needProfile = Array.from(needAgg.entries()).map(([tag, v]) => ({
    tag, label: v.label, avgStars: Math.round((v.sum / Math.max(1, v.count)) * 10) / 10, count: v.count,
  })).sort((a, b) => b.avgStars - a.avgStars);
  return { ...summary, decisionQueue: queue, matchedResources: matched, needProfile };
}
