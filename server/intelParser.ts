/**
 * 企业情报半自动解析填充（迭代7）
 * 合规边界（MVP）：
 *  - 仅解析用户手动粘贴的公开网页文本（企查查/天眼查等公开工商信息页）
 *  - 系统不主动访问外部网站、不做爬虫、不直接调用第三方 API —— 规避数据版权风险，符合 PIPL
 *  - 抽取字段严格对齐【情报富集回填模板】(importRow) 字段规范，写入走既有 importEnrichment 通道
 *
 * 扩展插槽（正式后端开发预留）：
 *  - 将来接入第三方工商 API（企查查开放平台/天眼查API等）时，实现 IntelProvider 接口即可，
 *    解析/校验/写入/复算链路不变。
 */
import { invokeLLM } from "./_core/llm";

/** 第三方工商数据源接入插槽（MVP 不实现，仅约定接口形状） */
export interface IntelProvider {
  /** 按企业名称/USCC 拉取工商信息，返回与 ParsedIntel 相同结构 */
  fetchByCompany(nameOrUscc: string): Promise<ParsedIntel>;
}

export type ParsedIntel = {
  uscc: string | null;
  regCapital: string | null;
  founded: string | null;
  insured: number | null;
  legalRep: string | null;
  jobs: number | null;
  topJobs: string | null;
  salaryRange: string | null;
  patents: number | null;
  softCopyrights: number | null;
  hiTech: string | null;
  funding: string | null;
  confidence: "高" | "中" | "低";
  warnings: string[];
};

const SCHEMA = {
  type: "object" as const,
  properties: {
    uscc: { type: ["string", "null"], description: "统一社会信用代码，18位；未出现填 null" },
    regCapital: { type: ["string", "null"], description: "注册资本原文，如 '500万元人民币'" },
    founded: { type: ["string", "null"], description: "成立日期/年份，如 '2015-06-12' 或 '2015'" },
    insured: { type: ["number", "null"], description: "参保人数（整数）" },
    legalRep: { type: ["string", "null"], description: "法定代表人姓名" },
    jobs: { type: ["number", "null"], description: "在招岗位数（整数）" },
    topJobs: { type: ["string", "null"], description: "主要在招岗位名称，逗号分隔，最多5个" },
    salaryRange: { type: ["string", "null"], description: "薪资区间，如 '15-25K'" },
    patents: { type: ["number", "null"], description: "专利数量（整数）" },
    softCopyrights: { type: ["number", "null"], description: "软件著作权数量（整数）" },
    hiTech: { type: ["string", "null"], description: "高新技术企业资质，'是'/'否'/null" },
    funding: { type: ["string", "null"], description: "融资/股改信息摘要，如 'A轮 2023' 或 '股份制改造 2024'" },
    confidence: { type: "string", enum: ["高", "中", "低"], description: "整体抽取置信度" },
    warnings: { type: "array", items: { type: "string" }, description: "需人工核验的疑点，如数字冲突、信息过期" },
  },
  required: ["uscc", "regCapital", "founded", "insured", "legalRep", "jobs", "topJobs", "salaryRange", "patents", "softCopyrights", "hiTech", "funding", "confidence", "warnings"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `你是园区情报作业系统的工商信息抽取引擎。用户会粘贴一段来自公开工商信息平台（企查查/天眼查等）的企业页面文本。

抽取规则（严格遵守）：
1. 只抽取文本中明确出现的信息，绝不推测、绝不编造；未出现的字段一律填 null。
2. 数字字段（参保人数/在招岗位/专利/软著）只填纯整数；文本写"约50人"取50；范围如"50-99人"取下限50并加入 warnings。
3. USCC 必须是文本中出现的18位代码，格式不符则填 null 并加入 warnings。
4. 同一字段出现多个矛盾值时，取最新/最权威的一个，并将矛盾写入 warnings。
5. 若文本疑似包含个人隐私（身份证号/手机号/家庭住址），不要抽取，加入 warnings 提示"文本含个人信息，已忽略"。
6. 若文本与目标企业名称明显不符，confidence 置"低"并在 warnings 说明。
7. confidence 判断：字段齐全且无矛盾=高；缺少2个以上关键字段或有矛盾=中；文本混乱或疑似非工商页面=低。`;

/** 解析用户粘贴的公开工商文本 → 结构化情报字段（对齐回填模板规范） */
export async function parseIntelText(companyName: string, pastedText: string): Promise<ParsedIntel> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `目标企业：${companyName}\n\n用户粘贴的公开工商信息文本：\n"""\n${pastedText.slice(0, 12000)}\n"""` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "parsed_intel", strict: true, schema: SCHEMA },
    },
  });
  const raw = response.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw : "";
  const parsed = JSON.parse(text) as ParsedIntel;
  // 服务端兜底校验（不信任 LLM 输出）
  if (parsed.uscc && !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(parsed.uscc.trim())) {
    parsed.warnings.push(`USCC 格式校验未通过（${parsed.uscc}），已置空待人工核验`);
    parsed.uscc = null;
  }
  for (const k of ["insured", "jobs", "patents", "softCopyrights"] as const) {
    const v = parsed[k];
    if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1000000)) {
      parsed.warnings.push(`${k} 数值异常（${v}），已置空`);
      parsed[k] = null;
    }
  }
  return parsed;
}

/* ============ 迭代8 · 批量解析（多企业文本切分） ============ */

export type BatchParsedItem = ParsedIntel & {
  /** LLM 从文本中识别出的企业名称（用于匹配园区主体） */
  companyName: string;
};

const BATCH_SCHEMA = {
  type: "object" as const,
  properties: {
    companies: {
      type: "array",
      description: "文本中识别出的每一家企业及其抽取字段",
      items: {
        type: "object",
        properties: {
          companyName: { type: "string", description: "企业全称（文本中出现的工商注册名称）" },
          ...SCHEMA.properties,
        },
        required: ["companyName", ...SCHEMA.required],
        additionalProperties: false,
      },
    },
  },
  required: ["companies"],
  additionalProperties: false,
};

const BATCH_SYSTEM_PROMPT = `你是园区情报作业系统的工商信息批量抽取引擎。用户会一次粘贴多家企业的公开工商信息文本（通常由多个企查查/天眼查页面内容拼接而成）。

切分规则：
1. 先识别文本中包含几家不同的企业（以企业全称/统一社会信用代码为切分锚点），每家企业输出一条记录。
2. 同一家企业的信息可能分散出现，需归并到同一条记录。
3. 无法确定归属的字段宁可填 null，不得张冠李戴；跨企业信息串扰时写入该企业的 warnings。

每家企业的字段抽取规则与单家抽取一致（只抽明确出现的信息、数字取整、USCC 18位校验、忽略个人隐私信息并在 warnings 提示、矛盾值取最新并记录 warnings）。
最多输出 20 家；超过 20 家时只输出前 20 家并在最后一家的 warnings 中说明。`;

/** 批量解析：一次粘贴多家企业公开文本 → 切分并逐家结构化抽取 */
export async function parseIntelBatch(pastedText: string): Promise<BatchParsedItem[]> {
  const response = await invokeLLM({
    messages: [
      { role: "system", content: BATCH_SYSTEM_PROMPT },
      { role: "user", content: `用户粘贴的多企业公开工商信息文本：\n"""\n${pastedText.slice(0, 48000)}\n"""` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "parsed_intel_batch", strict: true, schema: BATCH_SCHEMA },
    },
  });
  const raw = response.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw : "";
  const out = JSON.parse(text) as { companies: BatchParsedItem[] };
  const items = (out.companies ?? []).slice(0, 20);
  // 服务端兜底校验（与单家一致）
  for (const parsed of items) {
    if (!Array.isArray(parsed.warnings)) parsed.warnings = [];
    if (parsed.uscc && !/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(parsed.uscc.trim())) {
      parsed.warnings.push(`USCC 格式校验未通过（${parsed.uscc}），已置空待人工核验`);
      parsed.uscc = null;
    }
    for (const k of ["insured", "jobs", "patents", "softCopyrights"] as const) {
      const v = parsed[k];
      if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1000000)) {
        parsed.warnings.push(`${k} 数值异常（${v}），已置空`);
        parsed[k] = null;
      }
    }
  }
  return items;
}

/** 企业名归一化（用于与园区主体匹配）：去公司后缀/地域前缀/括号 */
export function normalizeCompanyName(n: string): string {
  return n
    .replace(/[（(].*?[)）]/g, "")
    .replace(/(有限公司|股份有限公司|有限责任公司|科技园|集团)$/g, "")
    .replace(/^(成都|四川|北京|上海|深圳|中国)/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 相似度匹配：返回最优匹配 eid 与是否精确（简单包含/等值策略，MVP 够用且可解释） */
export function matchEntity(
  parsedName: string,
  entities: { eid: string; name: string }[],
): { eid: string | null; matchedName: string | null; exact: boolean } {
  const pn = normalizeCompanyName(parsedName);
  if (!pn) return { eid: null, matchedName: null, exact: false };
  let best: { eid: string; name: string } | null = null;
  let bestExact = false;
  for (const e of entities) {
    const en = normalizeCompanyName(e.name);
    if (en === pn) { best = e; bestExact = true; break; }
    if (!best && (en.includes(pn) || pn.includes(en))) best = e;
  }
  return { eid: best?.eid ?? null, matchedName: best?.name ?? null, exact: bestExact };
}
