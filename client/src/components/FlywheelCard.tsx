/* 迭代11 · 学习飞轮卡片（规则中心）：命中统计 + 校准建议 + 一键应用（带影响预览） + 连接器状态。
   人在环：建议 patch 需管理员确认影响预览后才落库。 */
import { trpc } from "@/lib/trpc";
import { Loader2, RefreshCcw, Zap, PlugZap, CircleDashed } from "lucide-react";

export default function FlywheelCard({ onApply }: {
  /** 把建议 patch 交给 Rules 页现有的 preview→save 流程 */
  onApply: (action: "signalBoost" | "tiering", patch: Record<string, number>) => void;
}) {
  const { data, isLoading, refetch, isRefetching } = trpc.park.flywheel.useQuery({ mask: false }, { retry: false });
  const { data: connectors } = trpc.park.predict.connectors.useQuery(undefined, { retry: false });

  return (
    <section className="rounded-md border border-border bg-card/60 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide inline-flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary/80" /> 学习飞轮 · 模型校准
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">成交/流失结果回填 → 命中统计 → 校准建议 · 建议需经影响预览确认后生效（人在环）</p>
        </div>
        <button onClick={() => refetch()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]">
          {isRefetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCcw className="w-3 h-3" />} 重新统计
        </button>
      </div>

      {isLoading || !data ? (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> 正在统计…</div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* 命中统计 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ["结果样本", `${data.sample.won + data.sample.lost}`, `成交 ${data.sample.won} · 流失/回退 ${data.sample.lost}`],
              ["成交中高价值占比", data.hit.wonHighTierRate != null ? `${data.hit.wonHighTierRate}%` : "—", "模型召回质量"],
              ["成交均分 / 高价值均分", data.hit.wonAvgScore != null ? `${data.hit.wonAvgScore} / ${data.hit.allHvAvgScore}` : `— / ${data.hit.allHvAvgScore}`, "评分与结果一致性"],
              ["流失中 P0 占比", data.hit.lostP0Rate != null ? `${data.hit.lostP0Rate}%` : "—", "高分误判信号"],
            ].map(([k, v, sub]) => (
              <div key={k as string} className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
                <div className="text-[10.5px] text-muted-foreground">{k}</div>
                <div className="font-mono-num font-bold text-[17px] text-foreground mt-0.5">{v}</div>
                <div className="text-[10px] text-muted-foreground/70">{sub}</div>
              </div>
            ))}
          </div>

          {/* 结果回填明细 */}
          {data.outcomes.length > 0 && (
            <div>
              <div className="text-[11.5px] font-medium text-foreground mb-1.5">结果回填明细（最近 {data.outcomes.length} 条）</div>
              <div className="space-y-1">
                {data.outcomes.map((o) => (
                  <div key={`${o.eid}-${o.at}`} className="flex items-center gap-2.5 text-[11.5px] rounded-sm border border-border/60 bg-secondary/20 px-2.5 py-1.5">
                    <span className="font-mono-num text-muted-foreground">{o.at}</span>
                    <span className="text-foreground truncate flex-1">{o.name}</span>
                    <span className="font-mono-num text-muted-foreground">{o.tier}/{o.score}</span>
                    <span className={`font-medium ${o.result === "成交" ? "text-[var(--stage-won,#0E9F6E)]" : "text-[var(--tier-p0,#C8102E)]"}`}>{o.result}</span>
                    {o.reason && <span className="text-muted-foreground/80 truncate max-w-[160px]">{o.reason}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 校准建议 */}
          <div>
            <div className="text-[11.5px] font-medium text-foreground mb-1.5">校准建议</div>
            <div className="space-y-2">
              {data.suggestions.map((s) => (
                <div key={s.id} className="rounded-md border border-border/70 bg-secondary/25 px-3 py-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-bold text-foreground">{s.title}</span>
                    <span className={`rounded-sm px-1.5 py-0.5 text-[10px] border ${
                      s.confidence === "高" ? "border-[var(--stage-won,#0E9F6E)]/50 text-[var(--stage-won,#0E9F6E)]"
                      : s.confidence === "中" ? "border-[var(--tier-p1,#D97706)]/50 text-[var(--tier-p1,#D97706)]"
                      : "border-border text-muted-foreground"
                    }`}>置信 {s.confidence}</span>
                    {s.patch && s.action !== "observe" && (
                      <button
                        onClick={() => onApply(s.action as "signalBoost" | "tiering", s.patch!)}
                        className="ml-auto inline-flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-primary/20 transition-colors active:scale-[0.97]"
                      >
                        应用建议（先预览）
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{s.rationale}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10.5px] text-muted-foreground/70">{data.note}</p>
          </div>

          {/* 迭代13 · 决策级学习：哪类决策在实际执行中有效（Outcome Learning） */}
          {data.decisionLearning && data.decisionLearning.byType.length > 0 && (
            <div className="pt-3 border-t border-border/60">
              <div className="text-[11.5px] font-medium text-foreground mb-1.5">决策级学习 · 按类型命中率</div>
              <div className="space-y-1.5">
                {data.decisionLearning.byType.map((t) => (
                  <div key={t.dtype} className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-2.5 py-2">
                    <span className="w-24 flex-none text-[11.5px] font-medium text-foreground">{t.label}</span>
                    <span className="flex-none font-mono-num text-[11px] text-muted-foreground">
                      {t.total}条 · 采纳{t.adopted} · 完成{t.done} · 成{t.won}
                    </span>
                    <span className={`flex-none font-mono-num text-[11.5px] font-bold ${t.winRate != null && t.winRate >= 70 ? "text-[var(--stage-won,#0E9F6E)]" : "text-foreground"}`}>
                      {t.winRate != null ? `${t.winRate}%` : "—"}
                    </span>
                    <span className="flex-1 text-[10.5px] text-muted-foreground truncate" title={t.hint}>{t.hint}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">{data.decisionLearning.note}</p>
            </div>
          )}

          {/* 连接器状态 */}
          {connectors && (
            <div className="pt-3 border-t border-border/60">
              <div className="text-[11.5px] font-medium text-foreground mb-1.5">数据连接器（需求预测数据源）</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {connectors.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 rounded-md border border-border/60 bg-secondary/20 px-2.5 py-2">
                    {c.status === "active"
                      ? <PlugZap className="w-3.5 h-3.5 mt-0.5 text-[var(--stage-won,#0E9F6E)]" />
                      : <CircleDashed className="w-3.5 h-3.5 mt-0.5 text-muted-foreground/60" />}
                    <div className="min-w-0">
                      <div className="text-[11.5px] font-medium text-foreground">
                        {c.name}
                        <span className={`ml-1.5 rounded-sm px-1 py-px text-[9.5px] border ${c.status === "active" ? "border-[var(--stage-won,#0E9F6E)]/50 text-[var(--stage-won,#0E9F6E)]" : "border-border text-muted-foreground"}`}>
                          {c.status === "active" ? "运行中" : "插槽 · 规划"}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{c.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
