/* 触达任务清单：本周应触达 / 应复访 / 培育跟进（后端规则推演）。
   联动屏二漏斗与生命周期标记，配合园区路演形成作战节奏闭环。
   迭代5：任务完成打卡 + 本周完成率 + 周报复盘 + Excel 导出。 */
import { useMemo, useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import EntityDrawer, { TierTag, StageTag } from "@/components/EntityDrawer";
import LedgerNote from "@/components/LedgerNote";
import { trpc } from "@/lib/trpc";
import { useSnapshot, ParkItem, TIER_COLOR, useMaskStore } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { downloadXlsx } from "@/lib/exportXlsx";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { toast } from "sonner";
import { Link } from "wouter";
import { ArrowRight, BrainCircuit, CheckCircle2, Circle, Download, FileSpreadsheet, Loader2, ListTodo, PhoneCall, RotateCcw, Sprout } from "lucide-react";

const TYPE_META: Record<string, { icon: typeof PhoneCall; color: string; desc: string }> = {
  首触: { icon: PhoneCall, color: "var(--tier-p0)", desc: "P0 未触达 · 本周完成首轮触达与约见" },
  复访: { icon: RotateCcw, color: "var(--stage-reached)", desc: "已触达/已约见超期未推进 · 需复访推进" },
  培育跟进: { icon: Sprout, color: "var(--tier-p1)", desc: "P1 带 Tier-1 信号 · 信号衰减前跟进" },
};

export default function Tasks() {
  const [sel, setSel] = useState<ParkItem | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const { t: tr } = useI18n();
  const mask = useMaskStore((s) => s.mask);
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { data: tasks, isLoading } = trpc.park.tasks.useQuery({ mask }, { staleTime: 15_000 });
  const { data: weekly } = trpc.park.weeklyReview.useQuery({ mask }, { staleTime: 15_000 });
  const { items } = useSnapshot();

  const invalidate = () => { utils.park.tasks.invalidate(); utils.park.weeklyReview.invalidate(); };
  const doneMut = trpc.park.taskDone.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });
  const undoneMut = trpc.park.taskUndone.useMutation({ onSuccess: invalidate, onError: (e) => toast.error(e.message) });

  const toggleDone = (t: { eid: string; taskType: string; done?: boolean }, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) { toast("登录后可打卡任务", { action: { label: "登录", onClick: () => startLogin() } }); return; }
    const taskType = t.taskType as "首触" | "复访" | "培育跟进";
    if (t.done) undoneMut.mutate({ eid: t.eid, taskType });
    else doneMut.mutate({ eid: t.eid, taskType });
  };

  const doExport = async (kind: "tasks" | "weekly") => {
    if (!isAuthenticated) { toast("登录后可导出", { action: { label: "登录", onClick: () => startLogin() } }); return; }
    setExporting(kind);
    try {
      const data = await utils.park.exportData.fetch({ kind, mask });
      if (!data.rows.length) { toast("暂无可导出数据"); return; }
      downloadXlsx(data.rows as Record<string, unknown>[], data.sheet, data.file);
      toast.success(`已导出 ${data.rows.length} 行`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "导出失败");
    } finally {
      setExporting(null);
    }
  };

  const selLive = useMemo(() => (sel ? items.find((x) => x.eid === sel.eid) ?? sel : null), [sel, items]);
  const groups = useMemo(() => {
    const g: Record<string, NonNullable<typeof tasks>> = { 首触: [], 复访: [], 培育跟进: [] };
    (tasks ?? []).forEach((t) => g[t.taskType]?.push(t));
    return g;
  }, [tasks]);

  if (isLoading && !tasks) {
    return (
      <ScreenLayout>
        <div className="flex items-center justify-center h-[70vh] text-muted-foreground gap-2 text-[13px]">
          <Loader2 className="w-5 h-5 animate-spin" /> {tr("loading")}
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <div className="px-4 sm:px-6 lg:px-10 pt-6 lg:pt-9 pb-8 border-b border-border">
        <ScreenHeader
          num={tr("numTasks")}
          title={tr("tasksTitle")}
          desc={tr("tasksDesc")}
          right={
            <div className="flex items-center gap-3">
              <button
                onClick={() => doExport("tasks")}
                disabled={exporting !== null}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {exporting === "tasks" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                {tr("exportTasks")}
              </button>
              <Link href="/radar" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
                {tr("goS2Funnel")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          }
        />

        {/* 本周完成率统计条（周报复盘 · 模块12 周节奏） */}
        {weekly && (
          <div className="mt-5 rounded-md border border-border bg-card/60 px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
              <div>
                <div className="text-[11px] text-muted-foreground">{weekly.weekKey} · {tr("weekRate")}</div>
                <div className="font-mono-num font-extrabold text-[26px] leading-tight" style={{ color: weekly.completionRate >= 70 ? "var(--stage-won)" : weekly.completionRate >= 40 ? "var(--tier-p1)" : "var(--tier-p0)" }}>
                  {weekly.completionRate}<span className="text-[14px] opacity-70">%</span>
                </div>
              </div>
              <div className="flex-1 min-w-[220px]">
                <div className="h-2.5 rounded-sm bg-secondary/70 overflow-hidden">
                  <div className="h-full rounded-sm transition-all duration-500" style={{ width: `${weekly.completionRate}%`, background: "var(--stage-won)" }} />
                </div>
                <div className="mt-1.5 flex gap-4 text-[11px] text-muted-foreground">
                  <span>已完成 <b className="font-mono-num text-foreground">{weekly.doneTasks}</b></span>
                  <span>待办 <b className="font-mono-num text-foreground">{weekly.openTasks}</b></span>
                  {(["首触", "复访", "培育跟进"] as const).map((k) => (
                    <span key={k}>{k} <b className="font-mono-num text-foreground">{weekly.byType[k]?.done ?? 0}</b>/<span className="font-mono-num">{(weekly.byType[k]?.done ?? 0) + (weekly.byType[k]?.open ?? 0)}</span></span>
                  ))}
                </div>
              </div>
              <button
                onClick={() => doExport("weekly")}
                disabled={exporting !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-[12px] font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
              >
                {exporting === "weekly" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {tr("exportWeekly")}
              </button>
            </div>
            {(weekly.stageMoves.length > 0 || weekly.doneList.length > 0) && (
              <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
                <span className="text-muted-foreground/70">{tr("weekMoves")}：</span>
                {weekly.doneList.slice(0, 4).map((d, i) => (
                  <span key={`d${i}`}><CheckCircle2 className="w-3 h-3 inline mr-0.5" style={{ color: "var(--stage-won)" }} />{d.name} {d.taskType}打卡</span>
                ))}
                {weekly.stageMoves.slice(0, 4).map((m, i) => (
                  <span key={`m${i}`}>{m.name} → {m.stage}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 迭代13 · 决策执行承接区：决策中心已采纳/执行中的决策在任务动线可见（执行合一） */}
        <DecisionExecStrip mask={mask} />

        {/* 迭代21 · 工单8 · 流程工作台：SLA 任务 + 流程实例（WorkflowRuntime/Saga） */}
        <WorkflowStrip mask={mask} />
      </div>

      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {(["首触", "复访", "培育跟进"] as const).map((type) => {
          const meta = TYPE_META[type];
          const Icon = meta.icon;
          const list = groups[type] ?? [];
          return (
            <section key={type} className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color: meta.color }} />
                <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide">{type}</h2>
                <span className="font-mono-num font-bold text-[15px]" style={{ color: meta.color }}>{list.length}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">{meta.desc}</p>
              <div className="space-y-2">
                {list.length === 0 && (
                  <div className="rounded-md border border-dashed border-border px-3.5 py-6 text-center text-[12px] text-muted-foreground/70">
                    <ListTodo className="w-4 h-4 mx-auto mb-1.5 opacity-60" />
                    当前无{type}任务
                  </div>
                )}
                {list.map((t, i) => {
                  const x = items.find((it) => it.eid === t.eid) ?? null;
                  return (
                    <button
                      key={t.eid}
                      onClick={() => x && setSel(x)}
                      className="w-full text-left rounded-md border border-border bg-card/50 px-3.5 py-2.5 hover:bg-accent transition-colors active:scale-[0.99]"
                      style={{ borderLeft: `3px solid ${meta.color}`, opacity: t.done ? 0.55 : 1 }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          role="checkbox"
                          aria-checked={t.done}
                          tabIndex={0}
                          onClick={(e) => toggleDone(t, e)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleDone(t, e as unknown as React.MouseEvent); }}
                          className="cursor-pointer hover:scale-110 transition-transform"
                          title={t.done ? "撤销本周打卡" : "完成打卡（计入周报）"}
                        >
                          {t.done
                            ? <CheckCircle2 className="w-4 h-4" style={{ color: "var(--stage-won)" }} />
                            : <Circle className="w-4 h-4 text-muted-foreground/50" />}
                        </span>
                        <span className="font-mono-num text-[11px] w-5 text-muted-foreground/70">{String(i + 1).padStart(2, "0")}</span>
                        <TierTag tier={t.tier} small />
                        <span className={`text-[12.5px] font-medium text-foreground truncate flex-1 ${t.done ? "line-through" : ""}`}>{t.name}</span>
                        <StageTag stage={t.stage} small />
                        <span className="font-mono-num font-bold text-[13px]" style={{ color: TIER_COLOR[t.tier] }}>{t.score}</span>
                      </div>
                      <div className="mt-1 pl-[52px] text-[11px] text-muted-foreground truncate">
                        {t.floor} · {t.ind}
                      </div>
                      <div className="mt-0.5 pl-[52px] text-[11px]" style={{ color: meta.color }}>{t.reason}</div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="px-4 sm:px-6 lg:px-10 pb-8">
        <LedgerNote extra="任务规则（可在规则中心配置）：P0未触达→首触；已触达超期未约见 / 已约见超期未成交→复访；P1未触达且带Tier-1信号→培育跟进。打卡与状态推进计入周报，动作写入操作台账。" />
      </div>

      <EntityDrawer entity={selLive} onClose={() => setSel(null)} />
    </ScreenLayout>
  );
}

/* 迭代13 · 决策执行条：拉取 adopted/executing 决策，展示执行动线入口（详情与回填在决策中心） */
function DecisionExecStrip({ mask }: { mask: boolean }) {
  const { data } = trpc.park.decision.feed.useQuery(
    { mask, status: ["adopted", "executing"] }, { staleTime: 15_000 });
  const list = (data ?? []).flatMap((g) => g.items.map((i) => ({ ...i, typeLabel: g.label })));
  if (list.length === 0) return null;
  return (
    <div className="mt-4 rounded-md border border-primary/30 bg-primary/[0.05] px-5 py-3.5">
      <div className="flex items-center gap-2 mb-2">
        <BrainCircuit className="w-4 h-4 text-primary" />
        <span className="font-serif-sc font-bold text-[13px] text-foreground tracking-wide">决策执行中</span>
        <span className="font-mono-num text-[12px] text-primary font-bold">{list.length}</span>
        <Link href="/decision" className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground transition-colors">
          去决策中心流转 <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {list.slice(0, 8).map((d) => (
          <span key={d.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-2.5 py-1 text-[11px]">
            <span className="rounded bg-primary/10 text-primary px-1 py-px text-[10px]">{d.typeLabel}</span>
            <span className="text-foreground font-medium">{d.name}</span>
            <span className="text-muted-foreground">{d.status === "adopted" ? "已采纳" : "执行中"}{d.assignee ? ` · ${d.assignee}` : ""}</span>
          </span>
        ))}
        {list.length > 8 && <span className="text-[11px] text-muted-foreground self-center">等 {list.length} 条</span>}
      </div>
    </div>
  );
}

/* ========== 迭代21 · 工单8 · 流程工作台（WorkflowRuntime / SLA / Saga） ========== */
function WorkflowStrip({ mask }: { mask: boolean }) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const { data: tasks } = trpc.park.workflow.tasks.useQuery(undefined, { enabled: isAuthenticated, staleTime: 15_000 });
  const { data: instances } = trpc.park.workflow.instances.useQuery(undefined, { enabled: isAuthenticated, staleTime: 15_000 });
  const complete = trpc.park.workflow.completeTask.useMutation({
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.error ?? "操作失败"); return; }
      toast.success(r.instanceStatus === "compensated" ? "已触发 Saga 补偿：已完成步骤逆序回滚" : "任务已完成，流程推进");
      utils.park.workflow.tasks.invalidate();
      utils.park.workflow.instances.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  if (!isAuthenticated) return null;
  const hasContent = (tasks?.length ?? 0) > 0 || (instances?.length ?? 0) > 0;
  const STATUS_ZH: Record<string, string> = { running: "运行中", done: "已完成", failed: "失败", compensated: "已补偿" };
  const STEP_COLOR: Record<string, string> = { done: "#0E9F6E", running: "#D97706", pending: "#8496B4", failed: "#C8102E", compensated: "#C8102E", skipped: "#6b7280" };
  const fmtLeft = (due: number | null) => {
    if (!due) return "—";
    const ms = due - Date.now();
    if (ms <= 0) return "已超时";
    const h = Math.floor(ms / 3600_000);
    return h >= 24 ? `剩 ${Math.floor(h / 24)} 天 ${h % 24} 时` : `剩 ${h} 时`;
  };
  return (
    <div className="mt-4 rounded-md border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2">
        <ListTodo className="w-4 h-4 text-primary" />
        <span className="font-serif-sc font-bold text-[13.5px] text-foreground">流程工作台</span>
        <span className="text-[10.5px] text-muted-foreground">工单8 · 决策编排为带 SLA 的多步流程 · 超时升级 · 失败 Saga 补偿 · 步骤幂等</span>
      </div>
      {!hasContent && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">暂无流程实例——在决策中心把决策「采纳」后，点击决策卡上的「编排流程」即可生成带 SLA 的多步执行流程。</p>
      )}
      {(tasks?.length ?? 0) > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">SLA 任务（{tasks!.length}）</div>
          {tasks!.map((t) => (
            <div key={t.id} className={`flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-[12px] ${t.overdue || t.status === "escalated" ? "border-red-500/40 bg-red-500/[0.05]" : "border-border/60 bg-background/40"}`}>
              <span className="font-mono text-[10.5px] text-muted-foreground">WF#{t.instanceId}</span>
              <span className="text-foreground font-medium">{t.title}</span>
              {t.status === "escalated" && <span className="rounded bg-red-500/10 px-1.5 py-px text-[10px] font-medium text-red-500">已升级至 {t.escalatedTo}</span>}
              <span className={`text-[10.5px] ${t.overdue ? "text-red-500 font-medium" : "text-muted-foreground"}`}>SLA {t.slaHours}h · {fmtLeft(t.dueAt)}</span>
              <span className="ml-auto flex gap-1.5">
                <button onClick={() => complete.mutate({ taskId: t.id })} disabled={complete.isPending}
                  className="rounded bg-primary px-2 py-0.5 text-[10.5px] font-medium text-primary-foreground hover:opacity-90 active:scale-[0.97] transition disabled:opacity-50">完成</button>
                <button onClick={() => complete.mutate({ taskId: t.id, failed: true, note: "人工标记失败" })} disabled={complete.isPending}
                  className="rounded border border-red-500/40 px-2 py-0.5 text-[10.5px] text-red-500 hover:bg-red-500/10 active:scale-[0.97] transition disabled:opacity-50">失败(补偿)</button>
              </span>
            </div>
          ))}
        </div>
      )}
      {(instances?.length ?? 0) > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] font-medium text-muted-foreground">流程实例（{instances!.length}）</div>
          {instances!.slice(0, 6).map((ins) => (
            <div key={ins.id} className="rounded border border-border/60 bg-background/40 px-3 py-2">
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                <span className="font-mono text-[10.5px] text-muted-foreground">WF#{ins.id}</span>
                <span className="text-foreground font-medium">{ins.defName}</span>
                {ins.eid && <span className="text-[10.5px] text-muted-foreground">{mask ? ins.eid : ins.eid}</span>}
                <span className={`rounded px-1.5 py-px text-[10px] font-medium ${ins.status === "done" ? "bg-emerald-500/10 text-emerald-600" : ins.status === "compensated" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-600"}`}>
                  {STATUS_ZH[ins.status] ?? ins.status}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {ins.steps.map((s: { key: string; status: string; compensationNote?: string }, i: number) => (
                  <span key={s.key} className="flex items-center gap-1">
                    <span className="rounded px-1.5 py-px text-[10px]" style={{ background: `${STEP_COLOR[s.status]}18`, color: STEP_COLOR[s.status] }}
                      title={s.compensationNote ? `补偿：${s.compensationNote}` : s.status}>
                      {ins.stepDefs[i]?.title ?? s.key}
                    </span>
                    {i < ins.steps.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/50" />}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2.5 text-[10px] text-muted-foreground/70">失败步骤触发 SagaCoordinator：已完成步骤按补偿动作逆序回滚并留痕；步骤幂等（重复提交不重复执行）；SLA 超时自动升级至管理员。</p>
    </div>
  );
}
