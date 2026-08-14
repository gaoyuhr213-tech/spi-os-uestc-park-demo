/* V3 波次三 · 推演中心 Simulation Center
   对标：Palantir Foundry Scenario Simulation。
   左：Graph What-if（引入/流失企业 → 税收/就业/面积/人才/产业链五维传导）
   右：三模拟器（招商 / 政策 / 资源 ROI）。所有系数标注【假设】，接真实数据自动替换。 */
import { useMemo, useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import { trpc } from "@/lib/trpc";
import { useMaskStore, useSnapshot } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { Link } from "wouter";
import { ArrowRight, ArrowUpRight, ArrowDownRight, Loader2, FlaskConical, TrendingUp, Landmark, Boxes } from "lucide-react";

function Delta({ dir }: { dir: "up" | "down" }) {
  return dir === "up"
    ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 flex-none" />
    : <ArrowDownRight className="w-3.5 h-3.5 text-red-500 flex-none" />;
}

export default function Simulation() {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const mask = useMaskStore((s) => s.mask);
  const { leads } = useSnapshot();

  /* What-if */
  const [eid, setEid] = useState("");
  const [action, setAction] = useState<"add" | "remove">("remove");
  const { data: wi, isLoading: wiLoading } = trpc.park.decision.whatIf.useQuery(
    { eid, action, mask }, { enabled: !!eid, staleTime: 30_000 },
  );

  /* Simulators */
  const [simTab, setSimTab] = useState<"attract" | "policy" | "resource">("attract");
  const [ind, setInd] = useState("AI");
  const [n, setN] = useState(5);
  const [size, setSize] = useState(30);
  const [coverage, setCoverage] = useState(60);
  const simInput = useMemo(() => {
    if (simTab === "attract") return { kind: "attract" as const, ind, n, size };
    if (simTab === "policy") return { kind: "policy" as const, coverage };
    return { kind: "resource" as const };
  }, [simTab, ind, n, size, coverage]);
  const { data: sim, isLoading: simLoading } = trpc.park.decision.simulate.useQuery(simInput, { staleTime: 30_000 });

  const inputCls = "rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[12.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <ScreenLayout>
      <div className="px-6 md:px-10 pt-8 pb-12">
        <ScreenHeader
          num={zh ? "推演" : "Sim"}
          title={zh ? "推演中心 · Simulation Center" : "Simulation Center"}
          desc={zh ? "Graph 即计算引擎：What-if 沿产业链与资源网络传导，量化税收 / 就业 / 面积 / 人才 / 产业链五维影响；三个模拟器回答招商、政策、资源的 ROI 问题。全部系数为行业基准演示值【假设】，接入财税/楼宇/社保真实数据后自动替换。" : "Graph as compute engine: what-if propagation + 3 ROI simulators."}
          right={
            <Link href="/decision" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              {zh ? "决策中心" : "Decision Center"} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        />

        <div className="mt-7 grid grid-cols-1 xl:grid-cols-2 gap-8">
          {/* ==== 左：What-if ==== */}
          <section className="min-w-0">
            <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              {zh ? "Graph What-if · 企业进出传导" : "Graph What-if"}
              <span className="text-muted-foreground font-normal text-[11px]">{zh ? "选择企业与动作，五维影响即时计算" : ""}</span>
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <select value={eid} onChange={(e) => setEid(e.target.value)} className={inputCls + " max-w-[260px]"}>
                <option value="">{zh ? "选择企业…" : "Pick a company…"}</option>
                {leads.map((x) => (
                  <option key={x.eid} value={x.eid}>{x.name}（{x.tier}）</option>
                ))}
              </select>
              <div className="flex rounded-md border border-border overflow-hidden">
                {(["remove", "add"] as const).map((a) => (
                  <button key={a} onClick={() => setAction(a)}
                    className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${action === a ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                    {a === "remove" ? (zh ? "流失推演" : "Churn") : (zh ? "引入推演" : "Add")}
                  </button>
                ))}
              </div>
            </div>

            {!eid && (
              <div className="mt-4 rounded-md border border-dashed border-border px-4 py-8 text-center text-[12px] text-muted-foreground">
                {zh ? "从下拉选择任一企业（P0/P1 优先），推演其引入或流失对园区的量化影响" : "Pick a company to run what-if"}
              </div>
            )}
            {wiLoading && eid && <div className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{zh ? "传导计算中…" : "Computing…"}</div>}
            {wi && (
              <div className="mt-4 rounded-md border border-border bg-card/60 p-4">
                <div className="text-[13.5px] font-medium text-foreground">
                  {wi.action === "remove" ? (zh ? "若流失：" : "If churned: ") : (zh ? "若引入：" : "If added: ")}{wi.name}
                  <span className="ml-2 text-[11px] text-muted-foreground">{wi.ind} · {wi.empBasis}</span>
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {wi.effects.map((ef) => (
                    <div key={ef.dim} className="rounded-sm border border-border/70 bg-secondary/40 px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <Delta dir={ef.direction} />
                        <span className="text-[11px] text-muted-foreground">{ef.dim}</span>
                        <span className="ml-auto font-mono-num font-bold text-[13px] text-foreground">{ef.value}</span>
                      </div>
                      <div className="mt-1 text-[10.5px] text-muted-foreground/80 leading-snug">{ef.note}</div>
                    </div>
                  ))}
                </div>
                {wi.chainImpact.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{zh ? "产业链传导明细" : "Chain propagation"}</div>
                    <div className="space-y-1">
                      {wi.chainImpact.map((ci, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11.5px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-none" />
                          <span className="text-foreground">{ci.name}</span>
                          <span className="text-muted-foreground truncate">{ci.note}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="mt-3 pt-2.5 border-t border-border/60 text-[10.5px] text-muted-foreground/70 leading-relaxed">{wi.totalNote}</p>
              </div>
            )}
          </section>

          {/* ==== 右：三模拟器 ==== */}
          <section className="min-w-0">
            <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              {zh ? "ROI 模拟器" : "ROI Simulators"}
            </h2>
            <div className="mt-3 flex rounded-md border border-border overflow-hidden w-fit">
              {([["attract", zh ? "招商模拟" : "Attract", TrendingUp], ["policy", zh ? "政策模拟" : "Policy", Landmark], ["resource", zh ? "资源模拟" : "Resource", Boxes]] as const).map(([k, label, Icon]) => (
                <button key={k} onClick={() => setSimTab(k)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 text-[12px] font-medium transition-colors ${simTab === k ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                  <Icon className="w-3.5 h-3.5" />{label}
                </button>
              ))}
            </div>

            {/* 参数区 */}
            {simTab === "attract" && (
              <div className="mt-3 flex flex-wrap items-center gap-2.5 text-[12px] text-muted-foreground">
                <label>{zh ? "行业" : "Industry"}
                  <select value={ind} onChange={(e) => setInd(e.target.value)} className={inputCls + " ml-1.5"}>
                    {["AI", "软件", "芯片", "通信", "新能源", "检测", "企服"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label>{zh ? "数量" : "Count"}
                  <input type="number" min={1} max={50} value={n} onChange={(e) => setN(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className={inputCls + " ml-1.5 w-16"} />
                </label>
                <label>{zh ? "平均规模(人)" : "Avg size"}
                  <input type="number" min={5} max={500} value={size} onChange={(e) => setSize(Math.max(5, Math.min(500, Number(e.target.value) || 5)))} className={inputCls + " ml-1.5 w-20"} />
                </label>
              </div>
            )}
            {simTab === "policy" && (
              <div className="mt-3 flex items-center gap-3 text-[12px] text-muted-foreground">
                <label className="flex items-center gap-2">{zh ? "辅导覆盖率" : "Coverage"}
                  <input type="range" min={10} max={100} step={10} value={coverage} onChange={(e) => setCoverage(Number(e.target.value))} className="w-40 accent-[var(--primary)]" />
                  <span className="font-mono-num font-bold text-foreground">{coverage}%</span>
                </label>
              </div>
            )}

            {simLoading && <div className="mt-4 flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{zh ? "模拟中…" : "Simulating…"}</div>}
            {sim && (
              <div className="mt-4 rounded-md border border-border bg-card/60 p-4">
                <div className="text-[13.5px] font-medium text-foreground">{sim.title}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {sim.inputs.map((it) => <span key={it.label}>{it.label}：<span className="text-foreground">{it.value}</span></span>)}
                </div>
                <div className="mt-3 space-y-2">
                  {sim.outputs.map((o) => (
                    <div key={o.label} className="flex items-start gap-3 rounded-sm border border-border/70 bg-secondary/40 px-3 py-2">
                      <span className="w-28 flex-none text-[11px] text-muted-foreground pt-0.5">{o.label}</span>
                      <span className="font-mono-num font-bold text-[13.5px] text-foreground">{o.value}</span>
                      <span className="ml-auto text-right text-[10.5px] text-muted-foreground/80 max-w-[45%] leading-snug">{o.note}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{zh ? "落地节奏" : "Timeline"}</div>
                    <div className="space-y-1">
                      {sim.timeline.map((tl) => (
                        <div key={tl.period} className="text-[11.5px]"><span className="font-mono-num text-primary">{tl.period}</span> <span className="text-muted-foreground">{tl.text}</span></div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{zh ? "风险提示" : "Risks"}</div>
                    <ul className="space-y-1 text-[11.5px] text-muted-foreground list-disc list-inside">
                      {sim.risks.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  </div>
                </div>
                <p className="mt-3 pt-2.5 border-t border-border/60 text-[10.5px] text-muted-foreground/70">{sim.assumption}</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </ScreenLayout>
  );
}
