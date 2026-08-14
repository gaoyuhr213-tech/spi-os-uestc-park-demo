/* 迭代27 · 工单18 · 日志脱敏中间件
 * 所有写入日志/审计的对象经此函数过滤，遮蔽敏感字段
 */

const SENSITIVE_KEYS = new Set(["apiKey", "api_key", "secret", "password", "token", "authorization", "cookie", "jwt", "secretKey", "QCC_API_KEY", "QCC_SECRET_KEY", "JOB_BOARD_API_KEY"]);
const PHONE_RE = /^(\d{3})\d{4,}(\d{4})$/;
const EMAIL_RE = /^(.{1,3}).*@(.*)$/;

export function sanitizeForLog(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(k.toLowerCase())) {
      result[k] = "***";
    } else if (typeof v === "string" && PHONE_RE.test(v)) {
      result[k] = v.replace(PHONE_RE, "$1****$2");
    } else if (typeof v === "string" && EMAIL_RE.test(v) && v.includes("@")) {
      result[k] = v.replace(EMAIL_RE, "$1***@$2");
    } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      result[k] = sanitizeForLog(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}
