/* 屏二 · P0/P1 线索雷达（后端计算版）：
   - 数据全部来自 park.snapshot（评分/排序/漏斗后端输出）
   - 散点按线索生命周期状态分色（未触达/已触达/已约见/已成交）
   - 90 天转化漏斗看板 + Excel 情报导入入口 */
import { useEffect, useMemo, useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import EntityDrawer, { TierTag, StageTag } from "@/components/EntityDrawer";
import ImportDialog from "@/components/ImportDialog";
import IntelBatchDialog from "@/components/IntelBatchDialog";
import ExplainSheet from "@/components/ExplainPanel";
import LedgerNote from "@/components/LedgerNote";
import PredictPanel from "@/components/PredictPanel";
import { useSnapshot, ParkItem, TIER_COLOR, STAGE_COLOR, nba, alpha, useHighlightStore, IntentBadge } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { downloadXlsx } from "@/lib/exportXlsx";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useMaskStore } from "@/lib/park";
import { toast } from "sonner";
import { Link } from "wouter";
import { ArrowRight, Radio, Download, FileSpreadsheet, Loader2, Filter, Sparkles, HelpCircle } from "lucide-react";

export default function Radar() {
  const { t } = useI18n();
  const [sel, setSel] = useState<ParkItem | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [why, setWhy] = useState<{ eid: string; name: string } | null>(null);
  const [colorMode, setColorMode] = useState<"tier" | "stage">("tier");
  const [exporting, setExporting] = useState(false);
  const { snapshot, leads, isLoading } = useSnapshot();
  const { isAuthenticated } = useAuth();
  const mask = useMaskStore((s) => s.mask);
  const utils = trpc.useUtils();
  const aiHl = useHighlightStore((s) => s.highlights);
  const aiStamp = useHighlightStore((s) => s.stamp);
  const hlSet = useMemo(() => new Set(aiHl.map((h) => h.eid)), [aiHl]);

  /* AI 联动定位：高亮批次更新时滚动到名单中首个高亮企业 */
  useEffect(() => {
    if (!aiStamp || aiHl.length === 0) return;
    const t = setTimeout(() => {
      document.querySelector(`[data-lead-eid="${aiHl[0].eid}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
    return () => clearTimeout(t);
  }, [aiStamp, aiHl]);

  const exportLeads = async () => {
    if (!isAuthenticated) { toast("登录后可导出", { action: { label: "登录", onClick: () => startLogin() } }); return; }
    setExporting(true);
    try {
      const data = await utils.park.exportData.fetch({ kind: "leads", mask });
      if (!data.rows.length) { toast("暂无可导出数据"); return; }
      downloadXlsx(data.rows as Record<string, unknown>[], data.sheet, data.file);
      toast.success(`已导出作战名单 ${data.rows.length} 行`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  // 保持抽屉数据与最新快照同步（导入/标记后自动刷新）
  const selLive = useMemo(() => (sel ? leads.find((x) => x.eid === sel.eid) ?? sel : null), [sel, leads]);

  // 雷达散点坐标：x=管道匹配度(后端) y=Lead评分(后端)；仅做视觉防重叠，无业务计算
  const pts = useMemo(() => {
    const raw = leads.map((x) => ({
      x,
      px: ((x.pipeMatch - 22) / 80) * 100,
      py: 100 - ((x.score - 52) / 44) * 100,
    }));
    for (let iter = 0; iter < 60; iter++) {
      for (let i = 0; i < raw.length; i++) {
        for (let j = i + 1; j < raw.length; j++) {
          const a = raw[i], b = raw[j];
          const dx = b.px - a.px, dy = b.py - a.py;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const min = 6.5;
          if (dist < min) {
            const push = (min - dist) / 2;
            const ux = dx / dist, uy = dy / dist;
            a.px -= ux * push; a.py -= uy * push;
            b.px += ux * push; b.py += uy * push;
          }
        }
      }
    }
    raw.forEach((p) => {
      p.px = Math.max(4, Math.min(98, p.px));
      p.py = Math.max(3, Math.min(90, p.py));
    });
    return raw;
  }, [leads]);

  const p0 = leads.filter((x) => x.tier === "P0");
  const p1 = leads.filter((x) => x.tier === "P1");
  const golden = leads.filter((x) => x.pipeMatch >= 62 && x.score >= 74).length;
  const funnel = snapshot?.funnel;

  const dotColor = (x: ParkItem) => (colorMode === "tier" ? TIER_COLOR[x.tier] : STAGE_COLOR[x.stage]);

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
      <div className="px-4 sm:px-6 lg:px-10 pt-6 lg:pt-9 pb-8 border-b border-border">
        <ScreenHeader
          num={t("numRadar")}
          title={t("s2Title")}
          desc={t("s2Desc")}
          right={
            <div className="flex items-center gap-4">
              <button
                onClick={exportLeads}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} {t("exportLeads")}
              </button>
              <button
                onClick={() => setImportOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-primary/20 transition-colors active:scale-[0.97]"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-primary" /> {t("importIntel")}
              </button>
              <button
                onClick={() => setBatchOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors active:scale-[0.97]"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" /> {t("batchParse")}
              </button>
              <Link href="/referral" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                {t("nextScreen")} · {t("navReferral")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          }
        />
      </div>

      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-9">
        {/* 雷达散点区 */}
        <section className="min-w-0">
          {/* 分色切换 */}
          <div className="mb-2.5 flex items-center gap-2 text-[11px]">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{t("colorBy")}</span>
            {([["tier", t("byTier")], ["stage", t("byStage")]] as const).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setColorMode(m)}
                className={`rounded-full border px-2.5 py-0.5 transition-colors ${
                  colorMode === m ? "border-primary/60 bg-primary/15 text-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative rounded-md border border-border bg-card/50 aspect-[4/3] overflow-hidden">
            <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle, var(--scatter-grid) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-border/70" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-border/70" />
            <div className="absolute right-3 top-2.5 text-[11px] font-serif-sc font-bold text-primary/90">{t("goldenQuadrant")}</div>
            <div className="absolute left-3 top-2.5 text-[11px] font-serif-sc text-muted-foreground/70">{t("highScoreWait")}</div>
            <div className="absolute left-3 bottom-2.5 text-[11px] font-serif-sc text-muted-foreground/70">{t("watchPool")}</div>
            {pts.map(({ x, px, py }) => {
              const isP0 = x.tier === "P0";
              const active = hover === x.eid;
              const c = dotColor(x);
              return (
                <button
                  key={x.eid}
                  onClick={() => setSel(x)}
                  onMouseEnter={() => setHover(x.eid)}
                  onMouseLeave={() => setHover(null)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 group ${hlSet.has(x.eid) ? "ai-highlight !rounded-full" : ""}`}
                  style={{ left: `${6 + px * 0.88}%`, top: `${8 + py * 0.82}%`, zIndex: active ? 30 : isP0 ? 20 : 10 }}
                >
                  <span
                    className="block rounded-full border-2 transition-transform duration-150 group-hover:scale-125"
                    style={{ width: isP0 ? 22 : 14, height: isP0 ? 22 : 14, background: alpha(c, 0.8), borderColor: c }}
                  />
                  {x.signals.some((s) => s.tier === 1) && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-[1.5px] border-primary bg-background" />
                  )}
                  <span
                    className={`absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap text-[10.5px] px-1.5 py-0.5 rounded bg-popover border border-border transition-opacity duration-100 pointer-events-none z-40 ${
                      active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    {x.name.replace(/(有限公司|股份有限公司|有限责任公司)$/, "").replace(/^(成都|四川|北京|中国)/, "")}
                    <b className="ml-1 font-mono-num" style={{ color: TIER_COLOR[x.tier] }}>{x.score}</b>
                    <span className="ml-1" style={{ color: STAGE_COLOR[x.stage] }}>{x.stage}</span>
                  </span>
                </button>
              );
            })}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] tracking-widest text-muted-foreground/60">{t("axisX")}</div>
            <div className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] tracking-widest text-muted-foreground/60" style={{ writingMode: "vertical-rl" }}>Lead 评分 →</div>
          </div>
          {/* 作战批注条 */}
          <div className="mt-3 rounded-sm border border-border/80 bg-card/60 px-3.5 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <span className="font-serif-sc font-bold text-[11.5px] text-foreground tracking-wide">{t("battleNote")}</span>
            {[
              ["黄金象限目标", `${golden} 家`],
              ["P0 立即触达", `${p0.length} 家`],
              ["P1 重点培育", `${p1.length} 家`],
              ["带 Tier-1 信号", `${leads.filter((x) => x.signals.some((s) => s.tier === 1)).length} 家`],
            ].map(([k, v]) => (
              <span key={k} className="text-[11px] text-muted-foreground">
                {k} <b className="font-mono-num text-foreground">{v}</b>
              </span>
            ))}
            <span className="font-serif-sc text-[11px] text-primary/90">批示：黄金象限先打，7 日内完成首轮约见。</span>
          </div>
          {/* 图例（跟随分色模式） */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
            {colorMode === "tier" ? (
              <>
                <span className="inline-flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border-2" style={{ background: alpha("var(--tier-p0)", 0.8), borderColor: "var(--tier-p0)" }} /> P0 立即触达（{p0.length}）</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-2" style={{ background: alpha("var(--tier-p1)", 0.8), borderColor: "var(--tier-p1)" }} /> P1 重点培育（{p1.length}）</span>
              </>
            ) : (
              (["未触达", "已触达", "已约见", "已成交"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border-2" style={{ background: alpha(STAGE_COLOR[s], 0.8), borderColor: STAGE_COLOR[s] }} /> {s}（{funnel?.counts[s] ?? 0}）
                </span>
              ))
            )}
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full border-[1.5px] border-primary bg-transparent" /> 带 Tier-1 关键信号（红环）</span>
          </div>
          {/* 90 天转化漏斗 */}
          {funnel && (
            <div className="mt-5 rounded-md border border-border bg-card/60 px-4 py-3.5">
              <h3 className="font-serif-sc font-bold text-[13px] text-foreground tracking-wide">
                {t("funnelTitle")} <span className="text-muted-foreground font-normal text-[11px]">{t("funnelSub")}</span>
              </h3>
              <div className="mt-3 flex items-end gap-1.5">
                {(["未触达", "已触达", "已约见", "已成交"] as const).map((s, i) => {
                  const v = funnel.counts[s];
                  const w = funnel.total ? Math.max(8, (v / funnel.total) * 100) : 8;
                  return (
                    <div key={s} className="flex-1 min-w-0">
                      <div className="text-[11px] text-muted-foreground mb-1 flex items-center justify-between">
                        <span>{s}</span>
                        <b className="font-mono-num text-foreground">{v}</b>
                      </div>
                      <div className="h-7 rounded-sm bg-secondary/60 overflow-hidden">
                        <div className="h-full rounded-sm grow-bar" style={{ width: `${w}%`, background: STAGE_COLOR[s], animationDelay: `${i * 60}ms` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
                <span>{t("touchRate")} <b className="font-mono-num text-foreground">{funnel.reachRate}%</b></span>
                <span>触达→约见 <b className="font-mono-num text-foreground">{funnel.meetRate}%</b></span>
                <span>约见→成交 <b className="font-mono-num text-foreground">{funnel.winRate}%</b></span>
            <span className="font-serif-sc text-primary/90">{t("funnelGoal")}</span>
              </div>
            </div>
          )}
          <LedgerNote extra="信软管道匹配度与 Lead 评分均由后端规则引擎（v1）输出；散点分色可切换优先级/触达状态双视图。" />
        </section>

        {/* 作战名单 */}
        <section className="min-w-0">
          <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide mb-3 flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" /> {t("todayRoster")} <span className="text-muted-foreground font-normal text-[11px]">{t("rosterSub")}</span>
          </h2>
          <div className="space-y-2 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
            {leads.map((x, i) => (
              <button
                key={x.eid}
                data-lead-eid={x.eid}
                onClick={() => setSel(x)}
                className={`w-full text-left rounded-md border px-3.5 py-2.5 transition-colors duration-150 active:scale-[0.99] ${hlSet.has(x.eid) ? "ai-highlight " : ""}${
                  x.tier === "P0" ? "border-primary/40 bg-primary/[0.07] hover:bg-primary/[0.13]" : "border-border bg-card/50 hover:bg-accent"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono-num text-[11px] w-5 text-muted-foreground/70">{String(i + 1).padStart(2, "0")}</span>
                  <TierTag tier={x.tier} small />
                  <span className="text-[13px] font-medium text-foreground truncate flex-1">{x.name}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setWhy({ eid: x.eid, name: x.name }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setWhy({ eid: x.eid, name: x.name }); } }}
                    className="flex-none inline-flex items-center gap-0.5 rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
                    title={t("whyTitle")}
                  >
                    <HelpCircle className="w-3 h-3" /> {t("whyBtn")}
                  </span>
                  <StageTag stage={x.stage} small />
                  <span className="font-mono-num font-bold text-[15px]" style={{ color: TIER_COLOR[x.tier] }}>
                    {x.score}
                    {x.enriched && <sup className="text-[9px] text-emerald-500 ml-0.5">富</sup>}
                  </span>
                </div>
                <div className="mt-1 pl-7 text-[11px] text-muted-foreground truncate">
                  {x.floor} · {x.ind} · 招聘{x.hiring}
                  {x.signals.length > 0 && <span style={{ color: "var(--signal-soft)" }}> · {x.signals.map((s) => s.t).join(" / ")}</span>}
                </div>
                {x.intents && x.intents.length > 0 && (
                  <div className="mt-1 pl-7 flex flex-wrap gap-1">
                    {x.intents.map((it) => <IntentBadge key={it.tag} intent={it} small />)}
                  </div>
                )}
                {x.tier === "P0" && (
                  <div className="mt-1.5 pl-7 text-[11px] text-muted-foreground/90 leading-relaxed">
                    <b className="text-foreground/80">NBA：</b>
                    {(x as { nba?: string }).nba ?? nba(x.tier)}
                  </div>
                )}
              </button>
            ))}
          </div>
          {/* 迭代11 · 需求预测（连接器驱动，可解释） */}
          <PredictPanel onSelect={(eid) => { const hit = leads.find((x) => x.eid === eid); if (hit) setSel(hit); }} />
        </section>
      </div>

      <EntityDrawer entity={selLive} onClose={() => setSel(null)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <IntelBatchDialog open={batchOpen} onClose={() => setBatchOpen(false)} />
      <ExplainSheet eid={why?.eid ?? null} name={why?.name} open={!!why} onClose={() => setWhy(null)} />
    </ScreenLayout>
  );
}
