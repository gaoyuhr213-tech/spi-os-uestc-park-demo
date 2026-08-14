/* Excel 情报批量导入：前端仅负责解析回填模板为行数组并预览；
   匹配、校验、入库、评分复算全部由后端 park.importEnrichment + snapshot 完成。 */
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { downloadXlsx } from "@/lib/exportXlsx";
import { toast } from "sonner";
import { FileSpreadsheet, Upload, CheckCircle2, AlertTriangle, Loader2, Download } from "lucide-react";
import * as XLSX from "xlsx";

/** 回填模板列名 → 后端字段映射 */
const COL_MAP: Record<string, string> = {
  "eid": "eid",
  "企业/机构名称": "name",
  "统一社会信用代码 USCC": "uscc",
  "注册资本(万元)": "regCapital",
  "成立年份": "founded",
  "参保人数": "insured",
  "实控人/法定代表人": "legalRep",
  "分支机构(个)": "branches",
  "在招岗位数": "jobs",
  "核心在招岗位(Top3)": "topJobs",
  "月薪区间(核心岗)": "salaryRange",
  "专利数": "patents",
  "软著数": "softCopyrights",
  "高企资质": "hiTech",
  "融资轮次/股改": "funding",
  "近12月招投标中标(万元)": "bidAmount",
  "官网/ICP备案": "icp",
  "关键决策人(职务)": "keyContact",
  "暖引荐中间人": "referralVia",
  "引荐路径备注": "referralNote",
  "核验状态": "verified",
  "核验人/日期": "verifiedBy",
  "备注": "remark",
};
const NUM_FIELDS = new Set(["insured", "branches", "jobs", "patents", "softCopyrights"]);

type Row = Record<string, unknown>;

function parseWorkbook(buf: ArrayBuffer): Row[] {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: Row[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as Row[][];
  // 定位表头行（含「企业/机构名称」的行）
  const hdrIdx = raw.findIndex((r) => (r as unknown as string[]).some((c) => String(c).includes("企业/机构名称")));
  if (hdrIdx < 0) throw new Error("未找到表头行（需含「企业/机构名称」列）");
  const headers = (raw[hdrIdx] as unknown as string[]).map((h) => String(h).trim());
  const rows: Row[] = [];
  for (let i = hdrIdx + 1; i < raw.length; i++) {
    const line = raw[i] as unknown as unknown[];
    if (!line || line.every((c) => c === "" || c == null)) continue;
    const row: Row = {};
    headers.forEach((h, j) => {
      const key = COL_MAP[h];
      if (!key) return;
      let v: unknown = line[j];
      if (v === "" || v == null || v === "—" || v === "待回填") return;
      if (NUM_FIELDS.has(key)) {
        const n = Number(String(v).replace(/[^\d.-]/g, ""));
        if (Number.isNaN(n)) return;
        v = n;
      } else {
        v = String(v).trim();
      }
      row[key] = v;
    });
    // 跳过数据源提示行
    if (row.name && String(row.name).startsWith("数据源")) continue;
    if (row.eid || row.name) rows.push(row);
  }
  return rows;
}

type ReportRow = { row: number; company: string; status: "成功" | "跳过" | "失败"; matchedBy: string; fields: number; suggestion: string };

export default function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<{ ok: number; skipped?: number; failed: number; errors: { row: number; reason: string }[]; report?: ReportRow[] } | null>(null);
  const utils = trpc.useUtils();
  const importMut = trpc.park.importEnrichment.useMutation({
    onSuccess: (res) => {
      setResult(res);
      utils.park.snapshot.invalidate();
      utils.park.tasks.invalidate();
      if (res.ok > 0) toast.success(`已导入 ${res.ok} 家企业情报，评分与全看板已自动复算刷新`);
      if ((res.skipped ?? 0) + res.failed > 0) toast.warning(`${(res.skipped ?? 0) + res.failed} 行未写入，见逐行校验报告`);
    },
    onError: (e) => toast.error(`导入失败：${e.message}`),
  });

  const onFile = async (f: File) => {
    try {
      const buf = await f.arrayBuffer();
      const parsed = parseWorkbook(buf);
      if (parsed.length === 0) { toast.error("未解析到有效数据行"); return; }
      setRows(parsed);
      setFileName(f.name);
      setResult(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "文件解析失败");
    }
  };

  const filled = (r: Row) => Object.keys(r).filter((k) => k !== "eid" && k !== "name").length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif-sc text-foreground flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" /> Excel 情报批量导入
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-[13px]">
          <p className="text-muted-foreground leading-relaxed">
            上传《P0/P1 情报富集回填模板》（.xlsx）。系统按 eid / 企业名称自动匹配主体，写入富集库后由后端规则引擎
            <b className="text-foreground">自动复算 Lead 评分与分级</b>，三屏 KPI、雷达排序、漏斗全部联动刷新。
          </p>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-md border-2 border-dashed border-border hover:border-primary/60 bg-secondary/40 px-4 py-8 text-center transition-colors"
          >
            <Upload className="w-6 h-6 mx-auto text-muted-foreground" />
            <div className="mt-2 text-foreground font-medium">{fileName || "点击选择回填模板 Excel 文件"}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">支持 26 家 P0/P1 回填模板原格式；仅企业公开信息，PIPL 合规</div>
          </button>

          {rows.length > 0 && !result && (
            <div className="rounded-md border border-border overflow-hidden">
              <div className="bg-secondary/60 px-3 py-2 text-[12px] font-medium text-foreground">
                解析预览 · {rows.length} 行有效数据
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-border/60">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-1.5 text-[12px]">
                    <span className="text-foreground truncate">{String(r.eid || "")} {String(r.name || "(按名称匹配)")}</span>
                    <span className="text-muted-foreground flex-none">{filled(r)} 个字段</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-md border border-border px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-foreground font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> 成功 {result.ok} 行
                {(result.skipped ?? 0) > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">跳过 {result.skipped} 行</span>
                )}
                {result.failed > 0 && (
                  <span className="flex items-center gap-1 text-amber-500"><AlertTriangle className="w-4 h-4" /> 失败 {result.failed} 行</span>
                )}
                {result.report && result.report.length > 0 && (
                  <button
                    onClick={() => downloadXlsx(result.report as unknown as Record<string, unknown>[], "导入校验报告", `SPI-OS_导入校验报告_${new Date().toISOString().slice(0, 10)}`)}
                    className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" /> 导出报告
                  </button>
                )}
              </div>
              {/* 逐行校验报告（迭代6）：状态 / 匹配方式 / 字段数 / 纠错建议 */}
              {result.report && result.report.length > 0 && (
                <div className="rounded-sm border border-border/70 overflow-hidden">
                  <div className="grid grid-cols-[36px_1fr_44px_80px_1.2fr] gap-2 bg-secondary/60 px-2.5 py-1.5 text-[10.5px] font-medium text-muted-foreground">
                    <span>行</span><span>企业</span><span>状态</span><span>匹配方式</span><span>校验建议</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
                    {result.report.map((r) => (
                      <div key={r.row} className="grid grid-cols-[36px_1fr_44px_80px_1.2fr] gap-2 px-2.5 py-1.5 text-[11px]">
                        <span className="font-mono-num text-muted-foreground/70">{r.row}</span>
                        <span className="text-foreground truncate" title={r.company}>{r.company}</span>
                        <span style={{ color: r.status === "成功" ? "var(--stage-won)" : r.status === "跳过" ? "var(--tier-p1)" : "var(--tier-p0)" }}>{r.status}</span>
                        <span className="text-muted-foreground">{r.matchedBy}{r.status === "成功" ? ` · ${r.fields}字段` : ""}</span>
                        <span className="text-muted-foreground leading-snug">{r.suggestion}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[11.5px] text-muted-foreground">评分已复算，关闭本窗口即可查看更新后的看板与雷达排序。</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>关闭</Button>
            <Button
              disabled={rows.length === 0 || importMut.isPending || !!result}
              onClick={() => importMut.mutate({ rows: rows as never })}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {importMut.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              导入并复算（{rows.length} 行）
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
