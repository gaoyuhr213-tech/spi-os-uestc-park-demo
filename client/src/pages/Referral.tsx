/* 屏三 · 暖引荐地图（迭代11 · 图数据驱动版）：
   - 节点/边来自 park.graph.get（graphNodes/graphEdges 表，空库自动播种）
   - 点击企业节点 → park.graph.chains 推演从平台出发的可达引荐链路（BFS ≤3 跳）
   - 保留原有 SVG 视觉风格、路径图例高亮、90 天路线图与 P0 顺位 */
import { useMemo, useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import EntityDrawer, { TierTag } from "@/components/EntityDrawer";
import LedgerNote from "@/components/LedgerNote";
import { useSnapshot, ParkItem, PATHS, TIER_COLOR, alpha, useMaskStore } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ArrowRight, Loader2, GitBranch } from "lucide-react";

const NET_BG = "/manus-storage/network-map-texture_e512b8ad.png";

type PathKey = keyof typeof PATHS;

/* 关系图节点布局（百分比坐标）*/
const HUB = { x: 50, y: 46 }; // 园区股份枢纽
const SUPPLY = { x: 14, y: 20 }; // 信软学院
const PLATFORM = { x: 14, y: 72 }; // 高于×感知

function shortName(n: string) {
  return n
    .replace(/(有限公司|股份有限公司|有限责任公司|\(成都\)|（成都）)/g, "")
    .replace(/^(成都|四川|北京|中国)/, "")
    .slice(0, 8);
}

export default function Referral() {
  const [sel, setSel] = useState<ParkItem | null>(null);
  const [activePath, setActivePath] = useState<PathKey | null>(null);
  const [chainTarget, setChainTarget] = useState<string | null>(null);
  const { snapshot, items, isLoading } = useSnapshot();
  const { t } = useI18n();
  const mask = useMaskStore((s) => s.mask);

  /* 迭代11 · 图数据（graphNodes/graphEdges 表驱动） */
  const { data: graph } = trpc.park.graph.get.useQuery({ mask });
  const { data: chainData, isLoading: chainLoading } = trpc.park.graph.chains.useQuery(
    { targetKey: chainTarget ?? "", mask },
    { enabled: !!chainTarget, retry: false },
  );
  /* 迭代20 · 工单6 · PathFinder：Top-3 可信路径（路径分=强度×新近度×意愿） */
  const { data: scoredPaths } = trpc.park.graphIntel.paths.useQuery(
    { targetKey: chainTarget ?? "", mask },
    { enabled: !!chainTarget, retry: false },
  );
  const { data: communities } = trpc.park.graphIntel.communities.useQuery({ mask });
  const { data: similar } = trpc.park.graphIntel.similar.useQuery(
    { eid: chainTarget ?? "", mask },
    { enabled: !!chainTarget && chainTarget.startsWith("E"), retry: false },
  );

  const selLive = useMemo(() => (sel ? items.find((x) => x.eid === sel.eid) ?? sel : null), [sel, items]);

  /* 图节点 → 画布布局：企业节点按其入边 pathTag 分组布点（布局仅是视觉排布，归属/强度来自图数据） */
  const nodes = useMemo(() => {
    if (!graph) return [] as { x: ParkItem; px: number; py: number; p: PathKey; strength: number }[];
    const itemMap = new Map(items.map((x) => [x.eid, x]));
    // 每个企业节点取强度最高的入边确定路径归属与连线强度
    const bestEdge = new Map<string, { p: PathKey; strength: number }>();
    graph.edges.forEach((e) => {
      const tag = (e.pathTag ?? "") as PathKey;
      if (!PATHS[tag]) return;
      for (const end of [e.from, e.to]) {
        if (!itemMap.has(end) || end === "E401") continue;
        const cur = bestEdge.get(end);
        if (!cur || e.strength > cur.strength) bestEdge.set(end, { p: tag, strength: e.strength });
      }
    });
    const byPath: Record<PathKey, { x: ParkItem; strength: number }[]> = { A: [], B: [], C: [], D: [] };
    graph.nodes.forEach((n) => {
      if (n.kind !== "company" || n.key === "E401") return;
      const x = itemMap.get(n.key);
      const be = bestEdge.get(n.key);
      if (!x || !be) return;
      byPath[be.p].push({ x, strength: be.strength });
    });
    byPath.B = byPath.B.filter(({ x }) => x.tier === "P0" || x.tier === "P1").sort((a, b) => b.x.score - a.x.score);
    byPath.A.sort((a, b) => b.x.score - a.x.score);
    const placed: { x: ParkItem; px: number; py: number; p: PathKey; strength: number }[] = [];
    // 路径A：顶部横排（供给端右侧），双行错开
    byPath.A.forEach(({ x, strength }, i) => {
      placed.push({ x, strength, p: "A", px: 34 + i * 8.2, py: i % 2 === 0 ? 8 : 20 });
    });
    // 路径B：右侧竖排两列，列间距加大、行距加大
    byPath.B.forEach(({ x, strength }, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      placed.push({ x, strength, p: "B", px: 72 + col * 17, py: 30 + row * 6.8 });
    });
    // 路径C：底部中右
    byPath.C.forEach(({ x, strength }, i) => {
      placed.push({ x, strength, p: "C", px: 60 + i * 10, py: 90 });
    });
    // 路径D：底部横排双行错开
    byPath.D.forEach(({ x, strength }, i) => {
      placed.push({ x, strength, p: "D", px: 6 + i * 8.8, py: i % 2 === 0 ? 90 : 80 });
    });
    return placed;
  }, [graph, items]);

  const pickCompany = (x: ParkItem) => {
    setSel(x);
    setChainTarget(x.eid);
  };

  const dim = (p: PathKey) => activePath !== null && activePath !== p;

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
          num={t("numReferral")}
          title={t("s3Title")}
          desc={t("s3Desc")}
          right={
            <Link href="/" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              {t("backToS1")} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        />
      </div>

      <div className="px-4 sm:px-6 lg:px-10 py-5 lg:py-7 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-8">
        {/* 关系图 */}
        <section className="min-w-0">
          <div className="overflow-x-auto -mx-1 px-1">
          <div className="min-w-[560px]">
          <div
            className="relative rounded-md border border-border overflow-hidden aspect-[16/11]"
            style={{
              backgroundImage: `linear-gradient(${alpha("var(--hero-overlay)", 0.88)}, ${alpha("var(--hero-overlay)", 0.94)}), url(${NET_BG})`,
              backgroundSize: "cover",
            }}
          >
            {/* 连线层 */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {/* 三边骨架 */}
              <line x1={SUPPLY.x} y1={SUPPLY.y} x2={HUB.x} y2={HUB.y} stroke="var(--tier-p0)" strokeWidth="0.5" strokeDasharray="1.4 1" opacity={activePath && activePath !== "A" ? 0.15 : 0.75} />
              <line x1={PLATFORM.x} y1={PLATFORM.y} x2={HUB.x} y2={HUB.y} stroke="var(--path-d)" strokeWidth="0.5" strokeDasharray="1.4 1" opacity={activePath ? 0.2 : 0.7} />
              <line x1={SUPPLY.x} y1={SUPPLY.y} x2={PLATFORM.x} y2={PLATFORM.y} stroke="var(--tier-p2)" strokeWidth="0.35" strokeDasharray="1 1.2" opacity={activePath ? 0.15 : 0.5} />
              {/* 枢纽 → 各成员 */}
              {nodes.map(({ x, p, px, py, strength }) => (
                <line
                  key={`l-${x.eid}`}
                  x1={p === "A" ? SUPPLY.x : HUB.x}
                  y1={p === "A" ? SUPPLY.y : HUB.y}
                  x2={px}
                  y2={py}
                  stroke={PATHS[p].color}
                  strokeWidth={0.2 + (strength / 100) * 0.35}
                  opacity={dim(p) ? 0.06 : x.tier === "P0" ? 0.8 : 0.4}
                  style={{ transition: "opacity .2s" }}
                />
              ))}
            </svg>

            {/* 供给端 */}
            <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${SUPPLY.x}%`, top: `${SUPPLY.y}%`, opacity: dim("A") ? 0.25 : 1, transition: "opacity .2s" }}>
              <div className="mx-auto w-16 h-16 rounded-full border-2 border-primary bg-primary/15 flex items-center justify-center font-serif-sc font-bold text-[11px] leading-tight text-foreground">供给端<br />信软学院</div>
              <div className="mt-1 text-[10px] text-muted-foreground whitespace-nowrap">实训 / 实习 / 就业管道</div>
            </div>
            {/* 平台 */}
            <div className="absolute -translate-x-1/2 -translate-y-1/2 text-center" style={{ left: `${PLATFORM.x}%`, top: `${PLATFORM.y}%`, opacity: activePath ? 0.35 : 1, transition: "opacity .2s" }}>
              <div className="mx-auto w-16 h-16 rounded-full border-2 flex items-center justify-center font-serif-sc font-bold text-[11px] leading-tight text-foreground" style={{ borderColor: "var(--path-d)", background: alpha("var(--path-d)", 0.15) }}>平台<br />高于×感知</div>
              <div className="mt-1 text-[10px] text-muted-foreground whitespace-nowrap">HR 诊断 + 数据/AI 底座</div>
            </div>
            {/* 枢纽 */}
            <button
              className="absolute -translate-x-1/2 -translate-y-1/2 text-center group"
              style={{ left: `${HUB.x}%`, top: `${HUB.y}%` }}
              onClick={() => {
                const hub = items.find((x) => x.eid === "E401");
                if (hub) setSel(hub);
              }}
            >
              <div className="mx-auto w-20 h-20 rounded-full border-[2.5px] flex items-center justify-center font-serif-sc font-bold text-[12px] leading-tight text-foreground group-hover:scale-105 transition-transform" style={{ borderColor: "var(--tier-op)", background: alpha("var(--tier-op)", 0.2) }}>园区股份<br />枢纽</div>
              <div className="mt-1 text-[10px] whitespace-nowrap font-medium" style={{ color: "var(--tier-op)" }}>签约 = 点火开关 · 官方触达 69 家</div>
            </button>

            {/* 成员节点 */}
            {nodes.map(({ x, p, px, py }) => (
              <button
                key={x.eid}
                onClick={() => pickCompany(x)}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{ left: `${px}%`, top: `${py}%`, opacity: dim(p) ? 0.12 : 1, transition: "opacity .2s", zIndex: x.tier === "P0" ? 20 : 10 }}
              >
                <span
                  className={`block rounded-full border-2 group-hover:scale-125 transition-transform duration-100 ${chainTarget === x.eid ? "ring-2 ring-primary/70 ring-offset-1 ring-offset-transparent" : ""}`}
                  style={{
                    width: x.tier === "P0" ? 15 : 10,
                    height: x.tier === "P0" ? 15 : 10,
                    background: alpha(TIER_COLOR[x.tier] || PATHS[p].color, 0.8),
                    borderColor: PATHS[p].color,
                  }}
                />
                <span
                  className="absolute left-1/2 -translate-x-1/2 top-full mt-0.5 whitespace-nowrap text-[9px] text-muted-foreground group-hover:text-foreground group-hover:z-50"
                  style={{ textShadow: "0 0 3px var(--hero-overlay), 0 1px 3px var(--hero-overlay)" }}
                >
                  {shortName(x.name)}
                </span>
              </button>
            ))}
          </div>
          </div>
          </div>

          {/* 路径图例（可点击高亮） */}
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {(Object.keys(PATHS) as PathKey[]).map((p) => (
              <button
                key={p}
                onClick={() => setActivePath(activePath === p ? null : p)}
                className={`text-left rounded-md border px-3 py-2.5 transition-all duration-150 active:scale-[0.98] ${
                  activePath === p ? "bg-accent" : "bg-card/40 hover:bg-accent/60"
                }`}
                style={{ borderColor: activePath === p ? PATHS[p].color : "var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full flex-none" style={{ background: PATHS[p].color }} />
                  <span className="text-[12px] font-bold text-foreground">{PATHS[p].name}</span>
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground line-clamp-2">{PATHS[p].desc}</p>
              </button>
            ))}
          </div>
          <LedgerNote extra={`关系边基于电子科大系同源、同园官方背书、协会会员、专业服务互荐等公开可核验关系构建。${graph ? `图数据：${graph.nodes.length} 节点 / ${graph.edges.length} 边（graphNodes/graphEdges 表，${t("graphDriven")}）。` : ""}`} />
        </section>

        {/* 右栏：为什么是暖引荐 + 90天路线 */}
        <aside className="min-w-0 space-y-6">
          {/* 迭代11 · 引荐路径推演（图 BFS） */}
          <section className="rounded-md border border-border bg-card/50 px-4 py-3.5">
            <h2 className="font-serif-sc font-bold text-[14px] text-foreground tracking-wide inline-flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-primary/80" /> {t("chainTitle")}
              <span className="text-muted-foreground font-normal text-[10.5px]">{t("chainSub")}</span>
            </h2>
            {!chainTarget ? (
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{t("chainEmpty")}</p>
            ) : chainLoading ? (
              <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("loading")}</div>
            ) : chainData && chainData.chains.length > 0 ? (
              <div className="mt-2.5 space-y-2">
                <div className="text-[11.5px] text-muted-foreground">目标：<b className="text-foreground">{chainData.target}</b> · 可达链路 <b className="font-mono-num text-foreground">{chainData.chains.length}</b> 条</div>
                {/* 工单6 · PathFinder 路径分（优先展示带三分量的评分路径） */}
                {scoredPaths && scoredPaths.paths.length > 0 && (
                  <div className="rounded-md border border-primary/30 bg-primary/[0.05] px-3 py-2">
                    <div className="text-[10.5px] font-medium text-primary/90 mb-1">PathFinder · Top-{scoredPaths.paths.length} 可信路径（路径分 = 强度 × 新近度 × 意愿）</div>
                    {scoredPaths.paths.map((p, i) => (
                      <div key={i} className="py-1 border-t border-border/40 first:border-t-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num text-[10px] text-muted-foreground/70">#{i + 1}</span>
                          <span className="text-[11px] text-foreground leading-snug flex-1">{p.summary}</span>
                          <span className="rounded-sm bg-primary/15 border border-primary/40 px-1.5 py-px text-[10.5px] font-mono-num font-bold text-primary flex-none">{p.pathScore}</span>
                        </div>
                        <div className="mt-0.5 pl-4 text-[10px] text-muted-foreground/75 leading-relaxed">
                          {p.explain.map((ex, j) => <span key={j} className="block">{ex}</span>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {chainData.chains.map((c, i) => (
                  <div key={i} className="rounded-md border border-border/70 bg-secondary/25 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-num text-[10px] text-muted-foreground/70">#{i + 1}</span>
                      <span className="text-[11.5px] font-medium text-foreground leading-snug flex-1">{c.summary}</span>
                      <span className="rounded-sm border border-primary/40 px-1.5 py-px text-[10px] font-mono-num text-primary/90 flex-none">{t("chainStrength")} {c.avgStrength}</span>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {c.hops.map((h, j) => (
                        <div key={j} className="text-[10.5px] text-muted-foreground leading-relaxed">
                          <span className="font-mono-num">{j + 1}.</span> {h.fromLabel} → {h.toLabel}
                          <span className="ml-1 text-muted-foreground/70">[{h.relType} · {h.strength}]</span>
                          {h.evidence && <span className="block pl-4 text-muted-foreground/60">{h.evidence}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[11.5px] text-muted-foreground">该节点暂无 ≤3 跳可达链路。</p>
            )}
            {/* 工单6 · 语义召回：同类企业（打完一家复制打法） */}
            {similar && similar.similar.length > 0 && (
              <div className="mt-3 pt-2.5 border-t border-border/60">
                <div className="text-[11px] font-medium text-foreground mb-1.5">语义召回 · 与「{similar.name}」最相似的企业（复制打法）</div>
                <div className="space-y-1">
                  {similar.similar.slice(0, 3).map((s) => (
                    <div key={s.eid} className="flex items-center gap-2 text-[10.5px]">
                      <span className="font-mono-num text-primary/90 flex-none">{(s.similarity * 100).toFixed(0)}%</span>
                      <span className="text-foreground truncate">{s.name}</span>
                      <span className="text-muted-foreground/70 truncate flex-1">{s.sharedTraits[0] ?? ""}</span>
                      <TierTag tier={s.tier} small />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 工单6 · 社区发现 */}
          {communities && communities.length > 0 && (
            <section className="rounded-md border border-border bg-card/50 px-4 py-3.5">
              <h2 className="font-serif-sc font-bold text-[14px] text-foreground tracking-wide">关系社区 <span className="text-muted-foreground font-normal text-[10.5px]">连通子图 · 锚点命名</span></h2>
              <div className="mt-2 space-y-1.5">
                {communities.slice(0, 3).map((c) => (
                  <div key={c.id} className="text-[11px] leading-relaxed">
                    <span className="text-foreground font-medium">{c.label}</span>
                    <span className="ml-1.5 font-mono-num text-muted-foreground">{c.size} 成员</span>
                    <span className="block text-[10px] text-muted-foreground/70 truncate">锚点：{c.anchor} · {c.memberLabels.filter((l) => !l.includes("平台") && !l.includes("学院")).slice(0, 4).join("、")}…</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-md border px-4 py-3.5" style={{ borderColor: alpha("var(--tier-op)", 0.4), background: alpha("var(--tier-op)", 0.08) }}>
            <h2 className="font-serif-sc font-bold text-[14px] text-foreground tracking-wide">{t("whyWarm")}</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
              69 家租户不是 69 次陌拜。成电系同源（路径A）、园区官方背书（路径B）、协会一对多（路径C）、专业服务互荐（路径D）叠加后，
              <b className="text-foreground">26 条 P0/P1 线索全部存在至少一条暖引荐通道</b>——签下园区股份生态协议，即一次性点亮全图。
            </p>
          </section>

          <section>
            <h2 className="font-serif-sc font-bold text-[14px] text-foreground tracking-wide mb-2.5">{t("roadmap90")}</h2>
            <div className="space-y-0">
              {[
                ["0–30 天", "签园区股份生态协议；运维数字化 MVP 立项；P0 七家首轮触达；信软管道对接 3 家技术租户", "≥5 家进入商机"],
                ["30–60 天", "MVP 交付并灌入管委会数据；P0 转化 2–3 家付费 HR；首批实习生进 2 家租户", "付费合同 ≥2 · 实习入职 ≥10"],
                ["60–90 天", "平台扩展人才地图；跑通供给→匹配→用人闭环；沉淀可复制 SOP", "闭环样板 1 个 · 续约管道成型"],
              ].map(([t, act, kpi], i) => (
                <div key={t} className="relative pl-6 pb-5 last:pb-0">
                  {i < 2 && <span className="absolute left-[5px] top-4 bottom-0 w-px bg-border" />}
                  <span className="absolute left-0 top-1 w-[11px] h-[11px] rounded-full border-2 border-primary bg-background" />
                  <div className="font-mono-num font-bold text-[12px] text-primary">{t}</div>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{act}</p>
                  <div className="mt-1 inline-block rounded-sm bg-secondary px-2 py-0.5 text-[10.5px] text-foreground/85">KPI：{kpi}</div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-serif-sc font-bold text-[14px] text-foreground tracking-wide mb-2.5">{t("p0Order")}</h2>
            <div className="space-y-1.5">
              {items.filter((x) => x.tier === "P0")
                .sort((a, b) => b.score - a.score)
                .map((x, i) => (
                  <button key={x.eid} onClick={() => pickCompany(x)} className="w-full flex items-center gap-2.5 rounded-md border border-border bg-card/40 px-3 py-2 hover:bg-accent transition-colors text-left active:scale-[0.99]">
                    <span className="font-mono-num text-[11px] text-muted-foreground/70 w-4">{i + 1}</span>
                    <TierTag tier={x.tier} small />
                    <span className="text-[12.5px] text-foreground truncate flex-1">{x.name}</span>
                    <span className="font-mono-num font-bold text-[13px]" style={{ color: "var(--tier-p0)" }}>{x.score}</span>
                  </button>
                ))}
            </div>
          </section>
        </aside>
      </div>

      <EntityDrawer entity={selLive} onClose={() => setSel(null)} />
    </ScreenLayout>
  );
}
