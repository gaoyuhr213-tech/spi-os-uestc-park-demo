/* V3 波次二 · Scenario OS 首页：场景即 Decision Workspace
   对标：Palantir Foundry Workspace / ServiceNow Workspaces。
   每个场景卡回答一个核心决策问题；点击进入 Workspace（决策队列+资源+需求侧写）。 */
import { useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import EntityDrawer from "@/components/EntityDrawer";
import { trpc } from "@/lib/trpc";
import { useMaskStore, useSnapshot, type ParkItem } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { Link } from "wouter";
import { ArrowRight, ChevronLeft, Loader2, Bot, Boxes, Star } from "lucide-react";

const SCN_COLOR: Record<string, string> = {
  attract: "#C8102E", cultivate: "#0E9F6E", talent: "#D97706", fund: "#3B82F6",
  lowaltitude: "#8B5CF6", coldchain: "#0891B2", crossborder: "#64748B",
};

export default function Scenarios() {
  const { lang, t } = useI18n();
  const zh = lang === "zh";
  const mask = useMaskStore((s) => s.mask);
  const [sid, setSid] = useState<string | null>(null);
  const [sel, setSel] = useState<ParkItem | null>(null);
  const { leads } = useSnapshot();
  const { data: board, isLoading } = trpc.park.decision.scenarios.useQuery({ mask }, { staleTime: 15_000 });
  const { data: ws, isLoading: wsLoading } = trpc.park.decision.scenarioWorkspace.useQuery(
    { sid: sid ?? "", mask }, { enabled: !!sid, staleTime: 15_000 },
  );
  const pick = (eid: string) => {
    const e = leads.find((x: ParkItem) => x.eid === eid);
    if (e) setSel(e);
  };

  return (
    <ScreenLayout>
      <div className="px-6 md:px-10 pt-8 pb-10">
        <ScreenHeader
          num={zh ? "中枢" : "OS"}
          title={zh ? "场景中枢 · Scenario OS" : "Scenario OS"}
          desc={zh ? "场景即决策工作区：每个场景回答一个核心决策问题，聚合决策队列 / 匹配资源 / 需求侧写 / 负责 Agent。Dashboard 是视图，Scenario 才是入口。" : "Each scenario is a decision workspace."}
          right={
            <Link href="/decision" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              {zh ? "决策中心" : "Decision Center"} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        />

        {isLoading && <div className="mt-10 flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{zh ? "加载场景…" : "Loading…"}</div>}

        {!sid && board && (
          <>
            <div className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-4">
              {board.filter((s) => !s.extensible).map((s) => (
                <button
                  key={s.sid}
                  onClick={() => setSid(s.sid)}
                  className="text-left rounded-md border border-border bg-card/60 p-5 hover:border-primary/40 hover:bg-accent/40 transition-colors duration-150 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: SCN_COLOR[s.sid] }} />
                      <span className="font-serif-sc font-bold text-[16px] text-foreground">{s.name}</span>
                      <span className="text-[10px] tracking-widest text-muted-foreground/70 uppercase hidden md:block">{s.nameEn}</span>
                    </div>
                    <span className={`flex-none rounded px-2 py-0.5 text-[10.5px] font-medium ${s.active ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>
                      {s.active ? (zh ? "运行中" : "Active") : (zh ? "待激活" : "Pending")}
                    </span>
                  </div>
                  <div className="mt-2 text-[12.5px] font-medium text-foreground leading-snug">{zh ? "核心决策：" : "Decision: "}{s.decisionQuestion}</div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground">{s.tagline}</div>
                  <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2">
                    {([
                      [s.kpi.entities, zh ? "在场企业" : "Entities"],
                      [s.kpi.pendingDecisions, zh ? "待采纳决策" : "Pending"],
                      [s.kpi.executing, zh ? "执行中" : "Executing"],
                      [s.kpi.won, zh ? "已成交" : "Won"],
                    ] as Array<[number, string]>).map(([v, l]) => (
                      <span key={l}>
                        <span className="font-mono-num font-extrabold text-[19px] leading-none text-foreground">{v}</span>
                        <span className="block mt-0.5 text-[10px] text-muted-foreground">{l}</span>
                      </span>
                    ))}
                    <span className="ml-auto self-end text-[10.5px] text-muted-foreground/70 hidden lg:flex items-center gap-1"><Bot className="w-3 h-3" />{s.agents.slice(0, 2).join(" · ")}{s.agents.length > 2 ? ` +${s.agents.length - 2}` : ""}</span>
                  </div>
                  {s.topEntities.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-border/60 flex flex-wrap gap-1.5">
                      {s.topEntities.map((e2) => (
                        <span key={e2.eid} className="rounded-sm bg-secondary/70 px-2 py-0.5 text-[10.5px] text-muted-foreground">
                          {e2.name} <span className="font-mono-num text-foreground">{e2.score}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
            {/* 扩展位 */}
            <div className="mt-5">
              <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Boxes className="w-3 h-3" />{zh ? "场景扩展位（Scenario Package · 数据接入即激活）" : "Extensible scenarios"}</div>
              <div className="flex flex-wrap gap-2">
                {board.filter((s) => s.extensible).map((s) => (
                  <span key={s.sid} className="rounded-md border border-dashed border-border px-3 py-2 text-[11.5px] text-muted-foreground">
                    {s.name} <span className="text-[10px] opacity-70">{s.nameEn}</span>
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] text-muted-foreground/70 leading-relaxed max-w-2xl">
                {zh ? "场景由「需求标签 × 行业 × 意图 × 决策类型」定义，可打包复制到其他园区（Scenario Package，Marketplace 商品形态之一）。当前 4 个开箱场景基于 69 家真实主体自动聚合，扩展位数据接入后自动激活。" : ""}
              </p>
            </div>
          </>
        )}

        {/* 单场景 Workspace */}
        {sid && (
          <div className="mt-6">
            <button onClick={() => setSid(null)} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-3.5 h-3.5" />{zh ? "返回场景中枢" : "Back"}
            </button>
            {wsLoading && <div className="mt-6 flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{zh ? "构建工作区…" : "Loading…"}</div>}
            {ws && (
              <div className="mt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="w-3 h-3 rounded-full" style={{ background: SCN_COLOR[ws.sid] }} />
                  <h2 className="font-serif-sc font-bold text-[20px] text-foreground">{ws.name} · Decision Workspace</h2>
                  <span className="text-[11px] text-muted-foreground">{ws.decisionQuestion}</span>
                </div>
                <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
                  {/* 决策队列 */}
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{zh ? `场景决策队列（${ws.decisionQueue.length}）· 点击企业看 360` : "Decision queue"}</div>
                    <div className="space-y-2">
                      {ws.decisionQueue.length === 0 && <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[12px] text-muted-foreground">{zh ? "队列为空 — 到决策中心点「生成今日决策」" : "Empty"}</div>}
                      {ws.decisionQueue.map((d) => (
                        <button key={d.id} onClick={() => pick(d.eid)} className="w-full text-left rounded-md border border-border bg-card/60 px-3.5 py-2.5 hover:border-primary/40 transition-colors duration-150 active:scale-[0.995]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] font-medium text-foreground">{d.name}</span>
                            <span className="rounded bg-primary/10 text-primary px-1.5 py-px text-[10px] font-medium">{d.dtypeLabel}</span>
                            <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-500"><Star className="w-3 h-3 fill-current" />{d.stars}</span>
                            <span className="ml-auto text-[10.5px] text-muted-foreground">{d.status === "suggested" ? (zh ? "待采纳" : "Suggested") : d.status === "adopted" ? (zh ? "已采纳" : "Adopted") : (zh ? "执行中" : "Executing")}{d.assignee ? ` · ${d.assignee}` : ""}</span>
                          </div>
                          <div className="mt-0.5 text-[11.5px] text-muted-foreground leading-snug">{d.title}</div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 text-[11px] text-muted-foreground">
                      <Link href="/decision" className="text-primary hover:underline">{zh ? "→ 到决策中心采纳/指派/回填结果（九要素溯源）" : "→ Decision Center"}</Link>
                    </div>
                  </div>
                  {/* 右栏：需求侧写 + 资源 + Agent */}
                  <aside className="space-y-5 min-w-0">
                    <div>
                      <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{zh ? "场景需求侧写（均值星级）" : "Need profile"}</div>
                      <div className="space-y-1.5">
                        {ws.needProfile.map((n) => (
                          <div key={n.tag} className="flex items-center gap-2">
                            <span className="w-12 flex-none text-[11px] text-muted-foreground">{n.label}</span>
                            <div className="flex-1 h-2 rounded-sm bg-secondary/70 overflow-hidden">
                              <div className="h-full rounded-sm" style={{ width: `${(n.avgStars / 5) * 100}%`, background: SCN_COLOR[ws.sid], opacity: 0.8 }} />
                            </div>
                            <span className="font-mono-num text-[11px] text-foreground w-7 text-right">{n.avgStars}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-2">{zh ? "场景资源池" : "Resources"}</div>
                      <div className="space-y-1.5">
                        {ws.matchedResources.map((r) => (
                          <div key={r.id} className="rounded-sm border border-border/70 bg-secondary/40 px-2.5 py-1.5 text-[11px] text-foreground flex items-center justify-between gap-2">
                            <span className="truncate">{r.name}</span>
                            <span className="flex-none text-[10px] text-muted-foreground">{zh ? `容量 ${r.capacity}` : `cap ${r.capacity}`}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Bot className="w-3 h-3" />{zh ? "负责 Agent" : "Agents"}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {ws.agents.map((a) => (
                          <span key={a} className="rounded-sm bg-secondary/70 px-2 py-0.5 text-[10.5px] text-muted-foreground">{a}</span>
                        ))}
                      </div>
                    </div>
                  </aside>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <EntityDrawer entity={sel} onClose={() => setSel(null)} />
    </ScreenLayout>
  );
}
