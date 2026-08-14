/* 迭代26 · 工单16 · ROI 归因看板
 * 投入 vs 回款按 revenueTier 拆分、月度趋势、漏斗、一键导出 CSV、数字可点溯源回 decision
 */
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Loader2, Download, TrendingUp, Layers, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const TIER_LABEL: Record<string, string> = { micro: "<1万", small: "1-10万", mid: "10-50万", large: ">50万" };
const TIER_COLOR: Record<string, string> = { micro: "#8496B4", small: "#D97706", mid: "#0E9F6E", large: "#C8102E" };

function exportCsv(records: Array<Record<string, unknown>>) {
  if (records.length === 0) { toast.info("暂无成交数据可导出"); return; }
  const keys = Object.keys(records[0]);
  const csv = [keys.join(","), ...records.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `spi-os-roi-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  toast.success("CSV 已导出");
}

export default function ROI() {
  const { isAuthenticated, loading } = useAuth();
  const { lang } = useI18n();
  const zh = lang === "zh";
  const { data, isLoading } = trpc.park.attribution.useQuery(undefined, { enabled: isAuthenticated });

  if (!loading && !isAuthenticated) {
    return (
      <ScreenLayout>
        <div className="px-10 py-16 text-center">
          <TrendingUp className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-[13px] text-muted-foreground">{zh ? "ROI 看板需登录后访问" : "Login required"}</p>
          <Button className="mt-4" onClick={() => startLogin()}>{zh ? "登录" : "Sign in"}</Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <div className="px-10 pt-9 pb-8">
        <ScreenHeader
          num={zh ? "ROI" : "ROI"}
          title={zh ? "决策归因 · ROI 看板" : "Decision Attribution · ROI"}
          desc={zh
            ? "每一笔成交是怎么来的？决策→信号→触点→连接器摄入全链归因。数字可点溯源回决策详情。"
            : "Full-chain attribution: decision → signal → touchpoint → connector ingestion. Click numbers to trace back."}
          right={
            <Link href="/decision" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              {zh ? "决策中心" : "Decision Center"} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        />

        {isLoading && <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{zh ? "加载归因数据…" : "Loading…"}</div>}

        {data && (
          <>
            {/* KPI 行 */}
            <div className="mt-7 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl">
              <div>
                <div className="font-mono-num font-extrabold text-[32px] leading-none text-foreground">
                  {data.totalAmount >= 10000 ? `${(data.totalAmount / 10000).toFixed(1)}` : data.totalAmount}
                  <span className="text-[15px] ml-0.5 opacity-70">{data.totalAmount >= 10000 ? (zh ? "万元" : "×10k") : (zh ? "元" : "CNY")}</span>
                </div>
                <div className="mt-1.5 text-[12px] text-muted-foreground">{zh ? "累计成交额" : "Total Revenue"}</div>
              </div>
              <div>
                <div className="font-mono-num font-extrabold text-[32px] leading-none" style={{ color: "#0E9F6E" }}>{data.totalDeals}</div>
                <div className="mt-1.5 text-[12px] text-muted-foreground">{zh ? "成交笔数" : "Deals Won"}</div>
              </div>
              <div>
                <div className="font-mono-num font-extrabold text-[32px] leading-none" style={{ color: "#D97706" }}>{data.avgDaysToClose}<span className="text-[15px] ml-0.5 opacity-70">{zh ? "天" : "d"}</span></div>
                <div className="mt-1.5 text-[12px] text-muted-foreground">{zh ? "平均成交周期" : "Avg Days to Close"}</div>
              </div>
              <div>
                <button onClick={() => exportCsv(data.records as never[])} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]">
                  <Download className="w-3.5 h-3.5" />{zh ? "导出 CSV" : "Export CSV"}
                </button>
              </div>
            </div>

            {/* revenueTier 拆分 */}
            <section className="mt-8">
              <h2 className="font-serif-sc font-bold text-[15px] text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />{zh ? "按金额档位拆分" : "By Revenue Tier"}
              </h2>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["large", "mid", "small", "micro"] as const).map((t) => {
                  const d = data.byTier.find((b) => b.tier === t);
                  return (
                    <div key={t} className="rounded-md border border-border bg-card/60 p-3.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: TIER_COLOR[t] }} />
                        <span className="text-[12px] font-medium text-foreground">{TIER_LABEL[t]}</span>
                      </div>
                      <div className="mt-2 font-mono-num font-bold text-[20px] text-foreground">
                        {d ? (d.amount >= 10000 ? `${(d.amount / 10000).toFixed(1)}万` : `${d.amount}元`) : "—"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {d ? `${d.count} 笔 · 均 ${d.avgDays} 天` : "暂无"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 月度趋势 */}
            {data.trend.length > 0 && (
              <section className="mt-8">
                <h2 className="font-serif-sc font-bold text-[15px] text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" />{zh ? "月度趋势" : "Monthly Trend"}
                </h2>
                <div className="mt-3 flex items-end gap-2 h-[100px]">
                  {data.trend.map((t) => {
                    const max = Math.max(...data.trend.map((x) => x.amount), 1);
                    return (
                      <div key={t.month} className="flex-1 flex flex-col items-center gap-1">
                        <span className="font-mono-num text-[10px] text-muted-foreground">{t.amount >= 10000 ? `${(t.amount / 10000).toFixed(0)}万` : t.amount}</span>
                        <div className="w-full rounded-sm bg-primary/80" style={{ height: `${Math.max(8, (t.amount / max) * 70)}px` }} />
                        <span className="text-[9px] text-muted-foreground">{t.month.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 归因明细表（可点溯源） */}
            <section className="mt-8">
              <h2 className="font-serif-sc font-bold text-[15px] text-foreground mb-3">{zh ? "归因明细（点击金额溯源回决策）" : "Attribution Detail"}</h2>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border bg-secondary/30">
                      <th className="py-2 px-3">{zh ? "企业" : "Company"}</th>
                      <th className="py-2 px-3">{zh ? "决策类型" : "Type"}</th>
                      <th className="py-2 px-3">{zh ? "金额" : "Amount"}</th>
                      <th className="py-2 px-3">{zh ? "档位" : "Tier"}</th>
                      <th className="py-2 px-3">{zh ? "周期" : "Days"}</th>
                      <th className="py-2 px-3">{zh ? "归因信号" : "Signals"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records.map((r) => (
                      <tr key={r.decisionId} className="border-b border-border/50 hover:bg-secondary/20">
                        <td className="py-2 px-3 font-medium text-foreground">{r.companyName}</td>
                        <td className="py-2 px-3 text-muted-foreground">{r.dtype}</td>
                        <td className="py-2 px-3 font-mono-num font-bold text-foreground cursor-pointer hover:text-primary" title={`Decision #${r.decisionId}`}>
                          {r.dealAmount >= 10000 ? `${(r.dealAmount / 10000).toFixed(1)}万` : `${r.dealAmount}元`}
                        </td>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center gap-1">
                            <span className="w-2 h-2 rounded-[2px]" style={{ background: TIER_COLOR[r.revenueTier] }} />
                            {TIER_LABEL[r.revenueTier]}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono-num text-muted-foreground">{r.daysToClose}d</td>
                        <td className="py-2 px-3 text-muted-foreground max-w-[200px] truncate" title={r.signals.join(" / ")}>{r.signals.slice(0, 2).join(" / ") || "—"}</td>
                      </tr>
                    ))}
                    {data.records.length === 0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">{zh ? "暂无成交归因数据——决策完成并回填金额后自动生成" : "No attribution data yet"}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </ScreenLayout>
  );
}
