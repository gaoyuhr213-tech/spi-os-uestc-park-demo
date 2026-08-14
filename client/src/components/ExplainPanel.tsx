/* 迭代9 · 可解释性七问视图（提示词强制规范：每条推荐必须能回答"为什么"）
   数据全部来自 park.explain（后端组装，零新数据源），前端仅渲染。
   七问：① 依据 ② 证据 ③ 信号 ④ 关系 ⑤ 时间线 ⑥ 模型逻辑 ⑦ 置信度 */
import { trpc } from "@/lib/trpc";
import { useMaskStore } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { Loader2, HelpCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const CONF_COLOR: Record<string, string> = { 高: "var(--stage-won)", 中: "var(--tier-p1)", 低: "var(--tier-p2)" };

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-dashed border-border/70 pb-3">
      <h4 className="flex items-center gap-1.5 font-serif-sc font-bold text-[12.5px] text-foreground mb-1.5">
        <span className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full border border-primary/50 text-primary text-[10px] font-mono-num flex-none" style={{ width: 18, height: 18 }}>{num}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}

export function ExplainBody({ eid }: { eid: string }) {
  const mask = useMaskStore((s) => s.mask);
  const { t: tr } = useI18n();
  const { data: v, isLoading } = trpc.park.explain.useQuery({ eid, mask });
  if (isLoading || !v) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground text-[12px]">
        <Loader2 className="w-4 h-4 animate-spin" /> 后端规则引擎组装解释链…
      </div>
    );
  }
  const ev = v.evidence;
  return (
    <div className="space-y-3.5">
      {/* ① 依据 */}
      <Section num="①" title={tr("exBasis")}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12px]">
          <span className="font-mono-num font-extrabold text-[22px] text-foreground">{v.basis.score}<span className="text-[12px] opacity-60">/100</span></span>
          <span className="font-bold" style={{ color: `var(--tier-${v.basis.tier.toLowerCase()}, var(--foreground))` }}>{v.basis.tier}</span>
          {v.basis.rank && <span className="text-muted-foreground">雷达排名 <b className="text-foreground font-mono-num">#{v.basis.rank}</b></span>}
          <span className="text-muted-foreground">管道匹配 <b className="text-foreground font-mono-num">{v.basis.pipeMatch}</b></span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">NBA：{v.basis.nba}</p>
      </Section>
      {/* ② 证据 */}
      <Section num="②" title={tr("exEvidence")}>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono-num">
          <span className="text-muted-foreground">基线 <b className="text-foreground">{ev.baseScore}</b></span>
          <span className="text-muted-foreground">富集 <b style={{ color: ev.enrichDelta > 0 ? "var(--stage-won)" : "var(--muted-foreground)" }}>{ev.enrichDelta >= 0 ? `+${ev.enrichDelta}` : ev.enrichDelta}</b></span>
          <span className="text-muted-foreground">信号 <b style={{ color: ev.signalBonus > 0 ? "var(--stage-won)" : "var(--muted-foreground)" }}>+{ev.signalBonus}</b></span>
          {ev.riskPenalty > 0 && <span className="text-muted-foreground">风险 <b style={{ color: "var(--tier-p0)" }}>-{ev.riskPenalty}</b></span>}
          <span className="text-muted-foreground">= <b className="text-foreground">{v.basis.score}</b></span>
        </div>
        {ev.fields.length > 0 ? (
          <div className="mt-1.5 space-y-1">
            {ev.fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="w-16 flex-none text-muted-foreground">{f.label}</span>
                <span className="flex-1 text-foreground font-medium truncate">{f.value}</span>
                <span className={`flex-none text-[10px] ${f.verified === "已核验" ? "text-emerald-600" : "text-amber-600"}`}>{f.verified}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground/70">无富集证据 · 仅名录期基线评估，建议先做情报回填。</p>
        )}
      </Section>
      {/* ③ 信号 */}
      <Section num="③" title={tr("exSignals")}>
        {v.signals.length > 0 ? (
          <div className="space-y-1">
            {v.signals.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono-num text-muted-foreground flex-none">{s.date}</span>
                <span className="flex-1 text-foreground truncate">{s.text}</span>
                <span className="flex-none font-mono-num text-[10px] text-muted-foreground">T{s.tier}</span>
                <span className="flex-none w-14 text-right font-mono-num text-[10px]" style={{ color: s.fresh ? "var(--stage-won)" : "var(--tier-p2)" }}>
                  {s.fresh ? "新鲜" : "衰减"} {s.decayPct}%
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/70">无活跃信号。</p>
        )}
      </Section>
      {/* ④ 关系 */}
      <Section num="④" title={tr("exRelations")}>
        <p className="text-[11.5px] text-foreground">
          暖引荐路径：<b>{v.relations.pathLabel}</b>{v.relations.path ? `（${v.relations.path}）` : ""}
          {v.relations.entryPoint && <span className="text-muted-foreground"> · 切入点：{v.relations.entryPoint}</span>}
        </p>
      </Section>
      {/* ⑤ 时间线 */}
      <Section num="⑤" title={tr("exTimeline")}>
        {v.timeline.length > 0 ? (
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {v.timeline.map((h, i) => (
              <div key={i} className="text-[10.5px] text-muted-foreground font-mono-num">
                {new Date(h.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                <span className="ml-2 text-foreground">{h.event}</span>
                {h.actor && <span className="ml-2 opacity-70">{h.actor}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/70">尚无触达事件 · 首触后此处形成因果时间线。</p>
        )}
      </Section>
      {/* ⑥ 模型逻辑 */}
      <Section num="⑥" title={tr("exModel")}>
        <div className="text-[11px] text-muted-foreground leading-relaxed space-y-0.5">
          <p>{v.model.engine} · 12 维权重（{v.model.dimsCount} 维）+ 富集/信号修正</p>
          <p className="font-mono-num">阈值 P0≥{v.model.thresholds.p0Min} / P1≥{v.model.thresholds.p1Min} / P2≥{v.model.thresholds.p2Min}</p>
          <p>{v.model.decay} · {v.model.riskCap}</p>
        </div>
      </Section>
      {/* ⑦ 置信度 */}
      <section>
        <h4 className="flex items-center gap-1.5 font-serif-sc font-bold text-[12.5px] text-foreground mb-1.5">
          <span className="inline-flex items-center justify-center rounded-full border border-primary/50 text-primary text-[10px] font-mono-num flex-none" style={{ width: 18, height: 18 }}>⑦</span>
          {tr("exConfidence")}
          <span className="ml-1 rounded-full px-2 py-px text-[10.5px] font-bold text-white" style={{ background: CONF_COLOR[v.confidence.level] }}>
            {v.confidence.level} · {v.confidence.pct}%
          </span>
        </h4>
        <ul className="text-[11px] text-muted-foreground space-y-0.5">
          {v.confidence.reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5"><span className="flex-none opacity-50">·</span>{r}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** 独立弹层版：屏二作战名单「为什么」按钮打开 */
export default function ExplainSheet({ eid, name, open, onClose }: { eid: string | null; name?: string; open: boolean; onClose: () => void }) {
  const { t: tr } = useI18n();
  return (
    <Sheet open={open && !!eid} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto bg-card border-border">
        {/* 迭代15 · 与 EntityDrawer 同规格加固：标题/副行严格分行，块级文档流 */}
        <SheetHeader className="flex flex-col gap-1 pb-1">
          <SheetTitle className="block font-serif-sc text-[15px] leading-snug text-foreground pr-8 break-words">
            <HelpCircle className="inline-block w-4 h-4 text-primary mr-1.5 align-[-2px]" />
            {tr("whyTitle")}{name ? ` · ${name}` : ""}
          </SheetTitle>
          <p className="text-[10.5px] leading-relaxed text-muted-foreground">七问解释链 · 后端规则引擎实时组装 · 依据可核验</p>
        </SheetHeader>
        <div className="px-4 pb-8">{eid && <ExplainBody eid={eid} />}</div>
      </SheetContent>
    </Sheet>
  );
}
