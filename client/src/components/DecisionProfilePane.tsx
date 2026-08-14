/* 迭代13 · 企业决策画像面板（EntityDrawer 决策 Tab 内嵌）：
   需求画布（7维星级+依据）+ 生命周期阶段徽章 + 该企业决策清单（含资源匹配）。
   数据全部来自 park.decision.entityProfile（后端决策引擎推断，可解释）。 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useMaskStore } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, ChevronUp, Loader2, Star } from "lucide-react";

const NEED_COLOR: Record<string, string> = {
  talent: "#C8102E", funding: "#D97706", policy: "#0E9F6E", market: "#3B82F6",
  rnd: "#7C6BD6", digital: "#0891B2", legal: "#6B7280",
};
const STATUS_ZH: Record<string, string> = {
  suggested: "待采纳", adopted: "已采纳", executing: "执行中", done: "已完成", dismissed: "已放弃",
};

export default function DecisionProfilePane({ eid }: { eid: string }) {
  const mask = useMaskStore((s) => s.mask);
  const { lang } = useI18n();
  const zh = lang === "zh";
  const [openNeed, setOpenNeed] = useState<string | null>(null);
  const { data, isLoading } = trpc.park.decision.entityProfile.useQuery({ eid, mask }, { staleTime: 15_000 });

  if (isLoading) return <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-2"><Loader2 className="w-3.5 h-3.5 animate-spin" />{zh ? "决策画像加载中…" : "Loading…"}</div>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* 生命周期阶段 */}
      <div className="rounded-md border border-border bg-secondary/40 px-3.5 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-bold text-foreground font-serif-sc tracking-wide">{zh ? "生命周期阶段" : "Lifecycle"}</span>
          <span className="rounded bg-primary/15 text-primary px-2 py-0.5 text-[11.5px] font-medium">{data.lifecycle.phase}</span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{data.lifecycle.basis.join("；")}</p>
      </div>

      {/* 需求画布 */}
      <div>
        <h3 className="font-serif-sc font-bold text-[13px] text-foreground mb-2 tracking-wide">
          {zh ? "需求画布" : "Need Canvas"} <span className="text-muted-foreground font-normal text-[10.5px]">{zh ? "信号×富集×阶段先验推断 · 点击看依据" : "Inferred · click for basis"}</span>
        </h3>
        <div className="space-y-1.5">
          {data.canvas.map((c) => (
            <div key={c.tag}>
              <button onClick={() => setOpenNeed(openNeed === c.tag ? null : c.tag)} className="w-full flex items-center gap-2.5 text-left">
                <span className="w-12 flex-none text-[11.5px] text-muted-foreground">{c.label}</span>
                <span className="inline-flex items-center gap-0.5 flex-none">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-3 h-3" style={i <= c.stars ? { fill: NEED_COLOR[c.tag], color: NEED_COLOR[c.tag] } : { color: "var(--border)" }} />
                  ))}
                </span>
                <span className="flex-1" />
                {openNeed === c.tag ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
              </button>
              {openNeed === c.tag && (
                <ul className="mt-1 mb-1.5 ml-14 space-y-0.5">
                  {c.basis.map((b, i) => (
                    <li key={i} className="text-[10.5px] text-muted-foreground flex gap-1"><span className="text-primary/70">▸</span>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {data.canvas.length === 0 && <p className="text-[11px] text-muted-foreground">{zh ? "暂无可推断需求（信号与富集数据不足）" : "No inferable needs yet"}</p>}
        </div>
      </div>

      {/* 决策清单 */}
      {data.decisions.length > 0 && (
        <div>
          <h3 className="font-serif-sc font-bold text-[13px] text-foreground mb-2 tracking-wide">
            {zh ? "决策清单" : "Decisions"} <span className="text-muted-foreground font-normal text-[10.5px]">{zh ? "由决策引擎生成 · 到决策中心流转" : "Manage in Decision Center"}</span>
          </h3>
          <div className="space-y-1.5">
            {data.decisions.map((d) => (
              <div key={d.id} className="rounded-sm border border-border/70 bg-card/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-medium text-foreground truncate">
                    <span className="rounded bg-primary/10 text-primary px-1 py-px text-[10px] mr-1.5">{d.label}</span>
                    {d.title}
                  </span>
                  <span className="flex-none text-[10.5px] text-muted-foreground">{"★".repeat(d.stars)} · {STATUS_ZH[d.status] ?? d.status}</span>
                </div>
                {d.matches.length > 0 && (
                  <div className="mt-1 text-[10.5px] text-muted-foreground truncate" title={d.matches.map((m) => `${m.rtypeLabel}·${m.name}(${m.score})`).join(" / ")}>
                    {zh ? "匹配资源：" : "Matched: "}{d.matches.map((m) => m.name).join("、")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
