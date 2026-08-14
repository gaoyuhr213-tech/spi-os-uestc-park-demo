/* AI 批量解析（迭代8）
   工作流：一次粘贴多家企业公开工商文本 → 后端 LLM 切分识别多主体并逐家抽取
   → 批量预览（自动匹配园区主体 + 手动修正下拉 + 勾选取舍）→ 一并写入（importEnrichment 通道）
   → 统一复算评分 → 全看板联动。
   移动端：对话框全屏化 + 剪贴板一键粘贴，适配外勤作业。 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useSnapshot } from "@/lib/park";
import { Check, ClipboardPaste, Layers, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const FIELD_KEYS = ["uscc", "regCapital", "founded", "insured", "legalRep", "jobs", "topJobs", "salaryRange", "patents", "softCopyrights", "hiTech", "funding"] as const;

type BatchRow = {
  parsedName: string;
  eid: string | null;
  matchedName: string | null;
  exact: boolean;
  parsed: Record<string, unknown> & { confidence: string; warnings: string[] };
};

export default function IntelBatchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  /** 每行的写入目标 eid（可手动修正）与是否勾选 */
  const [targets, setTargets] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const utils = trpc.useUtils();
  const { items } = useSnapshot();

  const entityOptions = useMemo(
    () => [...items].sort((a, b) => a.name.localeCompare(b.name, "zh")).map((x) => ({ eid: x.eid, name: x.name })),
    [items],
  );

  const parseMut = trpc.park.ai.parseIntelBatch.useMutation({
    onSuccess: (d) => {
      const t: Record<number, string> = {};
      const c: Record<number, boolean> = {};
      d.rows.forEach((r, i) => {
        if (r.eid) t[i] = r.eid;
        c[i] = !!r.eid; // 默认勾选已匹配的行
      });
      setTargets(t); setChecked(c);
      toast.success(`识别出 ${d.total} 家企业，自动匹配园区主体 ${d.matched} 家`);
    },
    onError: (e) => toast.error(`批量解析失败：${e.message}`),
  });

  const importMut = trpc.park.importEnrichment.useMutation({
    onSuccess: (d) => {
      utils.park.snapshot.invalidate();
      utils.park.tasks.invalidate();
      toast.success(`批量写入完成：成功 ${d.ok} 行${d.skipped ? `，跳过 ${d.skipped} 行` : ""}；评分已统一复算，看板已联动`);
      onClose(); setText(""); parseMut.reset(); setTargets({}); setChecked({});
    },
    onError: (e) => toast.error(`写入失败：${e.message}`),
  });

  const rows = (parseMut.data?.rows ?? []) as BatchRow[];
  const pickedCount = rows.filter((_, i) => checked[i] && targets[i]).length;

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) { toast("剪贴板为空"); return; }
      setText((prev) => (prev ? prev + "\n\n" + t : t));
      toast.success("已从剪贴板粘贴");
    } catch {
      toast("无法读取剪贴板（浏览器未授权），请长按输入框手动粘贴");
    }
  };

  const writeIn = () => {
    const toWrite = rows
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => checked[i] && targets[i])
      .map(({ r, i }) => {
        const row: Record<string, unknown> = { eid: targets[i] };
        FIELD_KEYS.forEach((k) => {
          const v = r.parsed[k];
          if (v != null && v !== "") row[k] = v;
        });
        row.verified = "待核验";
        row.remark = `AI批量解析填充（识别名：${r.parsedName}）`;
        // 迭代12 · 溯源元信息：来源=批量 AI 解析 + 该主体抽取结果快照（后端落 parseHistory）
        row._source = "ai_parse_batch";
        row._rawText = JSON.stringify(r.parsed).slice(0, 20000);
        row._confidence = String((r.parsed as Record<string, unknown>).confidence ?? "");
        return row;
      });
    if (toWrite.length === 0) { toast.error("请至少勾选一行并确认写入目标企业"); return; }
    importMut.mutate({ rows: toWrite as never[] });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[calc(100vw-1rem)] sm:w-auto h-[100dvh] sm:h-auto sm:max-h-[88vh] overflow-y-auto bg-card border-border rounded-none sm:rounded-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-serif-sc text-foreground flex items-center gap-2 text-[15px]">
            <Layers className="w-4 h-4 text-primary" /> AI 批量解析 · 多企业集中回填
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="w-4 h-4 flex-none text-emerald-500 mt-0.5" />
          <span>
            <b className="text-foreground">合规边界：</b>仅解析你手动粘贴的公开工商信息文本（可将多家企业的企查查/天眼查页面文本依次拼接粘贴，一次最多识别 20 家）。
            系统不访问外部网站、不做爬虫、不调用第三方 API；写入一律标记「待核验」。
          </span>
        </div>

        {rows.length === 0 ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={"依次粘贴多家企业的公开工商信息页面文本（企业之间直接连续粘贴即可，AI 会按企业全称/信用代码自动切分）…"}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={pasteFromClipboard}
                className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2.5 text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors active:scale-[0.98]"
              >
                <ClipboardPaste className="w-3.5 h-3.5" /> 从剪贴板粘贴
              </button>
              <span className="text-[10.5px] text-muted-foreground">{text.length} 字 · 至少 50 字</span>
              <button
                onClick={() => parseMut.mutate({ text })}
                disabled={text.trim().length < 50 || parseMut.isPending}
                className="ml-auto flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[12.5px] font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity active:scale-[0.98]"
              >
                {parseMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {parseMut.isPending ? "AI 切分抽取中…" : "开始批量解析"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-[11.5px] text-muted-foreground">
              识别 <b className="text-foreground">{rows.length}</b> 家 · 已匹配园区主体 <b className="text-foreground">{parseMut.data?.matched ?? 0}</b> 家 ·
              勾选后可修正写入目标；未匹配行请手动选择目标企业或取消勾选
            </div>
            <div className="space-y-2.5">
              {rows.map((r, i) => {
                const nonEmpty = FIELD_KEYS.filter((k) => r.parsed[k] != null && r.parsed[k] !== "");
                return (
                  <div key={i} className={`rounded-md border px-3 py-2.5 ${checked[i] && targets[i] ? "border-primary/40 bg-primary/[0.05]" : "border-border bg-card/40"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!checked[i]}
                        onChange={(e) => setChecked((p) => ({ ...p, [i]: e.target.checked }))}
                        className="accent-[var(--primary)] w-4 h-4"
                      />
                      <span className="text-[12.5px] font-medium text-foreground">{r.parsedName}</span>
                      <span className={`rounded-sm px-1.5 py-px text-[10px] font-medium ${r.exact ? "bg-emerald-500/15 text-emerald-500" : r.eid ? "bg-amber-500/15 text-amber-500" : "bg-secondary text-muted-foreground"}`}>
                        {r.exact ? "精确匹配" : r.eid ? "模糊匹配" : "未匹配"}
                      </span>
                      <span className={`text-[10.5px] ${r.parsed.confidence === "高" ? "text-emerald-500" : r.parsed.confidence === "中" ? "text-amber-500" : "text-primary"}`}>
                        置信度{r.parsed.confidence}
                      </span>
                      <select
                        value={targets[i] ?? ""}
                        onChange={(e) => setTargets((p) => ({ ...p, [i]: e.target.value }))}
                        className="ml-auto max-w-full sm:max-w-[260px] rounded border border-border bg-background px-2 py-1.5 text-[11.5px] text-foreground focus:outline-none focus:border-primary/60"
                      >
                        <option value="">— 选择写入目标企业 —</option>
                        {entityOptions.map((o) => (
                          <option key={o.eid} value={o.eid}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-1.5 pl-6 text-[11px] text-muted-foreground truncate">
                      抽取到 {nonEmpty.length} 个字段：{nonEmpty.slice(0, 6).map((k) => `${k}=${String(r.parsed[k])}`).join(" · ")}{nonEmpty.length > 6 ? " …" : ""}
                    </div>
                    {r.parsed.warnings.length > 0 && (
                      <div className="mt-1 pl-6 text-[10.5px] text-amber-500/90">疑点：{r.parsed.warnings.join("；")}</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-2 sm:pb-0">
              <button
                onClick={writeIn}
                disabled={importMut.isPending || pickedCount === 0}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-[12.5px] font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity active:scale-[0.98]"
              >
                {importMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                核对无误 · 一并写入 {pickedCount} 家并复算
              </button>
              <button
                onClick={() => { parseMut.reset(); setTargets({}); setChecked({}); }}
                className="ml-auto text-[11.5px] text-muted-foreground/70 hover:text-foreground"
              >
                重新粘贴解析
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
