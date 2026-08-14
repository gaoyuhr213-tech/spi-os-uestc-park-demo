/* 迭代13 · 资源匹配引擎（Resource Matching Engine）：
   需求维度 × 行业 × 生命周期阶段 → Top-N 资源推荐（可解释匹配分）
   资源库 = Marketplace 收入层产品底座；演示资源经公开信息整理，联系方式脱敏。
   对标：LinkedIn（Graph Matching）/ ZoomInfo（Data→Routing）。 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { resources, type ResourceRow } from "../drizzle/schema";

export interface ResourceMatch {
  id: number;
  rtype: string;
  rtypeLabel: string;
  name: string;
  org: string | null;
  score: number; // 0-100 匹配分
  why: string[]; // 匹配依据（可解释）
}

export const RTYPE_LABEL: Record<string, string> = {
  mentor: "导师", headhunter: "猎头", alumni: "校友", professor: "教授",
  investor: "投资人", lawfirm: "律所", tax: "财税", vendor: "服务商", gaoyu: "高于人力",
};

/* 演示资源库种子（公开信息整理 + 平台生态伙伴，人名脱敏为姓氏+职务口径） */
const RESOURCE_SEED: Array<Omit<ResourceRow, "id" | "createdAt" | "tenantId">> = [
  { rtype: "gaoyu", name: "高于人力 · 批量招聘交付组", org: "高于人力", needTags: "talent", indTags: "", stageTags: "", capacity: 8, graphKey: "plat:gaoyu", note: "信软管道直供 · 实习转化方案", active: 1 },
  { rtype: "gaoyu", name: "高于人力 · 高端寻访组", org: "高于人力", needTags: "talent", indTags: "AI,软件,芯片", stageTags: "A轮,B轮及后,IPO准备", capacity: 3, graphKey: "plat:gaoyu", note: "高管/合伙人寻访", active: 1 },
  { rtype: "professor", name: "刘教授 · 计算机视觉方向", org: "电子科大信软学院", needTags: "rnd,talent", indTags: "AI,软件", stageTags: "", capacity: 2, graphKey: "dept:swe", note: "CV/多模态 · 可带实训组", active: 1 },
  { rtype: "professor", name: "陈教授 · 信息安全方向", org: "电子科大网安学院", needTags: "rnd", indTags: "软件,通信", stageTags: "", capacity: 2, graphKey: "dept:swe", note: "等保/密评咨询", active: 1 },
  { rtype: "mentor", name: "园区创业导师团 · 张导师", org: "园区股份", needTags: "market,funding", indTags: "", stageTags: "种子期,初创期,成长期,Pre-A", capacity: 4, graphKey: "plat:park", note: "商业模式/融资路演辅导", active: 1 },
  { rtype: "alumni", name: "成电校友会 · 投资分会", org: "电子科大校友会", needTags: "funding,market", indTags: "AI,软件,芯片,通信", stageTags: "Pre-A,A轮,B轮及后", capacity: 5, graphKey: "org:alumni", note: "校友投资人网络 · 暖引荐首选", active: 1 },
  { rtype: "investor", name: "某产业基金 · 硬科技方向", org: "合作机构", needTags: "funding", indTags: "AI,芯片,通信", stageTags: "A轮,B轮及后", capacity: 3, graphKey: null, note: "单笔 3000万-1亿", active: 1 },
  { rtype: "lawfirm", name: "合作律所 · 资本市场组", org: "生态伙伴", needTags: "legal,funding", indTags: "", stageTags: "Pre-A,A轮,B轮及后,IPO准备", capacity: 4, graphKey: null, note: "股改/IPO/融资协议", active: 1 },
  { rtype: "tax", name: "合作财税 · 高企申报组", org: "生态伙伴", needTags: "policy,legal", indTags: "", stageTags: "", capacity: 6, graphKey: null, note: "高企/专精特新/研发加计", active: 1 },
  { rtype: "vendor", name: "数字化服务商 · ERP/MES", org: "生态伙伴", needTags: "digital", indTags: "检测,企服,教育,新能源,金融", stageTags: "成长期,B轮及后,已上市", capacity: 5, graphKey: null, note: "非软件行业数字化改造", active: 1 },
  { rtype: "headhunter", name: "合作猎头 · 技术高管线", org: "生态伙伴", needTags: "talent", indTags: "AI,软件,芯片", stageTags: "A轮,B轮及后,IPO准备", capacity: 3, graphKey: null, note: "CTO/算法负责人寻访", active: 1 },
  { rtype: "vendor", name: "政策申报服务商 · 园区绿通", org: "园区股份", needTags: "policy", indTags: "", stageTags: "", capacity: 10, graphKey: "plat:park", note: "园区政策绿色通道", active: 1 },
];

/** 幂等播种：资源库为空时写入种子 */
export async function seedResources(): Promise<{ inserted: number }> {
  const db = await getDb();
  if (!db) return { inserted: 0 };
  const existing = await db.select({ id: resources.id }).from(resources).limit(1);
  if (existing.length > 0) return { inserted: 0 };
  for (const r of RESOURCE_SEED) await db.insert(resources).values(r);
  return { inserted: RESOURCE_SEED.length };
}

/** 匹配引擎：needTag 必配（40分）+ 行业匹配（30分）+ 阶段匹配（20分）+ 容量（10分） */
export async function matchResources(needTag: string | null, ind: string, phase: string, topN = 3): Promise<ResourceMatch[]> {
  const db = await getDb();
  if (!db || !needTag) return [];
  await seedResources();
  const rows = await db.select().from(resources).where(eq(resources.active, 1));
  const scored: ResourceMatch[] = [];
  for (const r of rows) {
    const needList = r.needTags.split(",").map((s) => s.trim());
    if (!needList.includes(needTag)) continue; // 需求维度必须命中
    let score = 40;
    const why: string[] = [`可服务需求维度「${needTag}」`];
    const inds = (r.indTags ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (inds.length === 0) { score += 15; why.push("全行业覆盖"); }
    else if (inds.includes(ind)) { score += 30; why.push(`行业对口（${ind}）`); }
    const stages = (r.stageTags ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (stages.length === 0) { score += 10; why.push("全阶段适配"); }
    else if (stages.includes(phase)) { score += 20; why.push(`阶段适配（${phase}）`); }
    if (r.capacity > 0) { score += Math.min(10, r.capacity); why.push(`本期可承接 ${r.capacity} 家`); }
    scored.push({ id: r.id, rtype: r.rtype, rtypeLabel: RTYPE_LABEL[r.rtype] ?? r.rtype, name: r.name, org: r.org, score: Math.min(100, score), why });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, topN);
}

/** 资源库清单（管理视图） */
export async function listResources(): Promise<ResourceRow[]> {
  const db = await getDb();
  if (!db) return [];
  await seedResources();
  return db.select().from(resources);
}

/* ============ 迭代14 · 资源库 CRUD（管理员，Marketplace 供给侧运营） ============ */
export interface ResourceInput {
  rtype: string; name: string; org?: string | null;
  needTags: string; indTags?: string | null; stageTags?: string | null;
  capacity: number; note?: string | null;
}
const VALID_RTYPES = new Set(Object.keys(RTYPE_LABEL));
const VALID_NEEDS = new Set(["talent", "funding", "policy", "market", "rnd", "digital", "legal"]);

function validateResourceInput(input: ResourceInput): string | null {
  if (!VALID_RTYPES.has(input.rtype)) return `未知资源类型：${input.rtype}`;
  const needs = input.needTags.split(",").map((s) => s.trim()).filter(Boolean);
  if (needs.length === 0) return "至少填写一个可服务需求维度";
  const bad = needs.find((n) => !VALID_NEEDS.has(n));
  if (bad) return `未知需求维度：${bad}（可选：talent/funding/policy/market/rnd/digital/legal）`;
  if (!input.name.trim()) return "资源名称不能为空";
  if (input.capacity < 0 || input.capacity > 999) return "容量需在 0-999 之间";
  return null;
}

export async function createResource(input: ResourceInput): Promise<{ ok: boolean; error?: string; id?: number }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "数据库不可用" };
  const err = validateResourceInput(input);
  if (err) return { ok: false, error: err };
  await db.insert(resources).values({
    rtype: input.rtype as ResourceRow["rtype"], name: input.name.trim().slice(0, 128), org: input.org?.slice(0, 128) ?? null,
    needTags: input.needTags, indTags: input.indTags ?? "", stageTags: input.stageTags ?? "",
    capacity: Math.round(input.capacity), note: input.note?.slice(0, 255) ?? null, active: 1,
  });
  const rows = await db.select({ id: resources.id }).from(resources).orderBy(resources.id);
  return { ok: true, id: rows[rows.length - 1]?.id };
}

export async function updateResource(id: number, input: Partial<ResourceInput>): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "数据库不可用" };
  const [row] = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
  if (!row) return { ok: false, error: "资源不存在" };
  const merged: ResourceInput = {
    rtype: input.rtype ?? row.rtype, name: input.name ?? row.name, org: input.org !== undefined ? input.org : row.org,
    needTags: input.needTags ?? row.needTags, indTags: input.indTags !== undefined ? input.indTags : row.indTags,
    stageTags: input.stageTags !== undefined ? input.stageTags : row.stageTags,
    capacity: input.capacity ?? row.capacity, note: input.note !== undefined ? input.note : row.note,
  };
  const err = validateResourceInput(merged);
  if (err) return { ok: false, error: err };
  await db.update(resources).set({
    rtype: merged.rtype as ResourceRow["rtype"], name: merged.name.trim().slice(0, 128), org: merged.org?.slice(0, 128) ?? null,
    needTags: merged.needTags, indTags: merged.indTags ?? "", stageTags: merged.stageTags ?? "",
    capacity: Math.round(merged.capacity), note: merged.note?.slice(0, 255) ?? null,
  }).where(eq(resources.id, id));
  return { ok: true };
}

export async function toggleResource(id: number, active: boolean): Promise<{ ok: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, error: "数据库不可用" };
  const [row] = await db.select({ id: resources.id }).from(resources).where(eq(resources.id, id)).limit(1);
  if (!row) return { ok: false, error: "资源不存在" };
  await db.update(resources).set({ active: active ? 1 : 0 }).where(eq(resources.id, id));
  return { ok: true };
}
