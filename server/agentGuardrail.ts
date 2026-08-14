/* 迭代27 · 工单18 · Agent 提示注入护栏
 * 拦截常见 prompt injection 模式，保护 LLM 网关不被越狱
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\s+a/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /\<\|im_start\|\>/i,
  /reveal\s+(all\s+)?secrets/i,
  /disregard\s+(all\s+)?prior/i,
  /override\s+(system|safety)/i,
  /jailbreak/i,
  /DAN\s+mode/i,
];

export interface SanitizeResult {
  flagged: boolean;
  patterns: string[];
  sanitized: string;
  original: string;
}

/** 检测并清洗提示注入内容 */
export function sanitizeAgentInput(input: string): SanitizeResult {
  const matched: string[] = [];
  let sanitized = input;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      matched.push(pattern.source);
      sanitized = sanitized.replace(pattern, "[BLOCKED]");
    }
  }
  return {
    flagged: matched.length > 0,
    patterns: matched,
    sanitized,
    original: input,
  };
}
