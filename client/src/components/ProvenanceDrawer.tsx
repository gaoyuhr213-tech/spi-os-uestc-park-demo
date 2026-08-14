/* 迭代23 · 工单12 · 溯源钻取抽屉
 * 从任一信号出发，逐跳钻取：signal → connector → ingestionJob 原始证据。
 * - 每跳一张卡，点击展开该跳的完整证据 JSON（可核验，不摘要美化）
 * - 未命中连接器批次时明示「实勘/手工来源」（不伪造）
 * - 动画仅 opacity/transform 且受 prefers-reduced-motion 约束（motion-reduce:transition-none）
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Radio, Plug, Database, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const LAYER_META: Record<string, { icon: typeof Radio; zh: string; en: string }> = {
  signal: { icon: Radio, zh: "信号层", en: "Signal" },
  connector: { icon: Plug, zh: "连接器层", en: "Connector" },
  ingestionJob: { icon: Database, zh: "摄入批次层", en: "Ingestion Job" },
};

export default function ProvenanceDrawer({ eid, signalText, onClose }: {
  eid: string | null;
  signalText: string | null;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const open = !!eid && !!signalText;
  const { data, isLoading } = trpc.park.demo.provenance.useQuery(
    { eid: eid ?? "", signalText: signalText ?? "" },
    { enabled: open },
  );
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { onClose(); setExpanded(null); } }}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto bg-card border-border p-0">
        <SheetHeader className="flex-none px-4 pt-4 pb-3 border-b border-border">
          <SheetTitle className="font-serif-sc text-[15px] text-foreground leading-snug">
            {zh ? "溯源钻取 · 这个信号是哪来的？" : "Provenance · Where did this signal come from?"}
          </SheetTitle>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {zh ? "逐跳回溯：信号 → 连接器 → 摄入批次原始证据。每跳可点开完整证据，未命中连接器时明示实勘/手工来源。" : "Hop-by-hop: signal → connector → ingestion job raw evidence."}
          </p>
        </SheetHeader>
        <div className="px-4 py-4">
          {isLoading && (
            <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-6">
              <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />{zh ? "回溯证据链…" : "Tracing…"}
            </div>
          )}
          {data && (
            <div className="space-y-0">
              {!data.found && (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5 flex-none mt-0.5" />
                  {zh ? "该信号未命中连接器摄入批次——来源为楼层索引实勘或手工回填（系统明示，不伪造来源）。" : "No connector batch matched; source is field survey / manual entry (explicitly stated, never fabricated)."}
                </div>
              )}
              {data.hops.map((h, i) => {
                const meta = LAYER_META[h.layer] ?? LAYER_META.signal;
                const Icon = meta.icon;
                const isOpen = expanded === i;
                return (
                  <div key={i} className="relative pl-7 pb-4 last:pb-0">
                    {/* 竖向连线（最后一跳不画） */}
                    {i < data.hops.length - 1 && <span className="absolute left-[9px] top-6 bottom-0 w-px bg-border" aria-hidden />}
                    <span className="absolute left-0 top-0.5 w-[19px] h-[19px] rounded-full bg-secondary border border-border inline-flex items-center justify-center">
                      <Icon className="w-3 h-3 text-foreground" />
                    </span>
                    <button
                      onClick={() => setExpanded(isOpen ? null : i)}
                      className="w-full text-left rounded-md border border-border bg-background/60 px-3 py-2.5 hover:bg-secondary/50 transition-colors duration-150 motion-reduce:transition-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono-num uppercase tracking-wider text-muted-foreground">{zh ? meta.zh : meta.en}</span>
                        {isOpen ? <ChevronUp className="w-3.5 h-3.5 ml-auto text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto text-muted-foreground" />}
                      </div>
                      <div className="mt-0.5 text-[13px] font-medium text-foreground leading-snug">{h.title}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground leading-relaxed">{h.summary}</div>
                      {isOpen && (
                        <pre className="mt-2 rounded-sm bg-secondary/60 border border-border px-2.5 py-2 text-[10.5px] leading-relaxed text-foreground/90 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(h.detail, null, 2)}
                        </pre>
                      )}
                    </button>
                  </div>
                );
              })}
              <p className="pt-3 text-[10px] text-muted-foreground/70 leading-relaxed border-t border-border/60 mt-2">
                {zh
                  ? "证据链口径：信号存于企业主体信号轴（entities.signalsJson）；连接器摄入必留 ingestionJob 痕（行数/触发人/时间）；ACL 防腐层为唯一入库通道（工单1/3 验收口径）。"
                  : "Signals live on the entity axis; every connector ingest leaves an ingestionJob trace; the ACL layer is the only write path."}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
