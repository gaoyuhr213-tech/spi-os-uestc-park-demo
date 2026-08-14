/* 规则中心（管理员专用）：在线调 12 维评分权重 / 分级阈值 / 管道匹配度 / 任务规则。
   迭代5：保存前影响预览（dry-run diff：X 家升级/降级）+ 操作台账查看。
   写 ruleConfigs 表即时生效，全看板自动联动；非管理员访问拦截。 */
import { useEffect, useMemo, useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import LedgerNote from "@/components/LedgerNote";
import FlywheelCard from "@/components/FlywheelCard";
import LearningLabCard from "@/components/LearningLabCard";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Eye, Loader2, ScrollText, ShieldAlert, RotateCcw, Save, SlidersHorizontal, X } from "lucide-react";

/** 影响预览返回结构（与后端 calcRuleImpact 对齐） */
interface ImpactData {
  upgraded: { eid: string; name: string; before: { score: number; tier: string }; after: { score: number; tier: string } }[];
  downgraded: { eid: string; name: string; before: { score: number; tier: string }; after: { score: number; tier: string } }[];
  scoreChanged: number;
  unchanged: number;
}

function NumField({ label, value, onChange, min = 0, max = 100, step = 1, w = "w-20" }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; w?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
      <span className="truncate">{label}</span>
      <input
        type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${w} rounded-sm border border-border bg-secondary/50 px-2 py-1 text-right font-mono-num text-[12.5px] text-foreground focus:outline-none focus:border-primary/60`}
      />
    </label>
  );
}

function SectionCard({ title, sub, children, onSave, onReset, saving, onPreview, previewing }: {
  title: string; sub: string; children: React.ReactNode; onSave: () => void; onReset: () => void; saving: boolean;
  onPreview?: () => void; previewing?: boolean;
}) {
  return (
    <section className="rounded-md border border-border bg-card/60 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif-sc font-bold text-[15px] text-foreground tracking-wide">{title}</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onReset} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]">
            <RotateCcw className="w-3 h-3" /> 恢复默认
          </button>
          {onPreview && (
            <button onClick={onPreview} disabled={previewing} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97] disabled:opacity-50">
              {previewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />} 影响预览
            </button>
          )}
          <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md border border-primary/50 bg-primary/10 px-3 py-1.5 text-[11.5px] font-medium text-foreground hover:bg-primary/20 transition-colors active:scale-[0.97] disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} 保存生效
          </button>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** 影响预览对话框：展示升级/降级差异，确认后才真正保存 */
function ImpactDialog({ impact, onConfirm, onClose, saving }: {
  impact: ImpactData; onConfirm: () => void; onClose: () => void; saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />
      <div className="relative w-full max-w-xl rounded-md border border-border bg-card shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-serif-sc font-bold text-[16px] text-foreground">规则修改影响预览</h3>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">基于当前全部企业 dry-run 试算，尚未落库 · 确认后才生效</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-3 text-center">
          <div className="rounded-md border border-border bg-secondary/40 py-2.5">
            <div className="font-mono-num font-extrabold text-[20px]" style={{ color: "var(--stage-won)" }}>{impact.upgraded.length}</div>
            <div className="text-[10.5px] text-muted-foreground">升级</div>
          </div>
          <div className="rounded-md border border-border bg-secondary/40 py-2.5">
            <div className="font-mono-num font-extrabold text-[20px]" style={{ color: "var(--tier-p0)" }}>{impact.downgraded.length}</div>
            <div className="text-[10.5px] text-muted-foreground">降级</div>
          </div>
          <div className="rounded-md border border-border bg-secondary/40 py-2.5">
            <div className="font-mono-num font-extrabold text-[20px] text-foreground">{impact.scoreChanged}</div>
            <div className="text-[10.5px] text-muted-foreground">仅分数变化</div>
          </div>
          <div className="rounded-md border border-border bg-secondary/40 py-2.5">
            <div className="font-mono-num font-extrabold text-[20px] text-muted-foreground">{impact.unchanged}</div>
            <div className="text-[10.5px] text-muted-foreground">不受影响</div>
          </div>
        </div>
        {impact.upgraded.length > 0 && (
          <div className="mt-4">
            <div className="text-[12px] font-medium text-foreground mb-1.5 inline-flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" style={{ color: "var(--stage-won)" }} /> 升级名单
            </div>
            <div className="space-y-1">
              {impact.upgraded.slice(0, 12).map((i) => (
                <div key={i.eid} className="flex items-center gap-2 text-[12px] rounded-sm bg-secondary/30 px-2.5 py-1.5">
                  <span className="flex-1 truncate text-foreground">{i.name}</span>
                  <span className="font-mono-num text-muted-foreground">{i.before.tier} {i.before.score}</span>
                  <span className="text-muted-foreground/60">→</span>
                  <span className="font-mono-num font-bold" style={{ color: "var(--stage-won)" }}>{i.after.tier} {i.after.score}</span>
                </div>
              ))}
              {impact.upgraded.length > 12 && <div className="text-[11px] text-muted-foreground">…另有 {impact.upgraded.length - 12} 家</div>}
            </div>
          </div>
        )}
        {impact.downgraded.length > 0 && (
          <div className="mt-4">
            <div className="text-[12px] font-medium text-foreground mb-1.5 inline-flex items-center gap-1">
              <ArrowDownRight className="w-3.5 h-3.5" style={{ color: "var(--tier-p0)" }} /> 降级名单
            </div>
            <div className="space-y-1">
              {impact.downgraded.slice(0, 12).map((i) => (
                <div key={i.eid} className="flex items-center gap-2 text-[12px] rounded-sm bg-secondary/30 px-2.5 py-1.5">
                  <span className="flex-1 truncate text-foreground">{i.name}</span>
                  <span className="font-mono-num text-muted-foreground">{i.before.tier} {i.before.score}</span>
                  <span className="text-muted-foreground/60">→</span>
                  <span className="font-mono-num font-bold" style={{ color: "var(--tier-p0)" }}>{i.after.tier} {i.after.score}</span>
                </div>
              ))}
              {impact.downgraded.length > 12 && <div className="text-[11px] text-muted-foreground">…另有 {impact.downgraded.length - 12} 家</div>}
            </div>
          </div>
        )}
        {impact.upgraded.length === 0 && impact.downgraded.length === 0 && (
          <p className="mt-4 text-[12.5px] text-muted-foreground">本次修改不会造成任何企业升级或降级{impact.scoreChanged > 0 ? `，仅 ${impact.scoreChanged} 家分数微调` : ""}。</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-border px-3.5 py-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">取消</button>
          <button onClick={onConfirm} disabled={saving} className="rounded-md border border-primary/50 bg-primary/10 px-4 py-2 text-[12px] font-medium text-foreground hover:bg-primary/20 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" /> : null}确认保存生效
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Rules() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.park.rules.get.useQuery(undefined, { enabled: isAdmin, retry: false });

  const [dims, setDims] = useState<{ name: string; weight: number }[]>([]);
  const [boost, setBoost] = useState<Record<string, number>>({});
  const [signal, setSignal] = useState<Record<string, number>>({});
  const [tiering, setTiering] = useState({ p0Min: 75, p1Min: 60, p2Min: 40, p0RequireSignal: true });
  const [pipe, setPipe] = useState<Record<string, number>>({});
  const [taskRules, setTaskRules] = useState({ touchedStallDays: 7, meetingStallDays: 14, p1NeedTier1Signal: true });
  /** 影响预览：pending 保存动作 + diff 结果 */
  const [impact, setImpact] = useState<ImpactData | null>(null);
  const [pendingSave, setPendingSave] = useState<null | (() => void)>(null);
  const [previewingKey, setPreviewingKey] = useState<string | null>(null);
  const [showLedger, setShowLedger] = useState(false);
  const [ledgerAction, setLedgerAction] = useState<string>("");
  const [ledgerActor, setLedgerActor] = useState<string>("");
  const [ledgerDays, setLedgerDays] = useState<number>(0);
  const [diffOpen, setDiffOpen] = useState<number | null>(null);
  const { data: ledger } = trpc.park.ledger.useQuery(
    { limit: 100, action: ledgerAction || undefined, actor: ledgerActor || undefined, sinceDays: ledgerDays || undefined },
    { enabled: isAdmin && showLedger, retry: false },
  );

  useEffect(() => {
    if (!data) return;
    setDims(data.scoring.dims.map((d) => ({ ...d })));
    setBoost({ ...data.scoring.enrichBoost });
    setSignal({ ...data.scoring.signalBoost });
    setTiering({ ...data.tiering });
    setPipe({ ...data.pipeMatch });
    if (data.tasks) setTaskRules({ ...data.tasks });
  }, [data]);

  const weightSum = useMemo(() => dims.reduce((s, d) => s + d.weight, 0), [dims]);

  const invalidateAll = () => {
    utils.park.snapshot.invalidate();
    utils.park.tasks.invalidate();
    utils.park.weeklyReview.invalidate();
    utils.park.rules.get.invalidate();
  };
  const onDone = (msg: string) => { toast.success(msg + " · 全看板已联动刷新"); invalidateAll(); setImpact(null); setPendingSave(null); };
  const onErr = (e: { message: string }) => toast.error(e.message || "保存失败");

  const saveScoring = trpc.park.rules.saveScoring.useMutation({ onSuccess: () => onDone("评分规则已保存"), onError: onErr });
  const saveTiering = trpc.park.rules.saveTiering.useMutation({ onSuccess: () => onDone("分级阈值已保存"), onError: onErr });
  const savePipe = trpc.park.rules.savePipeMatch.useMutation({ onSuccess: () => onDone("管道匹配已保存"), onError: onErr });
  const saveTasks = trpc.park.rules.saveTasks.useMutation({ onSuccess: () => onDone("任务规则已保存"), onError: onErr });
  const resetRule = trpc.park.rules.reset.useMutation({ onSuccess: () => onDone("已恢复默认"), onError: onErr });

  /** dry-run 影响预览：先试算差异，确认对话框中再执行 pendingSave */
  const runPreview = async (key: string, previewInput: Parameters<typeof utils.park.rules.preview.fetch>[0], save: () => void) => {
    setPreviewingKey(key);
    try {
      const res = await utils.park.rules.preview.fetch(previewInput);
      setImpact(res as ImpactData);
      setPendingSave(() => save);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "预览失败");
    } finally {
      setPreviewingKey(null);
    }
  };

  const scoringPayload = () => ({ dims, enrichBoost: boost as never, signalBoost: signal as never });

  /** 飞轮建议一键应用：把 patch 合入当前编辑态，再走既有 preview→confirm→save 流程 */
  const applyFlywheelSuggestion = (action: "signalBoost" | "tiering", patch: Record<string, number>) => {
    if (action === "signalBoost") {
      const nextSignal = { ...signal, ...patch };
      const payload = { dims, enrichBoost: boost as never, signalBoost: nextSignal as never };
      setSignal(nextSignal);
      if (weightSum !== 100) { toast.error(`12维权重之和必须等于100，当前 ${weightSum}`); return; }
      runPreview("scoring", { scoring: payload }, () => saveScoring.mutate(payload));
    } else {
      const nextTiering = { ...tiering, ...patch };
      setTiering(nextTiering);
      runPreview("tiering", { tiering: nextTiering }, () => saveTiering.mutate(nextTiering));
    }
  };

  if (authLoading) {
    return (
      <ScreenLayout>
        <div className="flex items-center justify-center h-[70vh] text-muted-foreground gap-2 text-[13px]">
          <Loader2 className="w-5 h-5 animate-spin" /> 正在校验访问权限…
        </div>
      </ScreenLayout>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return (
      <ScreenLayout>
        <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
          <ShieldAlert className="w-10 h-10 text-primary/70" />
          <div className="text-center">
            <div className="font-serif-sc font-bold text-[17px] text-foreground">规则中心 · 管理员专用</div>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground max-w-sm">
              评分权重与分级阈值属于敏感业务规则，仅限管理员在线调整。
              {!isAuthenticated ? "请先登录。" : "当前账号无管理员权限，请联系系统所有者授权。"}
            </p>
          </div>
          {!isAuthenticated && (
            <button onClick={() => startLogin()} className="rounded-md border border-primary/50 bg-primary/10 px-4 py-2 text-[12.5px] font-medium text-foreground hover:bg-primary/20 transition-colors active:scale-[0.97]">
              登录
            </button>
          )}
        </div>
      </ScreenLayout>
    );
  }

  if (isLoading || !data) {
    return (
      <ScreenLayout>
        <div className="flex items-center justify-center h-[70vh] text-muted-foreground gap-2 text-[13px]">
          <Loader2 className="w-5 h-5 animate-spin" /> {error ? `加载失败：${error.message}` : "正在加载规则配置…"}
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout>
      <div className="px-4 sm:px-6 lg:px-10 pt-6 lg:pt-9 pb-8 border-b border-border">
        <ScreenHeader
          num="规则"
          title="规则中心"
          desc={`管理员在线调整评分权重 / 分级阈值 / 管道匹配 · 保存后写入 ruleConfigs 即时生效，三屏全联动 · 当前生效版本：${
            data.versions.length > 0 ? data.versions.map((v) => `${v.key} v${v.version}`).join(" / ") : "全部默认 v1"
          }`}
          right={<span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><SlidersHorizontal className="w-3.5 h-3.5" /> 话术模板涉及敏感表述，不开放在线编辑</span>}
        />
      </div>

      <div className="px-4 sm:px-6 lg:px-10 py-6 lg:py-8 grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-6xl">
        {/* 12维权重 */}
        <SectionCard
          title="12 维评分权重"
          sub={`权重之和必须等于 100 · 当前合计：${weightSum}${weightSum !== 100 ? "（不合法，无法保存）" : ""}`}
          saving={saveScoring.isPending}
          previewing={previewingKey === "scoring"}
          onPreview={() => {
            if (weightSum !== 100) { toast.error(`12维权重之和必须等于100，当前 ${weightSum}`); return; }
            runPreview("scoring", { scoring: scoringPayload() }, () => saveScoring.mutate(scoringPayload()));
          }}
          onSave={() => {
            if (weightSum !== 100) { toast.error(`12维权重之和必须等于100，当前 ${weightSum}`); return; }
            runPreview("scoring", { scoring: scoringPayload() }, () => saveScoring.mutate(scoringPayload()));
          }}
          onReset={() => resetRule.mutate({ key: "scoring" })}
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {dims.map((d, i) => (
              <NumField key={d.name} label={d.name} value={d.weight} min={0} max={100}
                onChange={(v) => setDims((p) => p.map((x, j) => (j === i ? { ...x, weight: v } : x)))} w="w-16" />
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-border/60">
            <div className="text-[11.5px] font-medium text-foreground mb-2">富集修正加分</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <NumField label={`在招≥${boost.jobsHigh ?? 10} 加分`} value={boost.jobsHighBonus ?? 0} max={20} onChange={(v) => setBoost((p) => ({ ...p, jobsHighBonus: v }))} w="w-16" />
              <NumField label={`在招≥${boost.jobsMid ?? 5} 加分`} value={boost.jobsMidBonus ?? 0} max={20} onChange={(v) => setBoost((p) => ({ ...p, jobsMidBonus: v }))} w="w-16" />
              <NumField label={`专利≥${boost.patentsHigh ?? 10} 加分`} value={boost.patentsBonus ?? 0} max={20} onChange={(v) => setBoost((p) => ({ ...p, patentsBonus: v }))} w="w-16" />
              <NumField label={`参保≥${boost.insuredHigh ?? 50} 加分`} value={boost.insuredBonus ?? 0} max={20} onChange={(v) => setBoost((p) => ({ ...p, insuredBonus: v }))} w="w-16" />
              <NumField label="融资/股改加分" value={boost.fundingBonus ?? 0} max={20} onChange={(v) => setBoost((p) => ({ ...p, fundingBonus: v }))} w="w-16" />
              <NumField label="高企资质加分" value={boost.hiTechBonus ?? 0} max={20} onChange={(v) => setBoost((p) => ({ ...p, hiTechBonus: v }))} w="w-16" />
              <NumField label="已核验置信加分" value={boost.verifiedBonus ?? 0} max={20} onChange={(v) => setBoost((p) => ({ ...p, verifiedBonus: v }))} w="w-16" />
            </div>
            <div className="mt-3 text-[11.5px] font-medium text-foreground mb-2">信号加分</div>
            <div className="grid grid-cols-3 gap-x-6 gap-y-2">
              <NumField label="Tier-1/条" value={signal.tier1 ?? 4} max={20} onChange={(v) => setSignal((p) => ({ ...p, tier1: v }))} w="w-14" />
              <NumField label="Tier-2/条" value={signal.tier2 ?? 2} max={20} onChange={(v) => setSignal((p) => ({ ...p, tier2: v }))} w="w-14" />
              <NumField label="封顶" value={signal.max ?? 10} max={40} onChange={(v) => setSignal((p) => ({ ...p, max: v }))} w="w-14" />
            </div>
          </div>
        </SectionCard>

        <div className="space-y-6">
          {/* 分级阈值 */}
          <SectionCard
            title="Tier 分级阈值"
            sub="必须满足 P0 > P1 > P2 · 保存前自动试算升降级影响"
            saving={saveTiering.isPending}
            previewing={previewingKey === "tiering"}
            onPreview={() => {
              if (!(tiering.p0Min > tiering.p1Min && tiering.p1Min > tiering.p2Min)) { toast.error("阈值必须满足 P0 > P1 > P2"); return; }
              runPreview("tiering", { tiering }, () => saveTiering.mutate(tiering));
            }}
            onSave={() => {
              if (!(tiering.p0Min > tiering.p1Min && tiering.p1Min > tiering.p2Min)) { toast.error("阈值必须满足 P0 > P1 > P2"); return; }
              runPreview("tiering", { tiering }, () => saveTiering.mutate(tiering));
            }}
            onReset={() => resetRule.mutate({ key: "tiering" })}
          >
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              <NumField label="P0 立即触达 ≥" value={tiering.p0Min} onChange={(v) => setTiering((p) => ({ ...p, p0Min: v }))} />
              <NumField label="P1 重点培育 ≥" value={tiering.p1Min} onChange={(v) => setTiering((p) => ({ ...p, p1Min: v }))} />
              <NumField label="P2 机会型 ≥" value={tiering.p2Min} onChange={(v) => setTiering((p) => ({ ...p, p2Min: v }))} />
              <label className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground">
                <span>P0 需至少一条信号</span>
                <input type="checkbox" checked={tiering.p0RequireSignal} onChange={(e) => setTiering((p) => ({ ...p, p0RequireSignal: e.target.checked }))} className="w-4 h-4 accent-primary" />
              </label>
            </div>
          </SectionCard>

          {/* 管道匹配 */}
          <SectionCard
            title="信软管道匹配度"
            sub="行业 → 供给管道匹配度（0-100）· 驱动屏二横轴与匹配率 KPI"
            saving={savePipe.isPending}
            previewing={previewingKey === "pipeMatch"}
            onPreview={() => runPreview("pipeMatch", { pipeMatch: pipe }, () => savePipe.mutate(pipe))}
            onSave={() => runPreview("pipeMatch", { pipeMatch: pipe }, () => savePipe.mutate(pipe))}
            onReset={() => resetRule.mutate({ key: "pipeMatch" })}
          >
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {Object.entries(pipe).map(([ind, v]) => (
                <NumField key={ind} label={ind} value={v} onChange={(nv) => setPipe((p) => ({ ...p, [ind]: nv }))} w="w-16" />
              ))}
            </div>
          </SectionCard>

          {/* 任务规则（迭代5：Law-05 配置优于定制） */}
          <SectionCard
            title="触达任务规则"
            sub="任务清单推演阈值 · 保存后任务页即时重算（不影响评分，无需预览）"
            saving={saveTasks.isPending}
            onSave={() => saveTasks.mutate(taskRules)}
            onReset={() => resetRule.mutate({ key: "tasks" })}
          >
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              <NumField label="已触达超期复访（天）" value={taskRules.touchedStallDays} min={1} max={90} onChange={(v) => setTaskRules((p) => ({ ...p, touchedStallDays: v }))} />
              <NumField label="已约见超期推进（天）" value={taskRules.meetingStallDays} min={1} max={180} onChange={(v) => setTaskRules((p) => ({ ...p, meetingStallDays: v }))} />
              <label className="flex items-center justify-between gap-3 text-[12px] text-muted-foreground col-span-2">
                <span>P1 培育跟进要求 Tier-1 信号</span>
                <input type="checkbox" checked={taskRules.p1NeedTier1Signal} onChange={(e) => setTaskRules((p) => ({ ...p, p1NeedTier1Signal: e.target.checked }))} className="w-4 h-4 accent-primary" />
              </label>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* 操作台账（轻量 Decision Ledger） */}
      {/* 迭代11 · 学习飞轮：命中统计 + 校准建议一键应用（走影响预览） + 连接器状态 */}
      <div className="px-4 sm:px-6 lg:px-10 pb-4 max-w-6xl">
        <FlywheelCard onApply={applyFlywheelSuggestion} />
      </div>

      {/* 迭代22 · 工单9 · 学习引擎实验台（champion-challenger + 人审晋升 + 血缘） */}
      <div className="px-4 sm:px-6 lg:px-10 pb-4 max-w-6xl">
        <LearningLabCard />
      </div>

      <div className="px-4 sm:px-6 lg:px-10 pb-4 max-w-6xl">
        <button
          onClick={() => setShowLedger((s) => !s)}
          className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <ScrollText className="w-3.5 h-3.5" /> {showLedger ? "收起操作台账" : "查看操作台账（全链路审计 · 可检索）"}
        </button>
        {showLedger && (
          <>
            {/* 检索条：行为 / 操作人 / 时间范围 */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={ledgerAction}
                onChange={(e) => setLedgerAction(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-[11.5px] text-foreground"
              >
                <option value="">全部行为</option>
                {["rule_save", "rule_reset", "import", "stage_mark", "task_done", "task_undone", "export", "ai_ask", "weekly_digest", "seed"].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <input
                value={ledgerActor}
                onChange={(e) => setLedgerActor(e.target.value)}
                placeholder="按操作人筛选…"
                className="rounded-md border border-border bg-background px-2 py-1.5 text-[11.5px] text-foreground w-36"
              />
              <select
                value={ledgerDays}
                onChange={(e) => setLedgerDays(Number(e.target.value))}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-[11.5px] text-foreground"
              >
                <option value={0}>全部时间</option>
                <option value={1}>近 1 天</option>
                <option value={7}>近 7 天</option>
                <option value={30}>近 30 天</option>
              </select>
              <span className="text-[11px] text-muted-foreground/70">{(ledger ?? []).length} 条记录 · 只增不改，满足政企合规追溯</span>
            </div>
            <div className="mt-2 rounded-md border border-border bg-card/60 divide-y divide-border/60 max-h-80 overflow-y-auto">
              {(ledger ?? []).length === 0 && <div className="px-4 py-5 text-[12px] text-muted-foreground text-center">暂无匹配的台账记录</div>}
              {(ledger ?? []).map((l) => (
                <div key={l.id}>
                  <div className="px-4 py-2 flex items-center gap-3 text-[11.5px]">
                    <span className="font-mono-num text-muted-foreground/70 w-32 flex-none">{new Date(l.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="rounded-sm bg-secondary/60 px-1.5 py-0.5 text-[10.5px] text-muted-foreground flex-none">{l.action}</span>
                    <span className="text-foreground truncate flex-1">{l.detail ?? "—"}</span>
                    <span className="text-muted-foreground/70 flex-none">{l.actor ?? "—"}</span>
                    {(l.beforeJson || l.afterJson) && (
                      <button
                        onClick={() => setDiffOpen(diffOpen === l.id ? null : l.id)}
                        className="flex-none text-[10.5px] text-primary hover:underline"
                      >
                        {diffOpen === l.id ? "收起变更" : "变更内容"}
                      </button>
                    )}
                  </div>
                  {diffOpen === l.id && (
                    <div className="px-4 pb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="rounded-sm border border-border/70 bg-secondary/30 p-2">
                        <div className="text-[10px] text-muted-foreground mb-1">变更前</div>
                        <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all max-h-36 overflow-y-auto">{l.beforeJson ? JSON.stringify(JSON.parse(l.beforeJson), null, 1) : "（无 · 首次配置）"}</pre>
                      </div>
                      <div className="rounded-sm border border-primary/30 bg-primary/[0.05] p-2">
                        <div className="text-[10px] text-primary mb-1">变更后</div>
                        <pre className="text-[10px] text-foreground whitespace-pre-wrap break-all max-h-36 overflow-y-auto">{l.afterJson ? JSON.stringify(JSON.parse(l.afterJson), null, 1) : "—"}</pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="px-4 sm:px-6 lg:px-10 pb-8 max-w-6xl">
        <LedgerNote extra="规则修改需先通过影响预览确认升降级差异（dry-run 不落库）；修改全程留痕（版本号自增 + 操作人 + 台账）；话术模板与规则明细仅后端持有。" />
      </div>

      {impact && pendingSave && (
        <ImpactDialog
          impact={impact}
          saving={saveScoring.isPending || saveTiering.isPending || savePipe.isPending}
          onConfirm={() => pendingSave()}
          onClose={() => { setImpact(null); setPendingSave(null); }}
        />
      )}
    </ScreenLayout>
  );
}
