/* 企业情报半自动解析填充（迭代7）
   工作流：用户粘贴企查查/天眼查公开页面文本 → 后端 LLM 结构化抽取（对齐回填模板字段）
   → 逐字段预览核对（可勾选取舍）→ 写入情报档案（走 importEnrichment 通道，自动复算联动雷达）
   合规：仅解析用户手动粘贴的公开文本；系统不访问外部网站、不调用第三方 API。 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ClipboardPaste, Copy, Loader2, ShieldCheck, Sparkles, Check } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const FIELD_LABELS: Record<string, string> = {
  uscc: "统一社会信用代码", regCapital: "注册资本", founded: "成立年份/日期", insured: "参保人数",
  legalRep: "法定代表人", jobs: "在招岗位数", topJobs: "核心在招岗位", salaryRange: "薪资区间",
  patents: "专利数", softCopyrights: "软著数", hiTech: "高企资质", funding: "融资/股改",
};
const FIELD_KEYS = Object.keys(FIELD_LABELS);

export default function IntelParseDialog({
  eid, name, open, onClose,
}: { eid: string; name: string; open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  /** 本次写入的字段清单（分享卡片用；ref 避免 onSuccess 闭包取旧值） */
  const writtenFieldsRef = useRef<string[]>([]);
  const utils = trpc.useUtils();

  const parseMut = trpc.park.ai.parseIntel.useMutation({
    onSuccess: (d) => {
      // 默认勾选全部非空字段
      const init: Record<string, boolean> = {};
      FIELD_KEYS.forEach((k) => { init[k] = (d.parsed as Record<string, unknown>)[k] != null && (d.parsed as Record<string, unknown>)[k] !== ""; });
      setPicked(init);
    },
    onError: (e) => toast.error(`解析失败：${e.message}`),
  });

  const importMut = trpc.park.importEnrichment.useMutation({
    onSuccess: (d) => {
      if (d.ok > 0) {
        utils.park.snapshot.invalidate();
        utils.park.tasks.invalidate();
        utils.park.parseHistory.list.invalidate({ eid });
        utils.park.parseHistory.fieldSources.invalidate({ eid });
        // 迭代12 · 解析完成后提供企微/飞书分享卡片入口（一键复制到群）
        const written = writtenFieldsRef.current;
        toast.success("已写入情报档案，Lead 评分已复算，雷达排序已联动更新", {
          duration: 8000,
          action: {
            label: "复制分享卡片",
            onClick: () => {
              shareMut.mutate(
                { eid, scene: "parse", mask: false, fieldsWritten: written },
                {
                  onSuccess: async (card) => {
                    try {
                      await navigator.clipboard.writeText(card.text);
                      toast.success("分享卡片已复制，可直接粘贴到企业微信 / 飞书群");
                    } catch { toast.error("复制失败，请重试"); }
                  },
                  onError: (e) => toast.error(`生成失败：${e.message}`),
                },
              );
            },
          },
        });
        onClose();
        setText(""); parseMut.reset();
      } else {
        toast.error(`写入未成功：${d.report[0]?.suggestion ?? "请检查数据"}`);
      }
    },
    onError: (e) => toast.error(`写入失败：${e.message}`),
  });
  const shareMut = trpc.park.shareCard.useMutation();

  const parsed = parseMut.data?.parsed;

  const writeIn = () => {
    if (!parsed) return;
    const row: Record<string, unknown> = { eid };
    FIELD_KEYS.forEach((k) => {
      if (picked[k]) {
        const v = (parsed as Record<string, unknown>)[k];
        if (v != null && v !== "") row[k] = v;
      }
    });
    if (Object.keys(row).length <= 1) { toast.error("请至少勾选一个字段"); return; }
    row.verified = "待核验"; // AI 解析结果一律待人工核验
    row.remark = "AI解析填充（用户粘贴公开工商文本）";
    // 迭代12 · 溯源元信息：来源=单家 AI 解析 + 原文快照 + 置信度（后端落 parseHistory）
    row._source = "ai_parse";
    row._rawText = text.slice(0, 20000);
    row._confidence = String((parsed as Record<string, unknown>).confidence ?? "");
    writtenFieldsRef.current = Object.keys(row).filter((k) => !["eid", "verified", "remark", "_source", "_rawText", "_confidence"].includes(k));
    importMut.mutate({ rows: [row as never] });
  };

  const copyTsv = async () => {
    if (!parseMut.data?.tsv) return;
    try {
      await navigator.clipboard.writeText(parseMut.data.tsv);
      toast.success("Excel 数据片段已复制，可直接粘贴到回填模板对应行");
    } catch { toast.error("复制失败，请手动复制"); }
  };

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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] sm:w-auto h-[100dvh] sm:h-auto sm:max-h-[85vh] overflow-y-auto bg-card border-border rounded-none sm:rounded-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="font-serif-sc text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI 解析填充 · {name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldCheck className="w-4 h-4 flex-none text-emerald-500 mt-0.5" />
          <span>
            <b className="text-foreground">合规边界：</b>仅解析你手动粘贴的公开工商信息文本（企查查/天眼查等公开页面）。
            系统不访问外部网站、不做爬虫、不调用第三方 API；解析结果一律标记「待核验」，写入前请人工核对。
          </span>
        </div>

        {!parsed ? (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={9}
              placeholder={`在企查查/天眼查打开「${name}」的公开页面，全选复制页面文本后粘贴到这里…\n（支持工商信息、参保人数、在招岗位、知识产权等版块的混合文本）`}
              className="w-full rounded-md border border-border bg-background px-3 py-2.5 text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={pasteFromClipboard}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[11.5px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors active:scale-[0.98]"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" /> 从剪贴板粘贴
                </button>
                <span className="text-[10.5px] text-muted-foreground">{text.length} 字 · 至少 30 字</span>
              </div>
              <button
                onClick={() => parseMut.mutate({ eid, text })}
                disabled={text.trim().length < 30 || parseMut.isPending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity active:scale-[0.98]"
              >
                {parseMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {parseMut.isPending ? "AI 抽取中…" : "开始解析"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[11.5px]">
              <span className="text-muted-foreground">抽取置信度：</span>
              <span className={`font-bold ${parsed.confidence === "高" ? "text-emerald-500" : parsed.confidence === "中" ? "text-amber-500" : "text-primary"}`}>{parsed.confidence}</span>
              <span className="text-muted-foreground/60">· 勾选需要写入的字段（默认全选非空项）</span>
            </div>
            {parsed.warnings.length > 0 && (
              <div className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-[11px] text-muted-foreground space-y-0.5">
                <b className="text-amber-500">需人工核验的疑点：</b>
                {parsed.warnings.map((w, i) => <div key={i}>· {w}</div>)}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {FIELD_KEYS.map((k) => {
                const v = (parsed as Record<string, unknown>)[k];
                const empty = v == null || v === "";
                return (
                  <label key={k} className={`flex items-center gap-2 border-b border-dashed border-border/60 pb-1.5 text-[11.5px] ${empty ? "opacity-45" : "cursor-pointer"}`}>
                    <input
                      type="checkbox"
                      disabled={empty}
                      checked={!!picked[k]}
                      onChange={(e) => setPicked((p) => ({ ...p, [k]: e.target.checked }))}
                      className="accent-[var(--primary)]"
                    />
                    <span className="text-muted-foreground flex-none">{FIELD_LABELS[k]}</span>
                    <span className="ml-auto text-right font-medium text-foreground truncate max-w-[55%]">{empty ? "未抽取到" : String(v)}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                onClick={writeIn}
                disabled={importMut.isPending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity active:scale-[0.98]"
              >
                {importMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                核对无误 · 写入档案并复算评分
              </button>
              <button
                onClick={copyTsv}
                className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors active:scale-[0.98]"
              >
                <Copy className="w-3.5 h-3.5" /> 复制 Excel 数据片段
              </button>
              <button
                onClick={() => { parseMut.reset(); setPicked({}); }}
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
