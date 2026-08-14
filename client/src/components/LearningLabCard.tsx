/* 迭代22 · 工单9 · 学习引擎实验台（规则中心）
 * champion（在线权重基线）→ 生成 challenger（白盒重估，不上线）→ 回测对照 → 人审晋升（写 scoring 新版本，可回滚）。
 * 硬约束：晋升必须管理员显式操作；全程台账留痕。 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { FlaskConical, Loader2, ChevronDown, ChevronUp, GitBranch, ShieldCheck } from "lucide-react";

export default function LearningLabCard() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [expandId, setExpandId] = useState<number | null>(null);
  const { data: champ } = trpc.park.learning.champion.useQuery(undefined, { enabled: open, staleTime: 30_000 });
  const { data: models } = trpc.park.learning.models.useQuery(undefined, { enabled: open, staleTime: 30_000 });
  const invalidate = () => { utils.park.learning.invalidate(); };
  const propose = trpc.park.learning.propose.useMutation({
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.error ?? "生成失败"); return; }
      toast.success(`challenger 已生成（${r.modelKey}）：样本 ${r.sampleSize} 条 · 回测完成 · 未上线，待人审`);
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const promote = trpc.park.learning.promote.useMutation({
    onSuccess: (r) => {
      if (!r.ok) { toast.error(r.error ?? "晋升失败"); return; }
      toast.success(`已晋升为 champion（scoring v${r.newVersion}）——全站评分即时生效，可在规则中心回滚`);
      invalidate();
      utils.park.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const archive = trpc.park.learning.archive.useMutation({
    onSuccess: () => { toast.success("已淘汰"); invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const challengers = (models ?? []).filter((m) => m.role === "challenger");
  const history = (models ?? []).filter((m) => m.role !== "challenger");

  return (
    <div className="rounded-md border border-border bg-card/60 p-4">
      <button onClick={() => setOpen((s) => !s)} className="flex w-full items-center gap-2 text-left">
        <FlaskConical className="w-4 h-4 text-primary" />
        <span className="font-serif-sc font-bold text-[13.5px] text-foreground">学习引擎 · Champion-Challenger 实验台</span>
        <span className="text-[10.5px] text-muted-foreground">工单9 · 结果回流 → 白盒权重重估 → 回测对照 → 人审晋升（不自动上线）</span>
        {open ? <ChevronUp className="ml-auto w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="ml-auto w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {/* champion 基线 */}
          <div className="rounded border border-border/60 bg-background/40 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-medium text-foreground">Champion（在线基线）</span>
              <span className="text-[10.5px] text-muted-foreground">{champ?.isDefault ? "默认权重（尚未学习调整）" : "已含学习调整"}</span>
              <span className="ml-auto text-[10.5px] text-muted-foreground">
                结果样本 {champ?.outcomeSamples ?? 0} 条（成交 {champ?.wonCount ?? 0} / 流失 {champ?.lostCount ?? 0}）
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(champ?.dims ?? []).map((d) => (
                <span key={d.name} className="rounded bg-secondary/60 px-1.5 py-px text-[10px] text-muted-foreground">{d.name} w{d.weight}</span>
              ))}
            </div>
          </div>

          <button onClick={() => propose.mutate()} disabled={propose.isPending}
            className="rounded bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90 active:scale-[0.97] transition disabled:opacity-50">
            {propose.isPending ? <Loader2 className="w-3.5 h-3.5 inline animate-spin mr-1" /> : <GitBranch className="w-3.5 h-3.5 inline mr-1 -mt-px" />}
            生成 Challenger（重估 + 回测，不上线）
          </button>

          {/* challenger 候选 */}
          {challengers.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-medium text-muted-foreground">Challenger 候选（{challengers.length}）· 晋升需人审</div>
              {challengers.map((m) => (
                <div key={m.id} className="rounded border border-primary/30 bg-primary/[0.04] p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <span className="font-mono text-[10.5px] text-muted-foreground">{m.modelKey}</span>
                    {m.backtest && (
                      <span className={`rounded px-1.5 py-px text-[10px] font-medium ${m.backtest.verdict === "challenger_better" ? "bg-emerald-500/10 text-emerald-600" : m.backtest.verdict === "champion_better" ? "bg-red-500/10 text-red-500" : "bg-secondary text-muted-foreground"}`}>
                        {m.backtest.verdict === "challenger_better" ? "回测优于 Champion" : m.backtest.verdict === "champion_better" ? "回测劣于 Champion" : "回测持平"}
                      </span>
                    )}
                    <span className="ml-auto flex gap-1.5">
                      <button onClick={() => setExpandId(expandId === m.id ? null : m.id)}
                        className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground transition">{expandId === m.id ? "收起" : "详情/血缘"}</button>
                      <button onClick={() => { if (confirm("确认晋升为 Champion？将写入 scoring 新版本并全站生效（可回滚）。")) promote.mutate({ modelId: m.id }); }} disabled={promote.isPending}
                        className="rounded bg-emerald-600 px-2 py-0.5 text-[10.5px] font-medium text-white hover:opacity-90 active:scale-[0.97] transition disabled:opacity-50">人审晋升</button>
                      <button onClick={() => archive.mutate({ modelId: m.id })} disabled={archive.isPending}
                        className="rounded border border-red-500/40 px-2 py-0.5 text-[10.5px] text-red-500 hover:bg-red-500/10 transition">淘汰</button>
                    </span>
                  </div>
                  {m.backtest && (
                    <div className="mt-1.5 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded bg-background/60 px-2 py-1.5">
                        <span className="text-muted-foreground">Champion：</span>命中率 {(m.backtest.champion.hitRate * 100).toFixed(0)}% · 分离度 {m.backtest.champion.separation}
                      </div>
                      <div className="rounded bg-background/60 px-2 py-1.5">
                        <span className="text-muted-foreground">Challenger：</span>命中率 {(m.backtest.challenger.hitRate * 100).toFixed(0)}% · 分离度 {m.backtest.challenger.separation}
                      </div>
                    </div>
                  )}
                  {expandId === m.id && (
                    <div className="mt-2 space-y-1.5 text-[11px]">
                      <div className="text-muted-foreground">权重调整（可解释）：{m.explanation || "无显著调整"}</div>
                      <div className="flex flex-wrap gap-1">
                        {m.weights.map((w) => (
                          <span key={w.name} className="rounded bg-secondary/60 px-1.5 py-px text-[10px] text-muted-foreground">{w.name} w{w.weight}</span>
                        ))}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70">
                        血缘：{m.lineage.method} · 训练样本 {m.lineage.sampleSize} 条（决策 #{(m.lineage.sourceDecisionIds ?? []).slice(0, 8).join(", #")}{(m.lineage.sourceDecisionIds ?? []).length > 8 ? "…" : ""}）· 阈值 ±{m.lineage.gapThreshold} · 调幅封顶 ±{m.lineage.capPct}%
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 历史（champion / archived） */}
          {history.length > 0 && (
            <div className="text-[10.5px] text-muted-foreground">
              历史模型：{history.map((m) => `${m.modelKey}（${m.role === "champion" ? "在线" : "已归档"}${m.promotedBy ? ` · 晋升人 ${m.promotedBy}` : ""}）`).join(" · ")}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/70">
            硬约束：challenger 仅回测不上线；晋升必须管理员确认（写 ruleConfigs scoring 新版本，规则中心可回滚）；重估方法为白盒维度区分力对比，每项调整附人话解释；血缘全记录。
          </p>
        </div>
      )}
    </div>
  );
}
