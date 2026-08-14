/* 屏一 · 园区健康看板（后端计算版）：所有 KPI/分布/信号均来自 park.snapshot。
   指挥中枢风格：深藏青底 / 成电红信号 / 宋体标题 / 等宽数字。 */
import { useEffect, useMemo, useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import EntityDrawer, { TierTag } from "@/components/EntityDrawer";
import LedgerNote from "@/components/LedgerNote";
import { useSnapshot, ParkItem, TIER_COLOR, alpha } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { Link } from "wouter";
import { ArrowRight, Loader2 } from "lucide-react";

const HERO_BG = "/manus-storage/hero-tower-bg_ca757e57.png";

function useCountUp(target: number, duration = 700) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function Kpi({ value, suffix, label, note, accent }: { value: number; suffix?: string; label: string; note: string; accent?: string }) {
  const v = useCountUp(value);
  return (
    <div className="fade-up">
      <div className="font-mono-num font-extrabold text-[40px] leading-none" style={{ color: accent || "var(--foreground)" }}>
        {v}
        {suffix && <span className="text-[20px] font-bold ml-0.5 opacity-70">{suffix}</span>}
      </div>
      <div className="mt-2 text-[13px] font-medium text-foreground">{label}</div>
      <div className="text-[11px] text-muted-foreground">{note}</div>
    </div>
  );
}

function BarRow({ name, value, max, color, delay }: { name: string; value: number; max: number; color: string; delay: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 flex-none text-right text-[12px] text-muted-foreground">{name}</span>
      <div className="flex-1 h-5 rounded-sm bg-secondary/70 overflow-hidden">
        <div
          className="h-full rounded-sm grow-bar"
          style={{ width: `${(value / max) * 100}%`, background: color, animationDelay: `${delay}ms` }}
        />
      </div>
      <span className="w-8 flex-none font-mono-num font-bold text-[13px] text-foreground">{value}</span>
    </div>
  );
}

export default function Home() {
  const [sel, setSel] = useState<ParkItem | null>(null);
  const { snapshot, items, isLoading } = useSnapshot();
  const { t, lang } = useI18n();
  const kpis = snapshot?.kpis;

  const selLive = useMemo(() => (sel ? items.find((x) => x.eid === sel.eid) ?? sel : null), [sel, items]);

  const tierDist = useMemo(() => {
    const c: Record<string, number> = { P0: 0, P1: 0, P2: 0, N: 0 };
    items.forEach((x) => {
      if (c[x.tier] !== undefined) c[x.tier]++;
    });
    return c;
  }, [items]);

  const indDist = useMemo(() => {
    const c: Record<string, number> = {};
    items.forEach((x) => {
      c[x.ind] = (c[x.ind] || 0) + 1;
    });
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const floors = useMemo(() => {
    const order = ["13F", "12F", "11F", "10F", "9F", "8F", "7F", "6F", "5F", "4F", "3F", "2F", "1F"];
    return order.map((f) => ({
      f,
      items: items.filter((x) => x.floor.split("/").includes(f)),
    }));
  }, [items]);

  const t1Signals = useMemo(
    () =>
      items.flatMap((x) => x.signals.filter((s) => s.tier === 1).map((s) => ({ x, s }))).sort((a, b) =>
        b.s.d.localeCompare(a.s.d),
      ),
    [items],
  );

  const maxInd = indDist[0]?.[1] || 1;

  if (isLoading && !snapshot) {
    return (
      <ScreenLayout>
        <div className="flex items-center justify-center h-[70vh] text-muted-foreground gap-2 text-[13px]">
          <Loader2 className="w-5 h-5 animate-spin" /> {t("loading")}
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      {/* Hero 区 */}
      <section
        className="relative border-b border-border"
        style={{
          backgroundImage: `linear-gradient(90deg, ${alpha("var(--hero-overlay)", 0.97)} 30%, ${alpha("var(--hero-overlay)", 0.72)}), url(${HERO_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center right",
        }}
      >
        <div className="px-4 sm:px-6 lg:px-10 pt-6 lg:pt-9 pb-8">
          <ScreenHeader
            num={t("numHome")}
            title={t("s1Title")}
            desc={t("s1Desc")}
            right={
              <Link
                href="/radar"
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("nextScreen")} · {t("navRadar")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            }
          />
          <div className="mt-9 grid grid-cols-2 md:grid-cols-5 gap-x-8 gap-y-6 max-w-4xl">
            <Kpi value={kpis?.total ?? 0} label={t("kpiEntities")} note={t("kpiEntitiesNote")} />
            <Kpi value={kpis?.highValue ?? 0} label={t("kpiLeads")} note={`P0 ${kpis?.p0 ?? 0} + P1 ${kpis?.p1 ?? 0}`} accent="var(--tier-p0)" />
            <Kpi value={kpis?.healthIndex ?? 0} suffix="/100" label={t("kpiHealth")} note={t("kpiHealthNote")} accent="var(--tier-op)" />
            <Kpi value={kpis?.matchRate ?? 0} suffix="%" label={t("kpiMatch")} note={t("kpiMatchNote")} accent="var(--tier-p1)" />
            <Kpi value={kpis?.signalCount ?? 0} label={t("kpiSignals")} note={`Tier-1 × ${kpis?.tier1Count ?? 0}`} />
          </div>
        </div>
      </section>

      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-8 min-w-0">
          {/* 优先级分布 */}
          <section>
            <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide mb-1">
              {t("tierDist")} <span className="text-muted-foreground font-normal text-[11px]">{t("tierDistSub")}</span>
            </h2>
            <div className="mt-3 space-y-2.5">
              <BarRow name={t("tierP0")} value={tierDist.P0} max={30} color={TIER_COLOR.P0} delay={0} />
              <BarRow name={t("tierP1")} value={tierDist.P1} max={30} color={TIER_COLOR.P1} delay={60} />
              <BarRow name={t("tierP2")} value={tierDist.P2} max={30} color={TIER_COLOR.P2} delay={120} />
              <BarRow name={t("tierN")} value={tierDist.N} max={30} color={TIER_COLOR.N} delay={180} />
            </div>
          </section>

          {/* 行业分布 */}
          <section>
            <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide mb-1">
              {t("indDist")} <span className="text-muted-foreground font-normal text-[11px]">{t("indDistSub")}</span>
            </h2>
            <div className="mt-3 space-y-2">
              {indDist.map(([name, v], i) => (
                <BarRow
                  key={name}
                  name={name}
                  value={v}
                  max={maxInd}
                  color={["软件", "AI", "芯片", "通信"].includes(name) ? "var(--ind-pipe)" : "var(--ind-other)"}
                  delay={i * 40}
                />
              ))}
            </div>
            <div className="mt-2 text-[10.5px] text-muted-foreground/70">
              <span className="inline-block w-2.5 h-2.5 rounded-[2px] align-[-1px] mr-1.5" style={{ background: "var(--ind-pipe)" }} />
              {t("indLegend")}
            </div>
          </section>

          {/* Tier-1 关键信号 */}
          <section>
            <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide mb-3">
              {t("t1Signals")} <span className="text-muted-foreground font-normal text-[11px]">{t("t1SignalsSub")}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {t1Signals.map(({ x, s }, i) => (
                <button
                  key={`${x.eid}-${i}`}
                  onClick={() => setSel(x)}
                  className="text-left rounded-md border border-primary/35 bg-primary/[0.07] px-3.5 py-2.5 hover:bg-primary/[0.14] transition-colors duration-150 active:scale-[0.98]"
                >
                  <div className="flex items-center gap-2 text-[12.5px]">
                    <span className="font-mono-num text-muted-foreground">{s.d}</span>
                    <TierTag tier={x.tier} small />
                  </div>
                  <div className="mt-1 text-[13px] font-medium text-foreground">{x.name}</div>
                  <div className="text-[12px] font-medium" style={{ color: "var(--signal-text)" }}>{s.t}</div>
                </button>
              ))}
            </div>
            <LedgerNote extra="Tier-1 信号定义：扩张 / 股改 / 异地设点 / 高管招聘等强承诺动作。" />
          </section>
        </div>

        {/* 楼宇堆叠图 */}
        <aside className="min-w-0">
          <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide mb-1">
            {t("floorHeat")} <span className="text-muted-foreground font-normal text-[11px]">{t("floorHeatSub")}</span>
          </h2>
          <div className="mt-3 rounded-md border border-border bg-card/60 p-4 space-y-1">
            {floors.map(({ f, items }) => (
              <div key={f} className="flex items-center gap-2">
                <span className="w-8 flex-none font-mono-num text-[11px] text-muted-foreground text-right">{f}</span>
                <div className="flex-1 flex flex-wrap gap-1 py-0.5">
                  {items.map((x) => (
                    <button
                      key={`${f}-${x.eid}`}
                      title={`${x.name}（${x.tier}）`}
                      onClick={() => setSel(x)}
                      className="w-3.5 h-3.5 rounded-[3px] hover:scale-125 transition-transform duration-100"
                      style={{ background: TIER_COLOR[x.tier] || "var(--tier-support)", opacity: ["P0", "P1", "运营方"].includes(x.tier) ? 1 : 0.45 }}
                    />
                  ))}
                </div>
                <span className="w-5 flex-none font-mono-num text-[11px] text-muted-foreground">{items.length}</span>
              </div>
            ))}
            <div className="pt-3 mt-2 border-t border-border/60 flex flex-wrap gap-x-3 gap-y-1.5 text-[10.5px] text-muted-foreground">
              {(["P0", "P1", "P2", "N", "运营方"] as const).map((t) => (
                <span key={t} className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: TIER_COLOR[t] }} />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/80">
            {lang === "zh"
              ? "每一格为一家入驻主体，按楼层索引实景名录排布；跨楼层企业（中科维讯、智汇广联、锦途教育）在多楼层同时点亮——跨楼层本身即扩张信号。"
              : "Each cell is one tenant, laid out per the floor index. Multi-floor firms (CAS Weixun, Zhihui GL, Jintu Edu) light up on several floors — multi-floor presence itself signals expansion."}
          </p>
        </aside>
      </div>

      <EntityDrawer entity={selLive} onClose={() => setSel(null)} />
    </ScreenLayout>
  );
}
