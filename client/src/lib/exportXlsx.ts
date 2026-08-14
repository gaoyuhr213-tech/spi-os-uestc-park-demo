/* Excel 导出工具：后端组装行数据（exportData API），前端仅负责生成 xlsx 文件下载。
   业务列与排序全部由后端决定，前端不持有导出逻辑。 */
import * as XLSX from "xlsx";

export function downloadXlsx(rows: Record<string, unknown>[], sheet: string, file: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  // 自适应列宽（按表头与内容最大长度，中文按2倍宽度估算）
  const keys = rows.length ? Object.keys(rows[0]) : [];
  ws["!cols"] = keys.map((k) => {
    const w = Math.max(
      strWidth(k),
      ...rows.slice(0, 200).map((r) => strWidth(String(r[k] ?? ""))),
    );
    return { wch: Math.min(48, Math.max(6, w + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, `${file}.xlsx`);
}

function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += /[\u4e00-\u9fff\uff00-\uffef]/.test(ch) ? 2 : 1;
  return w;
}
