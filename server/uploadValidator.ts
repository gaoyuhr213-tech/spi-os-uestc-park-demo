/* 迭代27 · 工单18 · 文件上传/导出白名单校验
 * 类型白名单 + 大小上限（100MB）
 */

const ALLOWED_EXTENSIONS = new Set([".csv", ".xlsx", ".xls", ".json", ".txt", ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);
const BLOCKED_EXTENSIONS = new Set([".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".dll", ".so", ".dylib", ".com", ".scr", ".vbs", ".js", ".wsh"]);
const MAX_SIZE_BYTES = 100_000_000; // 100MB（精确 1 亿字节，对齐测试断言）

export function validateUpload(file: { filename: string; size: number }): { ok: boolean; reason?: string } {
  const ext = file.filename.slice(file.filename.lastIndexOf(".")).toLowerCase();
  if (BLOCKED_EXTENSIONS.has(ext) || !ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `文件类型 ${ext} 不在白名单或被明确禁止（允许：${Array.from(ALLOWED_EXTENSIONS).join(", ")}）` };
  }
  if (file.size > MAX_SIZE_BYTES) {
    return { ok: false, reason: `文件大小 ${(file.size / 1024 / 1024).toFixed(1)}MB 超过上限 100MB` };
  }
  return { ok: true };
}
