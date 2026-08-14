/* 迭代17 · 工单1+2 · 数据接入中心：连接器状态卡 + CSV/粘贴摄入 + ingestionJob 历史 + 人工消歧队列 */
import { useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Database, Upload, GitMerge, CheckCircle2, XCircle, RotateCcw, AlertTriangle, Zap, KeyRound, Loader2 } from "lucide-react";

const ADAPTERS = [
  { id: "biz-registry" as const, label: "工商注册源", hint: "表头示例：企业名称,统一社会信用代码,注册资本,成立年份,参保人数,法定代表人,高企资质,融资轮次,变更事项" },
  { id: "job-board" as const, label: "招聘平台源", hint: "表头示例：企业名称,在招岗位数,核心岗位,薪资范围" },
  { id: "patent" as const, label: "专利/知识产权源", hint: "表头示例：企业名称,专利数,软著数,近期新增专利" },
];

function StatusPill({ s }: { s: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    active: { bg: "#0E9F6E", label: "运行中" }, planned: { bg: "#8496B4", label: "规划中" },
    paused: { bg: "#D97706", label: "已暂停" }, error: { bg: "#C8102E", label: "异常" },
    success: { bg: "#0E9F6E", label: "成功" }, partial: { bg: "#D97706", label: "部分成功" },
    failed: { bg: "#C8102E", label: "失败" }, running: { bg: "#8496B4", label: "进行中" },
  };
  const m = map[s] ?? { bg: "#8496B4", label: s };
  return <span className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10.5px] font-medium text-white" style={{ background: m.bg }}>{m.label}</span>;
}

function IngestPanel() {
  const [adapter, setAdapter] = useState<typeof ADAPTERS[number]["id"]>("biz-registry");
  const [text, setText] = useState("");
  const utils = trpc.useUtils();
  // 迭代23 · 工单10：摄入升级为触发端到端十段 Pipeline（一次导入触发全链，断链显式报错不静默）
  const ingest = trpc.park.pipeline.run.useMutation({
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`Pipeline 全链完成 ${r.events.length}/10 段${r.ingest ? `：入库 ${r.ingest.rowsOut} 行 / 跳过 ${r.ingest.rowsSkipped} 行（Job #${r.ingest.jobId}）` : ""}——事件流见决策中心`);
        setText("");
      } else {
        toast.error(`Pipeline 第${r.failedStage?.seq}段 ${r.failedStage?.stage} 失败中止：${r.failedStage?.error ?? ""}`);
      }
      utils.park.connector.invalidate();
      utils.park.resolution.queue.invalidate();
      utils.park.snapshot.invalidate();
      utils.park.pipeline.invalidate();
      utils.park.decision.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const cur = ADAPTERS.find((a) => a.id === adapter)!;
  return (
    <section className="rounded-md border border-border bg-card/60 p-4">
      <h2 className="font-serif-sc font-bold text-[14px] text-foreground flex items-center gap-1.5"><Upload className="w-4 h-4" /> CSV / 粘贴摄入（触发端到端十段 Pipeline）</h2>
      <p className="mt-1 text-[11px] text-muted-foreground">一次导入触发全链：ACL 防腐层 → 实体解析 → 画像/信号装配 → 图谱 → 评分复算 → 决策生成 → 流程就绪 → Agent 建议 → 结果/学习核验。任一段失败显式报错中止，事件流可在决策中心「Pipeline 串联视图」查看。</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ADAPTERS.map((a) => (
          <button key={a.id} onClick={() => setAdapter(a.id)}
            className={`rounded-sm border px-2.5 py-1 text-[12px] transition-colors ${adapter === a.id ? "border-primary bg-primary/15 text-foreground font-medium" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {a.label}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[10.5px] text-muted-foreground/80">{cur.hint}</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
        placeholder={"粘贴 CSV / 制表符分隔文本（首行为表头）\n" + cur.hint.replace("表头示例：", "")}
        className="mt-2 w-full rounded-sm border border-border bg-background/60 p-2.5 text-[12px] font-mono-num text-foreground outline-none focus:border-primary/60" />
      <div className="mt-2 flex justify-end">
        <Button size="sm" disabled={!text.trim() || ingest.isPending} onClick={() => ingest.mutate({ adapterId: adapter, csvText: text })}>
          {ingest.isPending ? "十段链运行中…" : "摄入并触发全链"}
        </Button>
      </div>
    </section>
  );
}

function DisambiguationQueue() {
  const { data: queue, isLoading } = trpc.park.resolution.queue.useQuery();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const scan = trpc.park.resolution.scan.useMutation({
    onSuccess: (r) => { toast.success(`扫描完成：新发现 ${r.created} 组候选`); utils.park.resolution.queue.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const decide = trpc.park.resolution.decide.useMutation({
    onSuccess: () => { toast.success("裁定已记录（台账留痕）"); utils.park.resolution.queue.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const pending = (queue ?? []).filter((q) => q.status === "pending");
  const decided = (queue ?? []).filter((q) => q.status !== "pending");
  return (
    <section className="rounded-md border border-border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-serif-sc font-bold text-[14px] text-foreground flex items-center gap-1.5"><GitMerge className="w-4 h-4" /> 实体解析 · 人工消歧队列</h2>
        {user?.role === "admin" && (
          <Button size="sm" variant="outline" disabled={scan.isPending} onClick={() => scan.mutate()}>
            {scan.isPending ? "扫描中…" : "扫描存量重复"}
          </Button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">USCC 精确命中≥90 自动合并；60–89 进入本队列人工裁定（确认/拆分/存疑），全程可撤销、台账留痕。</p>
      {isLoading && <div className="mt-3 text-[12px] text-muted-foreground">加载中…</div>}
      {!isLoading && pending.length === 0 && <div className="mt-3 rounded-sm border border-dashed border-border px-3 py-4 text-center text-[12px] text-muted-foreground">队列为空——主数据当前无待裁定的重复候选</div>}
      <div className="mt-3 space-y-2">
        {pending.map((q) => (
          <div key={q.id} className="rounded-sm border border-amber-600/40 bg-amber-500/[0.06] p-3">
            <div className="flex items-center gap-2 flex-wrap text-[12px]">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-medium text-foreground">#{q.id}</span>
              <span className="text-muted-foreground">置信度</span>
              <span className="font-mono-num font-bold text-amber-500">{q.confidence}</span>
              <StatusPill s={q.status} />
            </div>
            <div className="mt-1.5 text-[12.5px] text-foreground">
              目标：<span className="font-medium">{q.target?.name ?? q.targetEid}</span>
              <span className="text-muted-foreground text-[11px] ml-1">({q.targetEid}{q.target?.floor ? ` · ${q.target.floor}` : ""})</span>
            </div>
            <div className="text-[12px] text-muted-foreground">
              候选来源：{q.sources.map((s) => s.entity ? `${s.entity.name}(${s.key})` : s.key).join("、")}
            </div>
            {q.evidence != null && typeof q.evidence === "object" && "rulesHit" in (q.evidence as Record<string, unknown>) && (
              <div className="mt-1 text-[10.5px] text-muted-foreground/80">证据：{((q.evidence as { rulesHit?: string[] }).rulesHit ?? []).join("；")}</div>
            )}
            <div className="mt-2 flex gap-1.5 flex-wrap">
              <Button size="sm" className="h-7 text-[11.5px]" disabled={decide.isPending} onClick={() => decide.mutate({ id: q.id, action: "confirm" })}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" />确认合并
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11.5px]" disabled={decide.isPending} onClick={() => decide.mutate({ id: q.id, action: "split" })}>
                <XCircle className="w-3.5 h-3.5 mr-1" />拆分（保持独立）
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-[11.5px]" disabled={decide.isPending} onClick={() => decide.mutate({ id: q.id, action: "dismiss" })}>存疑搁置</Button>
            </div>
          </div>
        ))}
      </div>
      {decided.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-medium text-muted-foreground mb-1.5">已裁定 / 自动合并（{decided.length}）</div>
          <div className="space-y-1">
            {decided.slice(0, 10).map((q) => (
              <div key={q.id} className="flex items-center gap-2 flex-wrap rounded-sm border border-border/60 px-2.5 py-1.5 text-[11.5px]">
                <span className="font-mono-num text-muted-foreground">#{q.id}</span>
                <StatusPill s={q.status} />
                <span className="text-foreground">{q.target?.name ?? q.targetEid}</span>
                <span className="text-muted-foreground">置信 {q.confidence}</span>
                {q.decidedBy && <span className="text-muted-foreground/70">by {q.decidedBy}</span>}
                {q.status !== "auto_merged" && (
                  <button className="ml-auto inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground hover:text-foreground" onClick={() => decide.mutate({ id: q.id, action: "revert" })}>
                    <RotateCcw className="w-3 h-3" />撤销
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* 迭代24 · 工单13 · 外源 API 连接器状态 + 69 家批量回填复算 */
function ExternalBackfillPanel({ isAdmin }: { isAdmin: boolean }) {
  const { data: external } = trpc.park.connector.external.useQuery();
  const utils = trpc.useUtils();
  const backfill = trpc.park.connector.backfill.useMutation({
    onSuccess: (r) => {
      utils.park.connector.invalidate();
      utils.park.snapshot.invalidate();
      toast.success(
        r.mode === "live"
          ? `批量回填完成：工商 ${r.sources[0]?.rowsOut ?? 0} 行 / 招聘 ${r.sources[1]?.rowsOut ?? 0} 行，复算 P0=${r.recompute?.p0} P1=${r.recompute?.p1}`
          : `无 API key，已降级手工回填模式（不崩溃）：复算 P0=${r.recompute?.p0} P1=${r.recompute?.p1}，消歧待审 ${r.disambiguationQueued}`,
        { duration: 10000 },
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const r = backfill.data;
  return (
    <section className="mt-6 rounded-md border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-serif-sc font-bold text-[14px] text-foreground flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-primary" /> 外源 API 连接器（迭代24 · 工单13）
        </h2>
        {isAdmin && (
          <button
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 py-1.5 text-[12px] font-medium hover:opacity-90 active:scale-[0.97] transition-transform duration-150 motion-reduce:transition-none disabled:opacity-50"
          >
            {backfill.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" /> : <Database className="w-3.5 h-3.5" />}
            69 家批量回填复算
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {(external ?? []).map((c) => (
          <div key={c.cid} className={`rounded-md border p-3 ${c.hasKey ? "border-emerald-600/40 bg-emerald-500/5" : "border-amber-600/40 bg-amber-500/5"}`}>
            <div className="flex items-center gap-2">
              <KeyRound className={`w-3.5 h-3.5 ${c.hasKey ? "text-emerald-500" : "text-amber-500"}`} />
              <span className="text-[13px] font-medium text-foreground">{c.name}</span>
              <span className={`ml-auto rounded px-1.5 py-px text-[10px] border ${c.hasKey ? "border-emerald-600/50 text-emerald-500" : "border-amber-600/50 text-amber-600 dark:text-amber-400"}`}>
                {c.mode === "live" ? "API 直连" : "降级 · 手工回填"}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{c.note}</p>
          </div>
        ))}
      </div>
      {r && (
        <div className="mt-3 rounded-md border border-border bg-background/60 px-3.5 py-3 text-[12px] text-foreground space-y-1.5">
          <div className="font-medium">回填报告 · {r.mode === "live" ? "API 直连模式" : "降级手工模式"} · 名录 {r.totalEntities} 家</div>
          {r.sources.map((s) => (
            <div key={s.cid} className="text-[11.5px] text-muted-foreground">
              {s.cid}：{s.degraded ? `降级（${s.degradedReason}）` : `取数 ${s.fetched} 行 → 归属 ${s.rowsOut} / 跳过 ${s.rowsSkipped}（Job #${s.jobId}）`}
            </div>
          ))}
          <div className="text-[11.5px] text-muted-foreground">
            消歧待审 <b className="text-foreground font-mono-num">{r.disambiguationQueued}</b> 条
            {r.recompute && <> · 复算后雷达：P0 <b className="text-foreground font-mono-num">{r.recompute.p0}</b> / P1 <b className="text-foreground font-mono-num">{r.recompute.p1}</b> / 均分 <b className="text-foreground font-mono-num">{r.recompute.avgScore}</b></>}
          </div>
          {r.manualFallbackHint && <div className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">{r.manualFallbackHint}</div>}
        </div>
      )}
      <p className="mt-2 text-[10.5px] text-muted-foreground/70 leading-relaxed">
        API key 从环境变量读取（QCC_API_KEY / QCC_SECRET_KEY / JOB_BOARD_API_KEY），严禁硬编码；无 key 自动降级为 CSV/粘贴手工回填，功能不中断。取数经 ACL 防腐层唯一通道入库，低置信归属自动入人工消歧队列，回填后评分/雷达即时重算。
      </p>
    </section>
  );
}

export default function Connectors() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const { isAuthenticated, loading, user } = useAuth();
  const { data: registry } = trpc.park.connector.registry.useQuery(undefined, { enabled: isAuthenticated });
  const { data: jobs } = trpc.park.connector.jobs.useQuery({ limit: 30 }, { enabled: isAuthenticated });

  if (!loading && !isAuthenticated) {
    return (
      <ScreenLayout>
        <div className="px-10 py-16 text-center">
          <Database className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-[13px] text-muted-foreground">数据接入中心需要登录后访问</p>
          <Button className="mt-4" onClick={() => startLogin()}>登录</Button>
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <div className="px-10 pt-9 pb-8">
        <ScreenHeader num="接入" title="数据接入中心" desc="连接器注册表 · ACL 防腐层 · 实体解析引擎 · 摄入作业留痕（迭代17 · 工单1+2）" />
        <div className="mt-4">
          <Button onClick={() => setWizardOpen(true)} className="gap-1.5">
            <Upload className="w-4 h-4" /> 统一入库向导（证据级）
          </Button>
          <span className="ml-3 text-[11px] text-muted-foreground">声明来源 → 匹配企业 → 生成证据 → 冲突检测 → 可回滚</span>
        </div>
        <IngestionWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {(registry ?? []).map((c) => (
            <div key={c.cid} className="rounded-md border border-border bg-card/60 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-foreground">{c.name}</span>
                <StatusPill s={c.status} />
              </div>
              <div className="mt-1 text-[10.5px] text-muted-foreground leading-relaxed">{c.source}</div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>作业 <span className="font-mono-num font-bold text-foreground">{c.jobCount}</span> 次</span>
                {c.lastJob && <span>最近：<StatusPill s={c.lastJob.status} /> {c.lastJob.rowsOut}/{c.lastJob.rowsIn} 行</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
          <IngestPanel />
          <DisambiguationQueue />
        </div>
        <ExternalBackfillPanel isAdmin={user?.role === "admin"} />
        <section className="mt-6 rounded-md border border-border bg-card/60 p-4">
          <h2 className="font-serif-sc font-bold text-[14px] text-foreground">摄入作业留痕（ingestionJobs）</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-3">#</th><th className="py-1.5 pr-3">连接器</th><th className="py-1.5 pr-3">状态</th>
                  <th className="py-1.5 pr-3">入/出/跳过</th><th className="py-1.5 pr-3">触发人</th><th className="py-1.5">时间</th>
                </tr>
              </thead>
              <tbody>
                {(jobs ?? []).map((j) => (
                  <tr key={j.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-mono-num">{j.id}</td>
                    <td className="py-1.5 pr-3">{j.connectorId}</td>
                    <td className="py-1.5 pr-3"><StatusPill s={j.status} /></td>
                    <td className="py-1.5 pr-3 font-mono-num">{j.rowsIn}/{j.rowsOut}/{j.rowsSkipped}</td>
                    <td className="py-1.5 pr-3">{j.triggeredBy ?? "—"}</td>
                    <td className="py-1.5 font-mono-num text-muted-foreground">{new Date(j.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
                {(jobs ?? []).length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">暂无摄入作业记录</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </ScreenLayout>
  );
}
import IngestionWizard from "@/components/IngestionWizard";
