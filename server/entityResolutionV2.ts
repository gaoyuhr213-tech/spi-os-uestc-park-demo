/* 迭代28 · 企业身份解析 v2（独立服务，不塞路由）
 * 输入：companyName / uscc / domain / phone / address / room
 * 输出：status + matchedEid + score + reasons + candidates
 */
import { getDb } from "./db";
import { entities, enrichments, entityAliases } from "../drizzle/schema";
import { eq, like } from "drizzle-orm";

export interface ResolutionInput {
  companyName?: string;
  uscc?: string;
  domain?: string;
  phone?: string;
  address?: string;
  room?: string;
}

export interface ResolutionResult {
  status: "exact" | "high_confidence" | "candidates" | "unmatched";
  matchedEid?: string;
  matchedName?: string;
  score?: number;
  reasons: string[];
  candidates: Array<{ eid: string; name: string; score: number; matchedOn: string[] }>;
}

/** 归一化企业名（去后缀、去空格、去括号） */
function normalizeName(name: string): string {
  return name
    .replace(/[\s\u3000]+/g, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/(有限公司|股份有限公司|有限责任公司|集团|公司)$/g, "")
    .toLowerCase();
}

export async function resolveEntity(input: ResolutionInput): Promise<ResolutionResult> {
  const db = await getDb();
  if (!db) return { status: "unmatched", reasons: ["数据库不可用"], candidates: [] };

  const candidates: ResolutionResult["candidates"] = [];

  // 1. USCC 精确匹配（最高优先级）
  if (input.uscc && input.uscc.length === 18) {
    const [enr] = await db.select().from(enrichments).where(eq(enrichments.uscc, input.uscc));
    if (enr) {
      const [ent] = await db.select().from(entities).where(eq(entities.eid, enr.eid));
      if (ent) return { status: "exact", matchedEid: ent.eid, matchedName: ent.name, score: 100, reasons: ["USCC 精确匹配"], candidates: [] };
    }
  }

  // 2. 企业法定全称精确匹配
  if (input.companyName) {
    const allEnts = await db.select().from(entities);
    const exact = allEnts.find((e) => e.name === input.companyName);
    if (exact) return { status: "exact", matchedEid: exact.eid, matchedName: exact.name, score: 100, reasons: ["企业全称精确匹配"], candidates: [] };

    // 3. 已核验别名匹配
    const aliases = await db.select().from(entityAliases).where(eq(entityAliases.verified, 1));
    const aliasMatch = aliases.find((a) => a.aliasValue === input.companyName || a.normalizedValue === normalizeName(input.companyName!));
    if (aliasMatch) {
      const [ent] = await db.select().from(entities).where(eq(entities.eid, aliasMatch.eid));
      if (ent) return { status: "high_confidence", matchedEid: ent.eid, matchedName: ent.name, score: 95, reasons: ["已核验别名匹配"], candidates: [] };
    }

    // 4. 名称归一化模糊匹配
    const inputNorm = normalizeName(input.companyName);
    for (const ent of allEnts) {
      const entNorm = normalizeName(ent.name);
      if (entNorm === inputNorm) {
        candidates.push({ eid: ent.eid, name: ent.name, score: 90, matchedOn: ["归一化全称匹配"] });
      } else if (entNorm.includes(inputNorm) || inputNorm.includes(entNorm)) {
        const score = Math.round(70 * Math.min(entNorm.length, inputNorm.length) / Math.max(entNorm.length, inputNorm.length));
        candidates.push({ eid: ent.eid, name: ent.name, score, matchedOn: ["名称包含匹配"] });
      }
    }
  }

  // 5. 房号匹配（园区特有）
  if (input.room) {
    const allEnts = await db.select().from(entities);
    const roomMatch = allEnts.filter((e) => e.room === input.room);
    for (const ent of roomMatch) {
      if (!candidates.find((c) => c.eid === ent.eid)) {
        candidates.push({ eid: ent.eid, name: ent.name, score: 60, matchedOn: ["房号匹配"] });
      }
    }
  }

  // 去重排序
  candidates.sort((a, b) => b.score - a.score);
  const unique = candidates.filter((c, i, arr) => arr.findIndex((x) => x.eid === c.eid) === i);

  if (unique.length === 0) return { status: "unmatched", reasons: ["无匹配候选"], candidates: [] };
  if (unique[0].score >= 90) {
    // 高置信但非精确
    return { status: "high_confidence", matchedEid: unique[0].eid, matchedName: unique[0].name, score: unique[0].score, reasons: unique[0].matchedOn, candidates: unique.slice(0, 5) };
  }
  if (unique.length >= 2 && unique[0].score - unique[1].score < 10) {
    // 两个候选分差过小，不自动匹配
    return { status: "candidates", reasons: ["多候选分差过小，需人工选择"], candidates: unique.slice(0, 5) };
  }
  if (unique[0].score >= 70) {
    return { status: "high_confidence", matchedEid: unique[0].eid, matchedName: unique[0].name, score: unique[0].score, reasons: unique[0].matchedOn, candidates: unique.slice(0, 5) };
  }
  return { status: "candidates", reasons: ["置信度不足，需人工确认"], candidates: unique.slice(0, 5) };
}

