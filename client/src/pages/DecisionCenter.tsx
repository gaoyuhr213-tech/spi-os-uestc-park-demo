/* 决策中心（Decision Center）· 迭代13 · 全站动线入口
   对标 Palantir AIP（决策一等对象）/ 6sense（Action-First）：
   今日 AI 决策建议流（5类分组+原因链+星级+资源匹配）→ 一键采纳指派 → 执行 → 结果回填
   + 决策闭环漏斗（suggested→adopted→executing→done）+ 决策级 ROI（收入归因六层映射）。
   所有决策由后端决策引擎生成（规则可解释），前端仅渲染与流转。 */
import { useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import EntityDrawer from "@/components/EntityDrawer";
import LedgerNote from "@/components/LedgerNote";
import { trpc } from "@/lib/trpc";
import { useSnapshot, ParkItem, useMaskStore } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { toast } from "sonner";
import { Link } from "wouter";
import DecisionCard9Panel from "@/components/DecisionCard9Panel";
import PipelineStrip from "@/components/PipelineStrip";
import DemoMode from "@/components/DemoMode";
import {
  ArrowRight, BrainCircuit, CheckCircle2, ChevronDown, ChevronUp, Loader2,
  PhoneCall, GraduationCap, Handshake, Landmark, Users2, Sparkles, Star, XCircle,
  Download,
} from "lucide-react";

const DTYPE_META: Record<string, { icon: typeof PhoneCall; color: string }> = {
  contact: { icon: PhoneCall, color: "var(--tier-p0)" },
  hr_service: { icon: Users2, color: "#C8102E" },
  mentor: { icon: GraduationCap, color: "#D97706" },
  policy: { icon: Landmark, color: "#0E9F6E" },
  referral: { icon: Handshake, color: "#7C6BD6" },
};
const STATUS_META: Record<string, { zh: string; en: string; cls: string }> = {
  suggested: { zh: "待采纳", en: "Suggested", cls: "bg-secondary text-muted-foreground" },
  adopted: { zh: "已采纳", en: "Adopted", cls: "bg-amber-500/15 text-amber-600" },
  executing: { zh: "执行中", en: "Executing", cls: "bg-blue-500/15 text-blue-600" },
  done: { zh: "已完成", en: "Done", cls: "bg-emerald-500/15 text-emerald-600" },
  dismissed: { zh: "已放弃", en: "Dismissed", cls: "bg-secondary text-muted-foreground/60" },
};

function Stars({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`w-3 h-3 ${i <= n ? "fill-amber-500 text-amber-500" : "text-border"}`} />
      ))}
    </span>
  );
}

/** 迭代14 · 负责人指派下拉：成员名单来自后端（登录过的成员 + 项目负责人），多人协作分单 */
function AssignPicker({ zh, members, me, pending, onPick, onCancel }: {
  zh: boolean; members: string[]; me: string; pending: boolean;
  onPick: (name: string) => void; onCancel: () => void;
}) {
  const [picked, setPicked] = useState(me || members[0] || "");
  const list = members.length > 0 ? members : me ? [me] : [];
  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={picked}
        onChange={(e) => setPicked(e.target.value)}
        className="rounded-sm border border-border bg-background px-1.5 py-1 text-[11.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        {list.map((m) => (
          <option key={m} value={m}>{m === me ? `${m}${zh ? "（我）" : " (me)"}` : m}</option>
        ))}
      </select>
      <button onClick={() => picked && onPick(picked)} disabled={pending || !picked}
        className="rounded bg-primary text-primary-foreground px-2.5 py-1 text-[11.5px] font-medium hover:opacity-90 active:scale-[0.97] disabled:opacity-50">
        {pending ? (zh ? "指派中…" : "…") : (zh ? "确认指派" : "Assign")}
      </button>
      <button onClick={onCancel} className="rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground">
        {zh ? "取消" : "Cancel"}
      </button>
    </span>
  );
}

export default function DecisionCenter() {
  const [sel, setSel] = useState<ParkItem | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [outcomeFor, setOutcomeFor] = useState<number | null>(null);
  const [assignFor, setAssignFor] = useState<number | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [mineOnly, setMineOnly] = useState(false); // 迭代15 · 我的决策筛选
  const [demoOpen, setDemoOpen] = useState(false); // 迭代23 · 工单12 · 一键演示
  const { t: tr, lang } = useI18n();
  const mask = useMaskStore((s) => s.mask);
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const { items } = useSnapshot();

  const statusFilter = showClosed ? ["suggested", "adopted", "executing", "done", "dismissed"] : undefined;
  const { data: feed, isLoading } = trpc.park.decision.feed.useQuery(
    { mask, status: statusFilter as never }, { staleTime: 10_000 });
  const { data: roi } = trpc.park.decision.roi.useQuery(undefined, { staleTime: 10_000 });
  const { data: health } = trpc.park.decision.health.useQuery(undefined, { staleTime: 10_000 });
  const { data: members } = trpc.park.decision.members.useQuery(undefined, { enabled: isAuthenticated, staleTime: 60_000 });
  const { data: usage } = trpc.park.decision.resourceUsage.useQuery(undefined, { staleTime: 10_000 });
  const { data: resourceList } = trpc.park.decision.resources.useQuery(undefined, { staleTime: 60_000 });
  const usedOf = (rid: number) => usage?.find((u) => u.resourceId === rid)?.used ?? 0;
  const capOf = (rid: number) => resourceList?.find((r) => r.id === rid)?.capacity;

  // 我的决策：按当前用户名过滤（负责人 = 我）
  const myName = user?.name ?? "";
  const filteredFeed = feed?.map((g) => {
    const items = mineOnly ? g.items.filter((d) => d.assignee === myName) : g.items;
    return { ...g, items, count: items.length };
  }).filter((g) => g.items.length > 0);

  const invalidate = () => { utils.park.decision.invalidate(); };
  const genMut = trpc.park.decision.generate.useMutation({
    onSuccess: (r) => { invalidate(); toast.success(lang === "zh" ? `决策引擎扫描完成：新增 ${r.created} 条建议（幂等跳过 ${r.skipped}）` : `Generated ${r.created} decisions (${r.skipped} skipped)`); },
    onError: (e) => toast.error(e.message),
  });
  const transMut = trpc.park.decision.transition.useMutation({
    onSuccess: () => { invalidate(); setOutcomeFor(null); setAssignFor(null); },
    onError: (e) => toast.error(e.message),
  });
  // 迭代21 · 工单8 · 决策 → 编排为带 SLA 的多步工作流（同决策幂等一次）
  const wfStart = trpc.park.workflow.start.useMutation({
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.error ?? (lang === "zh" ? "编排失败" : "Failed")); return; }
      toast.success(lang === "zh" ? `流程已编排（WF#${r.instanceId}）——到「触达任务清单」页流程工作台跟进 SLA 任务` : `Workflow #${r.instanceId} started`);
    },
    onError: (e) => toast.error(e.message),
  });

  const requireLogin = () => {
    toast(lang === "zh" ? "登录后可操作决策" : "Login required", { action: { label: lang === "zh" ? "登录" : "Login", onClick: () => startLogin() } });
  };
  const act = (id: number, to: "adopted" | "executing" | "dismissed") => {
    if (!isAuthenticated) return requireLogin();
    transMut.mutate({ id, to });
  };
  const adoptWith = (id: number, assignee: string) => {
    if (!isAuthenticated) return requireLogin();
    transMut.mutate({ id, to: "adopted", assignee });
  };
  const complete = (id: number, outcome: "won" | "lost" | "partial", note: string, dealAmount?: number) => {
    if (!isAuthenticated) return requireLogin();
    transMut.mutate({ id, to: "done", outcome, outcomeNote: note || undefined, dealAmount });
  };
  const pickCompany = (eid: string) => {
    const x = items.find((i) => i.eid === eid);
    if (x) setSel(x);
  };

  const zh = lang === "zh";
  return (
    <ScreenLayout>
      <div className="px-10 pt-9 pb-8 border-b border-border">
        <ScreenHeader
          num={zh ? "中枢" : "Hub"}
          title={zh ? "决策中心" : "Decision Center"}
          desc={zh
            ? "每一个识别出的需求 → 一个可执行决策 → 自动匹配资源 → 执行回填 → 决策级 ROI 与学习。决策由后端引擎按需求画布×生命周期×信号生成，全程可解释、人在环。"
            : "Need → Decision → Matching → Execution → Outcome → Learning. Generated by the backend decision engine, explainable, human-in-the-loop."}
          right={
            <Link href="/" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              {zh ? "下一屏 · 园区健康看板" : "Next · Park Health"} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        />

        {/* ROI 统计条 + 闭环漏斗 */}
        {roi && (
          <div className="mt-7 grid grid-cols-2 md:grid-cols-6 gap-x-8 gap-y-4 max-w-5xl">
            <div>
              <div className="font-mono-num font-extrabold text-[32px] leading-none text-foreground">{roi.total}</div>
              <div className="mt-1.5 text-[12px] text-muted-foreground">{zh ? "累计决策" : "Total decisions"}</div>
            </div>
            <div>
              <div className="font-mono-num font-extrabold text-[32px] leading-none" style={{ color: "#D97706" }}>{roi.adoptionRate}<span className="text-[16px] ml-0.5">%</span></div>
              <div className="mt-1.5 text-[12px] text-muted-foreground">{zh ? "采纳率" : "Adoption"}</div>
            </div>
            <div>
              <div className="font-mono-num font-extrabold text-[32px] leading-none" style={{ color: "#0E9F6E" }}>{roi.winRate}<span className="text-[16px] ml-0.5">%</span></div>
              <div className="mt-1.5 text-[12px] text-muted-foreground">{zh ? "成交率（已完成中）" : "Win rate (done)"}</div>
            </div>
            <div>
              <div className="font-mono-num font-extrabold text-[32px] leading-none text-foreground">
                {roi.totalAmount >= 10000 ? (roi.totalAmount / 10000).toFixed(1) : roi.totalAmount}
                <span className="text-[15px] ml-0.5 opacity-70">{roi.totalAmount >= 10000 ? (zh ? "万元" : "×10k") : (zh ? "元" : "CNY")}</span>
              </div>
              <div className="mt-1.5 text-[12px] text-muted-foreground">{zh ? "累计成交额（金额口径）" : "Total deal amount"}</div>
              {roi.byRevenueTier.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {roi.byRevenueTier.map((t) => (
                    <div key={t.tier} className="text-[10.5px] text-muted-foreground font-mono-num">
                      {t.label} <b className="text-foreground">{t.amount >= 10000 ? `${(t.amount / 10000).toFixed(1)}万` : t.amount}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="col-span-2">
              <div className="flex items-end gap-1.5 h-[38px]">
                {(["suggested", "adopted", "executing", "done"] as const).map((k, i) => {
                  const v = roi.funnel[k];
                  const max = Math.max(1, roi.funnel.suggested, roi.funnel.adopted, roi.funnel.executing, roi.funnel.done);
                  return (
                    <div key={k} className="flex-1 flex flex-col items-center gap-1">
                      <span className="font-mono-num text-[12px] font-bold text-foreground">{v}</span>
                      <div className="w-full rounded-sm" style={{ height: `${Math.max(8, (v / max) * 26)}px`, background: ["#8496B4", "#D97706", "#3B82F6", "#0E9F6E"][i], opacity: 0.85 }} />
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-1.5 text-[10px] text-muted-foreground">
                {[zh ? "待采纳" : "Suggested", zh ? "已采纳" : "Adopted", zh ? "执行中" : "Executing", zh ? "已完成" : "Done"].map((l) => (
                  <span key={l} className="flex-1 text-center">{l}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* V3 · Decision Health 五维北极星 */}
        {health && (
          <div className="mt-5 rounded-md border border-border bg-card/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="font-mono-num font-extrabold text-[26px] leading-none" style={{ color: health.overall >= 70 ? "#0E9F6E" : health.overall >= 45 ? "#D97706" : "#C8102E" }}>{health.overall}</span>
                <span className="text-[11px] text-muted-foreground leading-tight">{zh ? "Decision Health\n综合健康分" : "Decision\nHealth"}</span>
              </div>
              {([
                [zh ? "速度 Velocity" : "Velocity", `${health.velocity.value}${zh ? "天" : "d"}`, health.velocity.note],
                [zh ? "质量 Quality" : "Quality", `${health.quality.value}%`, health.quality.note],
                [zh ? "影响 Impact" : "Impact", `${health.impact.value}${zh ? "万" : "w"}`, health.impact.note],
                [zh ? "采纳 ROI" : "ROI", `${health.roi.value}%`, health.roi.note],
                [zh ? "学习 Learning" : "Learning", `${health.learning.value}%`, health.learning.note],
              ] as Array<[string, string, string]>).map(([l, v, n]) => (
                <div key={l} title={n}>
                  <div className="font-mono-num font-bold text-[17px] leading-none text-foreground">{v}</div>
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground">{l}</div>
                </div>
              ))}
              <span className="text-[10px] text-muted-foreground/60 max-w-[260px] leading-snug hidden xl:block">{health.note}</span>
            </div>
          </div>
        )}

        {/* 迭代23 · 工单10 · Pipeline 串联视图（登录可见最近运行事件流） */}
        {isAuthenticated && <PipelineStrip />}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => (isAuthenticated ? genMut.mutate() : requireLogin())}
            disabled={genMut.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-[13px] font-medium hover:opacity-90 transition-opacity active:scale-[0.97] disabled:opacity-50"
          >
            {genMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
            {zh ? "生成今日决策（扫描 P0/P1）" : "Generate today's decisions"}
          </button>
          <button
            onClick={() => (isAuthenticated ? setDemoOpen(true) : requireLogin())}
            className="inline-flex items-center gap-2 rounded-md border border-primary/50 text-primary px-4 py-2 text-[13px] font-medium hover:bg-primary/10 transition-colors active:scale-[0.97] motion-reduce:transition-none"
          >
            <Sparkles className="w-4 h-4" />
            {zh ? "一键演示（十段决策链）" : "One-click demo"}
          </button>
          <button
            onClick={() => setShowClosed(!showClosed)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {showClosed ? (zh ? "只看进行中" : "Active only") : (zh ? "含已完成/已放弃" : "Include closed")}
          </button>
          <button
            onClick={() => { if (!isAuthenticated) return requireLogin(); setMineOnly(!mineOnly); }}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3.5 py-2 text-[12.5px] transition-colors ${mineOnly ? "border-primary/50 bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {zh ? (mineOnly ? "我的决策 · 开" : "我的决策") : (mineOnly ? "Mine · on" : "My decisions")}
          </button>
          <span className="text-[11px] text-muted-foreground/70">
            {zh ? "决策生成幂等：同企业同类型同需求维度只保留一条活跃决策；全部动作写台账。" : "Idempotent generation; all actions ledgered."}
          </span>
        </div>
      </div>

      {/* 建议流：按决策类型分组 */}
      <div className="px-10 py-8">
        {isLoading && <div className="flex items-center gap-2 text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin" />{zh ? "加载决策流…" : "Loading…"}</div>}
        {feed && feed.length === 0 && (
          <div className="rounded-md border border-dashed border-border px-6 py-10 text-center text-[13px] text-muted-foreground">
            <Sparkles className="w-5 h-5 mx-auto mb-2 opacity-60" />
            {zh ? "暂无进行中的决策 · 点击上方「生成今日决策」，决策引擎将扫描全部 P0/P1 高价值线索。" : "No active decisions. Click Generate to scan P0/P1 leads."}
          </div>
        )}
        {feed && feed.length > 0 && filteredFeed?.length === 0 && (
          <div className="rounded-md border border-dashed border-border px-6 py-10 text-center text-[13px] text-muted-foreground">
            {zh ? `当前无指派给「${myName}」的决策 · 切换「我的决策」查看全部。` : "No decisions assigned to you."}
          </div>
        )}
        <div className="space-y-8">
          {filteredFeed?.map((g) => {
            const meta = DTYPE_META[g.dtype] ?? DTYPE_META.contact;
            const Icon = meta.icon;
            return (
              <section key={g.dtype}>
                <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide mb-3 flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: meta.color }} />
                  {zh ? g.label : g.dtype.replace("_", " ")}
                  <span className="text-muted-foreground font-normal text-[11px]">
                    {g.count} {zh ? "条" : "items"} · {zh ? "平均" : "avg"} {g.avgStars} ★
                  </span>
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {g.items.map((d) => {
                    const st = STATUS_META[d.status] ?? STATUS_META.suggested;
                    const open = expanded === d.id;
                    return (
                      <div key={d.id} className="rounded-md border border-border bg-card/70 p-4 transition-colors hover:border-primary/40">
                        <div className="flex items-start justify-between gap-3">
                          <button onClick={() => pickCompany(d.eid)} className="text-left min-w-0">
                            <div className="text-[13.5px] font-semibold text-foreground truncate hover:text-primary transition-colors">{d.name}</div>
                            <div className="mt-0.5 text-[12.5px] text-muted-foreground leading-snug">{d.title}</div>
                          </button>
                          <div className="flex-none flex flex-col items-end gap-1.5">
                            <Stars n={d.stars} />
                            <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${st.cls}`}>{zh ? st.zh : st.en}{d.assignee ? ` · ${d.assignee}` : ""}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => setExpanded(open ? null : d.id)}
                          className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          {zh ? `原因链 ${d.reason.length} 条 · 匹配资源 ${d.matches.length} 个` : `${d.reason.length} reasons · ${d.matches.length} resources`}
                        </button>
                        {open && (
                          <div className="mt-2 space-y-2.5">
                            {/* V3 · 九要素 Decision Provenance（证据/置信度/风险/机会/影响/学习/反事实） */}
                            <DecisionCard9Panel decisionId={d.id} zh={zh} />
                            {d.matches.length > 0 && (
                              <div className="rounded-sm border border-border/70 bg-secondary/40 p-2.5 space-y-1.5">
                                <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide">{zh ? "自动匹配资源（Top-3）" : "Matched resources"}</div>
                                {d.matches.map((m) => (
                                  <div key={m.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                                    <span className="text-foreground truncate">
                                      <span className="rounded bg-primary/10 text-primary px-1 py-px text-[10px] mr-1.5">{m.rtypeLabel}</span>
                                      {m.name}
                                    </span>
                                    <span className="flex-none flex items-center gap-1.5">
                                      {(() => {
                                        const cap = capOf(m.id);
                                        if (cap === undefined) return null;
                                        const used = usedOf(m.id);
                                        const full = used >= cap;
                                        return (
                                          <span className={`font-mono-num text-[10px] rounded px-1 py-px ${full ? "bg-red-500/10 text-red-600 font-semibold" : "bg-secondary text-muted-foreground"}`} title={zh ? "容量占用（执行中/总名额）" : "capacity used/total"}>
                                            {used}/{cap}{full ? (zh ? " 满" : " full") : ""}
                                          </span>
                                        );
                                      })()}
                                      <span className="font-mono-num text-muted-foreground" title={m.why.join(" / ")}>{m.score}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {d.outcome && (
                              <div className="text-[11.5px] text-muted-foreground">
                                {zh ? "结果" : "Outcome"}：<span className={d.outcome === "won" ? "text-emerald-600 font-medium" : "text-foreground"}>{d.outcome === "won" ? (zh ? "成交" : "Won") : d.outcome === "lost" ? (zh ? "未成" : "Lost") : (zh ? "部分达成" : "Partial")}</span>
                                {d.dealAmount ? <span className="font-mono-num"> · {d.dealAmount >= 10000 ? `${(d.dealAmount / 10000).toFixed(1)}万` : d.dealAmount}{zh ? "元" : " CNY"}</span> : null}
                                {d.outcomeNote ? ` · ${d.outcomeNote}` : ""}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 状态机动作条 */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {d.status === "suggested" && (
                            <>
                              {assignFor === d.id ? (
                                <AssignPicker
                                  zh={zh}
                                  members={members ?? []}
                                  me={user?.name ?? ""}
                                  pending={transMut.isPending}
                                  onPick={(name) => adoptWith(d.id, name)}
                                  onCancel={() => setAssignFor(null)}
                                />
                              ) : (
                                <button
                                  onClick={() => { if (!isAuthenticated) return requireLogin(); setAssignFor(d.id); }}
                                  disabled={transMut.isPending}
                                  className="rounded bg-primary/10 text-primary px-2.5 py-1 text-[11.5px] font-medium hover:bg-primary/20 transition-colors active:scale-[0.97]">
                                  {zh ? "采纳 · 指派负责人" : "Adopt & assign"}
                                </button>
                              )}
                              <button onClick={() => act(d.id, "dismissed")} disabled={transMut.isPending}
                                className="rounded px-2 py-1 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors">
                                {zh ? "放弃" : "Dismiss"}
                              </button>
                            </>
                          )}
                          {d.status === "adopted" && (
                            <>
                              <button onClick={() => act(d.id, "executing")} disabled={transMut.isPending}
                                className="rounded bg-blue-500/10 text-blue-600 px-2.5 py-1 text-[11.5px] font-medium hover:bg-blue-500/20 transition-colors active:scale-[0.97]">
                                {zh ? "开始执行" : "Start"}
                              </button>
                              <button onClick={() => wfStart.mutate({ decisionId: d.id })} disabled={wfStart.isPending}
                                className="rounded border border-primary/40 px-2.5 py-1 text-[11.5px] font-medium text-primary hover:bg-primary/10 transition-colors active:scale-[0.97]">
                                {zh ? "编排流程" : "Workflow"}
                              </button>
                            </>
                          )}
                          {d.status === "executing" && (outcomeFor === d.id ? (
                            <OutcomeForm zh={zh} pending={transMut.isPending} onSubmit={(o, n, amt) => complete(d.id, o, n, amt)} onCancel={() => setOutcomeFor(null)} />
                          ) : (
                            <>
                              <button onClick={() => setOutcomeFor(d.id)}
                                className="rounded bg-emerald-500/10 text-emerald-600 px-2.5 py-1 text-[11.5px] font-medium hover:bg-emerald-500/20 transition-colors active:scale-[0.97]">
                                <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 -mt-px" />{zh ? "完成 · 回填结果" : "Complete"}
                              </button>
                              <button onClick={() => wfStart.mutate({ decisionId: d.id })} disabled={wfStart.isPending}
                                className="rounded border border-primary/40 px-2.5 py-1 text-[11.5px] font-medium text-primary hover:bg-primary/10 transition-colors active:scale-[0.97]">
                                {zh ? "编排流程" : "Workflow"}
                              </button>
                            </>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <LedgerNote extra={zh
          ? "决策闭环：建议→采纳→执行→结果回填全部走状态机并写台账；完成必须回填 won/lost/partial，结果进入决策级学习（飞轮）。收入归因：HR服务/暖引荐→Marketplace，联系/导师→运营层，政策→咨询层。"
          : "Decision loop: suggest→adopt→execute→outcome, all ledgered; outcomes feed the learning flywheel."} />

        {/* 迭代15 · 月度经营报表 */}
        <MonthlyReportPanel zh={zh} isAuthenticated={isAuthenticated} requireLogin={requireLogin} />
      </div>

      <EntityDrawer entity={sel} onClose={() => setSel(null)} />
      {/* 迭代23 · 工单12 · 一键演示模式（十段决策链引导） */}
      <DemoMode open={demoOpen} onClose={() => setDemoOpen(false)} />
    </ScreenLayout>
  );
}

/* ============ 迭代15 · 月度经营报表面板 ============ */
function MonthlyReportPanel({ zh, isAuthenticated, requireLogin }: {
  zh: boolean; isAuthenticated: boolean; requireLogin: () => void;
}) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const { data: rep, isLoading } = trpc.park.decision.monthlyReport.useQuery(
    { month }, { enabled: isAuthenticated, staleTime: 10_000 });
  const exportMut = trpc.park.decision.monthlyReportExport.useMutation({
    onSuccess: async (r) => {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet(r.rows);
      ws["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, month);
      XLSX.writeFile(wb, r.filename);
      toast.success(zh ? "报表已导出（导出留痕）" : "Exported");
    },
    onError: (e) => toast.error(e.message),
  });
  // 月份选项：近 6 个月
  const months: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const fmtAmt = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}${zh ? "万" : "×10k"}` : String(v));
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide">
          {zh ? "月度经营报表" : "Monthly Report"}
          <span className="text-muted-foreground font-normal text-[11px] ml-2">{zh ? "按成员/资源/决策类型 · 成交金额与转化率" : "by assignee / resource / type"}</span>
        </h2>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[12px] text-foreground"
        >
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button
          onClick={() => (isAuthenticated ? exportMut.mutate({ month }) : requireLogin())}
          disabled={exportMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {exportMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {zh ? "导出 Excel" : "Export"}
        </button>
      </div>
      {!isAuthenticated && (
        <div className="rounded-md border border-dashed border-border px-5 py-6 text-center text-[12.5px] text-muted-foreground">
          {zh ? "登录后查看月度经营报表。" : "Login to view the monthly report."}
        </div>
      )}
      {isAuthenticated && isLoading && <div className="text-[12.5px] text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{zh ? "统计中…" : "Loading…"}</div>}
      {isAuthenticated && rep && (
        rep.totals.decisions === 0 ? (
          <div className="rounded-md border border-dashed border-border px-5 py-6 text-center text-[12.5px] text-muted-foreground">{rep.note}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-3 max-w-3xl">
              {[
                [zh ? "决策数" : "Decisions", String(rep.totals.decisions)],
                [zh ? "已完成" : "Done", String(rep.totals.done)],
                [zh ? "成交" : "Won", String(rep.totals.won)],
                [zh ? "转化率" : "Win rate", `${rep.totals.winRate}%`],
                [zh ? "成交金额" : "Amount", `${fmtAmt(rep.totals.amount)}${rep.totals.amount >= 10000 ? "" : zh ? "元" : ""}`],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="font-mono-num font-bold text-[22px] leading-none text-foreground">{v}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{l}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {[
                { title: zh ? "按负责人" : "By assignee", head: [zh ? "负责人" : "Assignee", zh ? "完成" : "Done", zh ? "转化%" : "Win%", zh ? "金额" : "Amt"], rows: rep.byAssignee.map((a) => [a.assignee, `${a.done}/${a.total}`, `${a.winRate}%`, fmtAmt(a.amount)]) },
                { title: zh ? "按决策类型" : "By type", head: [zh ? "类型" : "Type", zh ? "完成" : "Done", zh ? "转化%" : "Win%", zh ? "金额" : "Amt"], rows: rep.byType.map((t) => [t.label, `${t.done}/${t.total}`, `${t.winRate}%`, fmtAmt(t.amount)]) },
                { title: zh ? "按资源" : "By resource", head: [zh ? "资源" : "Resource", zh ? "完成" : "Done", zh ? "成交" : "Won", zh ? "金额" : "Amt"], rows: rep.byResource.map((r) => [r.resource, `${r.done}/${r.total}`, String(r.won), fmtAmt(r.amount)]) },
              ].map((tbl) => (
                <div key={tbl.title} className="rounded-md border border-border bg-card/70 p-3.5">
                  <div className="text-[12px] font-medium text-foreground mb-2">{tbl.title}</div>
                  {tbl.rows.length === 0 ? (
                    <div className="text-[11.5px] text-muted-foreground">{zh ? "本月暂无数据" : "No data"}</div>
                  ) : (
                    <table className="w-full text-[11.5px]">
                      <thead>
                        <tr className="text-muted-foreground">
                          {tbl.head.map((h) => <th key={h} className="text-left font-normal pb-1.5 pr-2 last:pr-0 last:text-right">{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {tbl.rows.map((r, i) => (
                          <tr key={i} className="border-t border-border/50">
                            <td className="py-1.5 pr-2 text-foreground truncate max-w-[120px]">{r[0]}</td>
                            <td className="py-1.5 pr-2 font-mono-num text-muted-foreground">{r[1]}</td>
                            <td className="py-1.5 pr-2 font-mono-num text-muted-foreground">{r[2]}</td>
                            <td className="py-1.5 font-mono-num text-foreground text-right">{r[3]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-muted-foreground/70">{rep.note}</p>
          </div>
        )
      )}
    </section>
  );
}

function OutcomeForm({ zh, pending, onSubmit, onCancel }: {
  zh: boolean; pending: boolean;
  onSubmit: (o: "won" | "lost" | "partial", note: string, dealAmount?: number) => void; onCancel: () => void;
}) {
  const [outcome, setOutcome] = useState<"won" | "lost" | "partial">("won");
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <div className="w-full rounded-sm border border-border bg-secondary/40 p-2.5 space-y-2">
      <div className="flex gap-1.5">
        {([["won", zh ? "成交" : "Won"], ["partial", zh ? "部分达成" : "Partial"], ["lost", zh ? "未成" : "Lost"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setOutcome(k)}
            className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${outcome === k ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
            {l}
          </button>
        ))}
      </div>
      {outcome !== "lost" && (
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 9))}
          inputMode="numeric"
          placeholder={zh ? "成交金额（元，金额口径 ROI 依据，选填）" : "Deal amount (CNY, optional)"}
          className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[11.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 font-mono-num"
        />
      )}
      <input
        value={note} onChange={(e) => setNote(e.target.value)} maxLength={100}
        placeholder={zh ? "结果说明（服务内容/失败原因，选填）" : "Note (optional)"}
        className="w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[11.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40"
      />
      <div className="flex gap-2">
        <button onClick={() => onSubmit(outcome, note, outcome !== "lost" && amount ? Number(amount) : undefined)} disabled={pending}
          className="rounded bg-emerald-600 text-white px-2.5 py-1 text-[11px] font-medium hover:opacity-90 active:scale-[0.97] disabled:opacity-50">
          {pending ? (zh ? "提交中…" : "Saving…") : (zh ? "确认完成" : "Confirm")}
        </button>
        <button onClick={onCancel} className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground">
          <XCircle className="w-3.5 h-3.5 inline mr-0.5 -mt-px" />{zh ? "取消" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
