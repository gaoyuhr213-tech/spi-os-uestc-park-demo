/* 迭代11 · 需求预测面板（屏二）：连接器驱动的 P0/P1 人才需求预测（可解释）。 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useMaskStore } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, ChevronUp, Loader2, Radar as RadarIcon } from "lucide-react";

const W_COLOR: Record<string, string> = {
  "0-30天": "var(--tier-p0, #C8102E)",
  "30-60天": "var(--tier-p1, #D97706)",
  "60-90天": "var(--tier-p2, #8496B4)",
  "待观察": "var(--muted-foreground)",
};

export default function PredictPanel({ onSelect }: { onSelect?: (eid: string) => void }) {
  const mask = useMaskStore((s) => s.mask);
  const { t } = useI18n();
  const { data, isLoading } = trpc.park.predict.list.useQuery({ mask }, { retry: false });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="mt-6">
      <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide mb-1 inline-flex items-center gap-2">
        <RadarIcon className="w-4 h-4 text-primary/80" /> {t("predictTitle")}
        <span className="text-muted-foreground font-normal text-[11px]">{t("predictSub")}</span>
      </h2>
      {isLoading || !data ? (
        <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}</div>
      ) : (
        <div className="mt-2.5 space-y-1.5">
          {data.slice(0, 8).map((p) => (
            <div key={p.eid} className="rounded-md border border-border bg-card/40">
              <button
                onClick={() => setOpen(open === p.eid ? null : p.eid)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-accent/50 transition-colors"
              >
                <span className="rounded-sm px-1.5 py-0.5 text-[10px] font-mono-num font-bold border" style={{ color: W_COLOR[p.window], borderColor: W_COLOR[p.window] }}>{p.window}</span>
                <span className="text-[12.5px] text-foreground truncate flex-1">{p.name}</span>
                <span className="text-[11.5px] text-muted-foreground truncate max-w-[180px] hidden sm:inline">{p.direction}</span>
                <span className="text-[11px] font-medium text-foreground/80">{p.magnitude}</span>
                <span className={`rounded-sm px-1 py-px text-[9.5px] border ${p.confidence === "高" ? "border-[var(--stage-won,#0E9F6E)]/60 text-[var(--stage-won,#0E9F6E)]" : p.confidence === "中" ? "border-[var(--tier-p1,#D97706)]/60 text-[var(--tier-p1,#D97706)]" : "border-border text-muted-foreground"}`}>{t("confidence")}{p.confidence}</span>
                {open === p.eid ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
              {open === p.eid && (
                <div className="px-3 pb-2.5 border-t border-border/60 pt-2">
                  <div className="text-[11px] text-muted-foreground sm:hidden mb-1">{t("predictDirection")}：{p.direction}</div>
                  <ul className="space-y-0.5">
                    {p.basis.map((b, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground leading-relaxed">· {b}</li>
                    ))}
                  </ul>
                  <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] text-muted-foreground/70">{t("predictSource")}：{p.source}</span>
                    {onSelect && (
                      <button onClick={() => onSelect(p.eid)} className="text-[11px] text-primary/90 hover:underline">{t("view360")}</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
