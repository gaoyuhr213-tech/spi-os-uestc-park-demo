/* V3 波次三 · Graph 计算引擎 + Simulation Center
   对标：Palantir Foundry Operational Graph / Scenario Simulation。
   Graph 不只是可视化：支持 What-if——「引入/流失一家企业」沿产业链与资源网络传导，
   量化税收/就业/办公面积/人才需求/产业链五维影响。
   所有系数为行业基准演示值（标注【假设】），接入真实财税数据后自动替换。 */
import { loadEntities, loadLatestStages, loadRules, maskEntityName, type AdapterEntity } from "./dataAdapter";
import { calcEntity } from "./ruleEngine";
import { buildNeedCanvas, inferLifecycle } from "./decisionEngine";
import { loadGraph } from "./graphData";
import { listResources } from "./resourceMatch";

/* ============ 行业基准系数（演示值，全部标注【假设】） ============ */
/** 每员工年税收贡献（万元）与人均办公面积（㎡）——按行业 */
const IND_COEF: Record<string, { taxPerEmp: number; areaPerEmp: number; talentRatio: number }> = {
  AI: { taxPerEmp: 4.5, areaPerEmp: 12, talentRatio: 0.7 },
  软件: { taxPerEmp: 3.8, areaPerEmp: 10, talentRatio: 0.65 },
  芯片: { taxPerEmp: 5.2, areaPerEmp: 15, talentRatio: 0.6 },
  通信: { taxPerEmp: 4.0, areaPerEmp: 11, talentRatio: 0.55 },
  金融: { taxPerEmp: 6.0, areaPerEmp: 9, talentRatio: 0.3 },
  教育: { taxPerEmp: 1.8, areaPerEmp: 8, talentRatio: 0.35 },
  企服: { taxPerEmp: 2.2, areaPerEmp: 8, talentRatio: 0.4 },
  检测: { taxPerEmp: 2.8, areaPerEmp: 14, talentRatio: 0.45 },
  新能源: { taxPerEmp: 3.5, areaPerEmp: 13, talentRatio: 0.5 },
  园区: { taxPerEmp: 2.0, areaPerEmp: 10, talentRatio: 0.2 },
  其他: { taxPerEmp: 2.5, areaPerEmp: 10, talentRatio: 0.35 },
};
function coefOf(ind: string) {
  for (const k of Object.keys(IND_COEF)) if (ind.includes(k)) return IND_COEF[k];
  return IND_COEF["其他"];
}

export interface WhatIfResult {
  eid: string;
  name: string;
  ind: string;
  action: "add" | "remove";
  employees: number;          // 用参保数或行业中位数估计
  empBasis: string;
  effects: Array<{ dim: string; value: string; direction: "up" | "down"; note: string }>;
  chainImpact: Array<{ eid: string; name: string; relation: string; note: string }>;
  totalNote: string;
}

/** What-if：引入(add) / 流失(remove) 一家企业的五维传导 */
export async function whatIfEntity(eid: string, action: "add" | "remove", opts: { maskSensitive: boolean }): Promise<WhatIfResult | null> {
  const ents = await loadEntities();
  const x = ents.find((e) => e.eid === eid);
  if (!x) return null;
  const en = (x.enrichFull ?? {}) as Record<string, string | number | null>;
  const insured = Number(en.insured ?? 0);
  const employees = insured > 0 ? insured : 25;
  const empBasis = insured > 0 ? `参保人数 ${insured}（已回填）` : "行业中位数 25 人【假设：未回填参保】";
  const c = coefOf(x.ind);
  const sign = action === "add" ? 1 : -1;
  const dir: "up" | "down" = action === "add" ? "up" : "down";
  const rdir: "up" | "down" = action === "add" ? "down" : "up";

  const tax = Math.round(employees * c.taxPerEmp * 10) / 10;
  const area = Math.round(employees * c.areaPerEmp);
  const talentDemand = Math.round(employees * c.talentRatio);
  const effects: WhatIfResult["effects"] = [
    { dim: "税收", value: `${sign > 0 ? "+" : "-"}${tax} 万元/年`, direction: dir, note: `${employees} 人 × ${c.taxPerEmp} 万/人·年【假设：行业基准】` },
    { dim: "就业", value: `${sign > 0 ? "+" : "-"}${employees} 人`, direction: dir, note: empBasis },
    { dim: "办公面积", value: `${sign > 0 ? "占用" : "释放"} ${area} ㎡`, direction: rdir, note: `人均 ${c.areaPerEmp} ㎡【假设】· ${action === "add" ? "需核对楼宇余量" : "释放后需补招商"}` },
    { dim: "人才需求", value: `${sign > 0 ? "+" : "-"}${talentDemand} 个技术岗`, direction: dir, note: `技术岗占比 ${Math.round(c.talentRatio * 100)}%【假设】· 信软管道${action === "add" ? "承接机会" : "输送减少"}` },
  ];

  /* 产业链传导：图谱中与该企业直接相连的节点 */
  const graph = await loadGraph({ maskSensitive: opts.maskSensitive });
  const chainImpact: WhatIfResult["chainImpact"] = [];
  for (const e2 of graph.edges) {
    const other = e2.from === eid ? e2.to : e2.to === eid ? e2.from : null;
    if (!other) continue;
    const on = graph.nodes.find((n) => n.key === other);
    if (!on) continue;
    const isCompany = on.kind === "company";
    chainImpact.push({
      eid: isCompany ? on.key : "",
      name: on.label,
      relation: e2.relType,
      note: action === "add" ? `协同强化（${e2.relType}，强度 ${e2.strength}）` : `关系断链风险（${e2.relType}，强度 ${e2.strength}）——${isCompany ? "建议同步维护" : "生态节点"}`,
    });
  }
  effects.push({
    dim: "产业链", value: `${chainImpact.length} 个关联节点受影响`, direction: action === "add" ? "up" : "down",
    note: chainImpact.length > 0 ? "见下方传导明细" : "图谱中暂无直接关联（可在屏三补边）",
  });

  return {
    eid, name: opts.maskSensitive ? maskEntityName(x.name) : x.name, ind: x.ind, action, employees, empBasis, effects, chainImpact,
    totalNote: "系数为行业基准演示值【假设】，接入税务/社保真实数据后自动替换；产业链传导来自屏三关系图数据。",
  };
}

/* ============ Simulation Center ============ */
export interface SimResult {
  kind: string;
  title: string;
  inputs: Array<{ label: string; value: string }>;
  outputs: Array<{ label: string; value: string; note: string }>;
  timeline: Array<{ period: string; text: string }>;
  risks: string[];
  assumption: string;
}

/** 招商模拟：引进 n 家 ind 行业企业（平均规模 size 人） */
export async function simulateAttract(ind: string, n: number, size: number): Promise<SimResult> {
  const c = coefOf(ind);
  const ents = await loadEntities();
  const sameInd = ents.filter((e) => e.ind.includes(ind) || ind.includes(e.ind)).length;
  const tax = Math.round(n * size * c.taxPerEmp);
  const area = n * size * c.areaPerEmp;
  const talent = Math.round(n * size * c.talentRatio);
  const hrDeals = Math.max(1, Math.round(n * 0.4));
  return {
    kind: "attract",
    title: `引进 ${n} 家${ind}企业（均 ${size} 人）`,
    inputs: [
      { label: "行业", value: ind }, { label: "数量", value: `${n} 家` }, { label: "平均规模", value: `${size} 人` },
      { label: "园区同行业存量", value: `${sameInd} 家（集聚效应基数）` },
    ],
    outputs: [
      { label: "年税收增量", value: `+${tax} 万元`, note: `${c.taxPerEmp} 万/人·年【假设】` },
      { label: "新增就业", value: `+${n * size} 人`, note: "全职口径" },
      { label: "办公面积需求", value: `${area} ㎡`, note: `人均 ${c.areaPerEmp} ㎡【假设】· 需核对 1F-13F 空置` },
      { label: "人才管道需求", value: `${talent} 个技术岗`, note: "信软学院管道承接（实习转化+定向直供）" },
      { label: "衍生 HR 服务机会", value: `约 ${hrDeals} 单撮合`, note: "按 40% 转化【假设】· Marketplace 收入层" },
    ],
    timeline: [
      { period: "0-30 天", text: "锁定目标名单（用屏二雷达同口径评分对外部线索预筛）" },
      { period: "30-90 天", text: "暖引荐触达（复用屏三路径 A/B）+ 政策包呈报" },
      { period: "90-180 天", text: "签约入驻 → 自动进入场景中枢「人才服务」队列" },
    ],
    risks: ["楼宇余量不足时需分期入驻【待验证：空置台账】", "同行业集聚过高会抬升人才竞价，建议错位引进上下游"],
    assumption: "全部系数为行业基准演示值【假设】，正式版对接税务/楼宇/社保数据源。",
  };
}

/** 政策模拟：某类政策（高企申报辅导覆盖率提升至 p%） */
export async function simulatePolicy(coverage: number): Promise<SimResult> {
  const ents = await loadEntities();
  const rules = await loadRules();
  const now = new Date();
  const eligible = ents.filter((e) => {
    const en = (e.enrichFull ?? {}) as Record<string, string | number | null>;
    const pat = Number(en.patents ?? 0) + Number(en.softCopyrights ?? 0);
    return pat >= 1 || ["AI", "软件", "芯片", "通信"].includes(e.ind);
  });
  const target = Math.round(eligible.length * (coverage / 100));
  const grant = target * 20;
  const consulting = Math.round(target * 0.6 * 3);
  return {
    kind: "policy",
    title: `高企/专精特新申报辅导覆盖率 ${coverage}%`,
    inputs: [
      { label: "潜在合格企业", value: `${eligible.length} 家（有知识产权或技术密集行业）` },
      { label: "目标覆盖", value: `${target} 家` },
    ],
    outputs: [
      { label: "企业获补贴", value: `约 ${grant} 万元`, note: "高企认定奖补 20 万/家【假设：成都高新区口径】" },
      { label: "咨询服务收入", value: `约 ${consulting} 万元`, note: "60% 委托辅导 × 3 万/单【假设】· 咨询收入层" },
      { label: "留驻强化", value: `${target} 家绑定 3 年`, note: "高企资质与注册地绑定，天然留驻锚" },
    ],
    timeline: [
      { period: "0-30 天", text: "按企业培育场景队列批量预评估（知识产权/研发费用归集）" },
      { period: "30-120 天", text: "分批申报（错开评审窗口）" },
      { period: "120-360 天", text: "获批 → 政策兑现 → 续期服务进入年度循环" },
    ],
    risks: ["研发费用归集不规范是最大退件原因，先做财务预诊断", "申报窗口期政策可能调整【待验证：当年度申报指南】"],
    assumption: "奖补标准与费率为演示值【假设】，正式版对接政策库实时口径。",
  };
}

/** 资源配置模拟：给定资源池容量，最优覆盖多少决策 */
export async function simulateResource(): Promise<SimResult> {
  const res = await listResources();
  const active = res.filter((r) => r.active === 1);
  const capacity = active.reduce((s, r) => s + r.capacity, 0);
  const byType = new Map<string, number>();
  for (const r of active) byType.set(r.rtype, (byType.get(r.rtype) ?? 0) + r.capacity);
  const ents = await loadEntities();
  const rules = await loadRules();
  const now = new Date();
  const demand = ents.filter((e) => ["P0", "P1"].includes(calcEntity(e, rules, now).tier)).length;
  const gap = Math.max(0, demand - capacity);
  return {
    kind: "resource",
    title: "资源池容量 vs P0/P1 需求盘",
    inputs: [
      { label: "活跃资源", value: `${active.length} 项 · 总容量 ${capacity} 单/期` },
      ...Array.from(byType.entries()).map(([t, v]) => ({ label: `容量 · ${t}`, value: `${v} 单` })),
    ],
    outputs: [
      { label: "P0/P1 需求盘", value: `${demand} 家`, note: "当前双轴评分口径" },
      { label: "容量缺口", value: gap > 0 ? `缺 ${gap} 单` : "容量充足", note: gap > 0 ? "建议扩容教授导师/HR 交付席位" : "可开放外部线索承接" },
      { label: "建议扩容优先级", value: gap > 0 ? "HR 服务 > 导师 > 投资人" : "维持现状", note: "按决策类型历史命中率排序（学习回流）" },
    ],
    timeline: [
      { period: "本周", text: "资源库管理页核对容量真实值（管理员）" },
      { period: "本月", text: gap > 0 ? "补充签约外部服务商（Marketplace 供给侧）" : "开放场景扩展位试点" },
    ],
    risks: ["容量为名额口径，未计单均交付时长差异【待验证】"],
    assumption: "需求=P0/P1 数量的保守口径；正式版按需求画布星级加权。",
  };
}
