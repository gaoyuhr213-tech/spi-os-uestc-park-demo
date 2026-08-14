/* ============================================================
 * 行业标准化服务（Industry Normalizer）
 * 三级匹配：精确细分 → 上位行业 → 别名/token → fallback
 * ============================================================ */

/* ---------- 配置化行业层级与别名 ---------- */
export interface IndustryRule {
  category: string;         // 上位行业
  details: string[];        // 细分行业标签
  aliases: string[];        // 别名
  tokens: string[];         // 可拆分 token
  score: number;            // pipeMatch 分数
  rationale: string;        // 评分依据
}

export const INDUSTRY_PIPE_MATCH_RULES: IndustryRule[] = [
  {
    category: "AI",
    details: ["计算机视觉", "数据智能", "机器学习", "NLP", "大模型", "深度学习"],
    aliases: ["人工智能", "CV", "AI与数据智能", "AI(计算机视觉)", "AI（计算机视觉）"],
    tokens: ["AI", "人工智能", "智能", "数据智能", "计算机视觉"],
    score: 90,
    rationale: "信软学院核心供给方向：AI/算法/数据工程",
  },
  {
    category: "软件",
    details: ["云服务", "SaaS", "信息安全", "系统集成", "软件开发"],
    aliases: ["软件与云服务", "软件/云服务", "软件/信息安全"],
    tokens: ["软件", "云服务", "SaaS", "信息安全", "系统集成"],
    score: 92,
    rationale: "信软学院主力供给：软件工程/信息安全/云计算",
  },
  {
    category: "芯片",
    details: ["集成电路", "半导体", "EDA", "FPGA", "SoC"],
    aliases: ["集成电路", "半导体", "IC设计"],
    tokens: ["芯片", "集成电路", "半导体", "IC"],
    score: 78,
    rationale: "信软学院嵌入式/硬件方向部分对口",
  },
  {
    category: "通信",
    details: ["网络", "导航", "视频", "5G", "物联网", "卫星"],
    aliases: ["通信/网络", "通信/导航", "通信/视频"],
    tokens: ["通信", "网络", "导航", "5G", "物联网", "视频通信"],
    score: 72,
    rationale: "通信工程与信软交叉方向",
  },
  {
    category: "检测",
    details: ["测控", "信息安全检测", "质量检验", "认证"],
    aliases: ["检验检测", "检验检测/测控", "检验检测/信息安全"],
    tokens: ["检测", "测控", "检验", "认证"],
    score: 60,
    rationale: "测控/信息安全检测与信软有交集",
  },
  {
    category: "金融",
    details: ["银行", "保险", "证券", "金融科技"],
    aliases: ["金融科技", "FinTech"],
    tokens: ["金融", "银行", "保险", "证券"],
    score: 55,
    rationale: "金融科技需要软件/数据人才",
  },
  {
    category: "教育",
    details: ["科研", "培训", "高等教育", "职业教育"],
    aliases: ["科研教育", "科研/政府"],
    tokens: ["教育", "科研", "培训", "高校"],
    score: 45,
    rationale: "教育机构有实习合作但非核心招聘客户",
  },
  {
    category: "新能源",
    details: ["光伏", "储能", "电池", "氢能"],
    aliases: [],
    tokens: ["新能源", "光伏", "储能", "电池"],
    score: 40,
    rationale: "新能源企业嵌入式/算法岗位有限",
  },
  {
    category: "园区",
    details: ["运营", "孵化", "配套"],
    aliases: ["园区运营", "孵化配套"],
    tokens: ["园区", "孵化", "运营"],
    score: 35,
    rationale: "园区运营方非直接招聘客户",
  },
  {
    category: "企服",
    details: ["法律", "财务", "咨询", "人力", "知识产权"],
    aliases: ["企业服务"],
    tokens: ["企服", "企业服务", "法律", "财务", "咨询", "专利", "知识产权"],
    score: 30,
    rationale: "企业服务机构自身招聘需求有限",
  },
  {
    category: "电子",
    details: ["电子元器件", "显示", "传感器"],
    aliases: ["电子/其他"],
    tokens: ["电子", "显示", "元器件"],
    score: 50,
    rationale: "电子类企业嵌入式/硬件岗位对口",
  },
  {
    category: "出版",
    details: ["数字出版", "期刊", "媒体"],
    aliases: ["期刊"],
    tokens: ["出版", "期刊", "媒体"],
    score: 20,
    rationale: "出版行业技术岗位极少",
  },
  {
    category: "协会",
    details: ["行业协会", "商会"],
    aliases: [],
    tokens: ["协会", "商会"],
    score: 25,
    rationale: "协会为渠道而非招聘客户",
  },
  {
    category: "配套",
    details: ["物业", "路演", "实训"],
    aliases: [],
    tokens: ["配套", "物业", "路演", "实训"],
    score: 15,
    rationale: "配套设施无招聘需求",
  },
];

/* ---------- 标准化结果 ---------- */
export interface NormalizedIndustry {
  raw: string;
  normalized: string;
  category: string;
  details: string[];
  tokens: string[];
  matchLevel: "exact_detail" | "exact_category" | "alias" | "token" | "fallback";
  matchedRule: string | null;
  score: number;
}

/* ---------- 核心标准化函数 ---------- */
export function normalizeIndustryLabel(raw: string): NormalizedIndustry {
  if (!raw || raw.trim() === "") {
    return { raw, normalized: "未知", category: "未知", details: [], tokens: [], matchLevel: "fallback", matchedRule: null, score: 25 };
  }

  // 标准化：全角→半角括号，去首尾空格
  const normalized = raw.trim()
    .replace(/（/g, "(").replace(/）/g, ")")
    .replace(/、/g, "/");

  // 提取 tokens：按 / + ( ) 拆分
  const rawTokens = normalized
    .replace(/[()]/g, "/")
    .split("/")
    .map(t => t.trim())
    .filter(t => t.length > 0);

  // 1. 精确别名匹配（含完整细分标签）
  for (const rule of INDUSTRY_PIPE_MATCH_RULES) {
    if (rule.aliases.includes(normalized) || rule.aliases.includes(raw)) {
      return {
        raw, normalized, category: rule.category,
        details: rawTokens.filter(t => t !== rule.category),
        tokens: rawTokens, matchLevel: "alias", matchedRule: rule.category, score: rule.score,
      };
    }
  }

  // 2. 精确上位行业匹配
  for (const rule of INDUSTRY_PIPE_MATCH_RULES) {
    if (normalized === rule.category || rawTokens[0] === rule.category) {
      return {
        raw, normalized, category: rule.category,
        details: rawTokens.slice(1),
        tokens: rawTokens, matchLevel: "exact_category", matchedRule: rule.category, score: rule.score,
      };
    }
  }

  // 3. 细分行业匹配
  for (const rule of INDUSTRY_PIPE_MATCH_RULES) {
    for (const detail of rule.details) {
      if (rawTokens.includes(detail) || normalized.includes(detail)) {
        return {
          raw, normalized, category: rule.category,
          details: [detail, ...rawTokens.filter(t => t !== detail && t !== rule.category)],
          tokens: rawTokens, matchLevel: "exact_detail", matchedRule: `${rule.category}/${detail}`, score: rule.score,
        };
      }
    }
  }

  // 4. Token 匹配（任一 token 命中规则 tokens）
  for (const rule of INDUSTRY_PIPE_MATCH_RULES) {
    for (const token of rawTokens) {
      if (rule.tokens.includes(token)) {
        return {
          raw, normalized, category: rule.category,
          details: rawTokens.filter(t => t !== rule.category),
          tokens: rawTokens, matchLevel: "token", matchedRule: `${rule.category}[token:${token}]`, score: rule.score,
        };
      }
    }
  }

  // 5. Fallback
  return {
    raw, normalized, category: "其他", details: rawTokens, tokens: rawTokens,
    matchLevel: "fallback", matchedRule: null, score: 25,
  };
}

/* ---------- 辅助函数 ---------- */
export function extractIndustryTokens(raw: string): string[] {
  return normalizeIndustryLabel(raw).tokens;
}

export function resolveIndustryCategory(raw: string): string {
  return normalizeIndustryLabel(raw).category;
}

export function resolveIndustryDetail(raw: string): string[] {
  return normalizeIndustryLabel(raw).details;
}

export function getIndustryAliases(category: string): string[] {
  const rule = INDUSTRY_PIPE_MATCH_RULES.find(r => r.category === category);
  return rule?.aliases ?? [];
}

/** 核心：用于 ruleEngine 替代 rules.pipeMatch[x.ind] */
export function matchIndustryRule(raw: string): number {
  return normalizeIndustryLabel(raw).score;
}
