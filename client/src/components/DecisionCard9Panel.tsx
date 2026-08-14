/* V3 波次一 · 九要素 Decision Card 展开面板（Decision Provenance）
   证据链（分渠道）→ 置信度分解 → 风险 → 机会窗口 → 行动 → 影响 → 学习/反事实
   全部数据来自 park.decision.card9，前端零计算。 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useMaskStore } from "@/lib/park";
import { Loader2, ShieldAlert, TrendingUp, Target, Zap, BookOpen, GitBranch, History } from "lucide-react";

const KIND_COLOR: Record<string, string> = {
  signal: "#C8102E", enrich: "#0E9F6E", rule: "#3B82F6", ai: "#8B5CF6",
  human: "#D97706", stage: "#8496B4", learning: "#0891B2",
};
const SEV_CLS: Record<string, string> = {
  high: "bg-red-500/10 text-red-600 border-red-500/30",
  mid: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  low: "bg-secondary text-muted-foreground border-border",
};

export default function DecisionCard9Panel({ decisionId, zh }: { decisionId: number; zh: boolean }) {
  const mask = useMaskStore((s) => s.mask);
  const { data: c, isLoading } = trpc.park.decision.card9.useQuery({ id: decisionId, mask }, { staleTime: 15_000 });
  if (isLoading) return <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-3"><Loader2 className="w-3.5 h-3.5 animate-spin" />{zh ? "构建决策溯源链…" : "Building provenance…"}</div>;
  if (!c) return null;
  return (
    <div className="mt-2 rounded-md border border-primary/25 bg-primary/[0.03] p-3.5 space-y-3.5 text-[12px]">
      {/* ①④ Score + Confidence 头行 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="font-mono-num font-extrabold text-[22px] leading-none text-foreground">{c.score}<span className="text-[11px] font-normal text-muted-foreground ml-1">{zh ? "决策分" : "Decision Score"}</span></span>
        <span className="font-mono-num font-extrabold text-[22px] leading-none" style={{ color: c.confidence >= 70 ? "#0E9F6E" : c.confidence >= 50 ? "#D97706" : "#C8102E" }}>
          {c.confidence}<span className="text-[11px] font-normal text-muted-foreground ml-1">{zh ? "置信度" : "Confidence"}</span>
        </span>
        <span className="text-[10.5px] text-muted-foreground">{zh ? "决策分=星级×置信度合成；区别于 Lead 分（企业价值）" : "Decision score ≠ lead score"}</span>
      </div>
      {/* ④ Confidence 分渠道 */}
      <div>
        <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1"><GitBranch className="w-3 h-3" />{zh ? "置信度分解（分渠道加权）" : "Confidence breakdown"}</div>
        <div className="space-y-1">
          {c.confidenceBreakdown.map((b) => (
            <div key={b.channel} className="flex items-center gap-2">
              <span className="w-16 flex-none text-[11px] text-muted-foreground">{b.channel}</span>
              <div className="flex-1 h-2 rounded-sm bg-secondary/70 overflow-hidden">
                <div className="h-full rounded-sm" style={{ width: `${b.value}%`, background: b.value >= 70 ? "#0E9F6E" : b.value >= 40 ? "#D97706" : "#C8102E", opacity: 0.85 }} />
              </div>
              <span className="w-8 flex-none font-mono-num text-[11px] text-foreground text-right">{b.value}</span>
              <span className="w-10 flex-none text-[10px] text-muted-foreground/70">w{b.weight}</span>
              <span className="hidden md:block flex-none text-[10px] text-muted-foreground/70 max-w-[180px] truncate" title={b.note}>{b.note}</span>
            </div>
          ))}
        </div>
      </div>
      {/* ② Evidence 证据链 */}
      <div>
        <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{zh ? "证据链（Evidence · 可追溯）" : "Evidence chain"}</div>
        <div className="space-y-1">
          {c.evidence.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="flex-none rounded px-1.5 py-px text-[10px] font-medium text-white mt-px" style={{ background: KIND_COLOR[e.kind] ?? "#64748B" }}>{e.kindLabel}</span>
              <span className="text-foreground leading-snug min-w-0">{e.text}
                <span className="text-[10px] text-muted-foreground/70 ml-1.5">· {e.sourceNote} · w{e.weight}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* ⑤⑥ Risk + Opportunity 双栏 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />{zh ? "风险（Risk）" : "Risk"}</div>
          <div className="space-y-1">
            {c.risks.map((r, i) => (
              <div key={i} className={`rounded border px-2 py-1 text-[11px] leading-snug ${SEV_CLS[r.severity]}`}>{r.text}</div>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1"><Zap className="w-3 h-3" />{zh ? "机会窗口（Opportunity）" : "Opportunity"}</div>
          <div className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] leading-snug text-foreground">
            <span className="font-mono-num font-bold text-emerald-600 mr-1.5">{c.opportunity.window}</span>{c.opportunity.text}
          </div>
          <div className="mt-2 text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><Target className="w-3 h-3" />{zh ? "下一步（Action）" : "Action"}</div>
          <div className="text-[11px] leading-snug text-foreground">{c.action.next}
            <div className="text-muted-foreground mt-0.5">{zh ? "负责人" : "Owner"}：{c.action.owner} · {zh ? "首选资源" : "Resource"}：{c.action.resourceHint}</div>
          </div>
        </div>
      </div>
      {/* ⑧ Impact */}
      <div>
        <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" />{zh ? "预期影响（Impact）" : "Impact"}</div>
        <div className="text-[11px] leading-snug text-foreground">
          {c.impact.revenueTierLabel} · {c.impact.estValue}
          <div className="text-muted-foreground mt-0.5">{zh ? "园区面" : "Park"}：{c.impact.parkEffect}</div>
        </div>
      </div>
      {/* ⑨ Learning + Counterfactual */}
      <div className="rounded-sm border border-border/70 bg-secondary/40 px-2.5 py-2">
        <div className="text-[10.5px] font-medium text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><BookOpen className="w-3 h-3" />{zh ? "学习回流 + 反事实（若不采纳）" : "Learning + Counterfactual"}</div>
        <div className="text-[11px] leading-snug text-foreground">{c.learning.historyNote}</div>
        <div className="text-[11px] leading-snug text-muted-foreground mt-1">{c.learning.counterfactual}</div>
      </div>
      {/* 迭代18 · 工单3 · 全链溯源（trace） */}
      <TraceBlock decisionId={decisionId} zh={zh} />
    </div>
  );
}

/* ---------- 迭代18 · 工单3 · 决策全链溯源区块 ---------- */
function TraceBlock({ decisionId, zh }: { decisionId: number; zh: boolean }) {
  const mask = useMaskStore((s) => s.mask);
  const [open, setOpen] = useState(false);
  const { data: t, isLoading } = trpc.park.decision.trace.useQuery(
    { id: decisionId, mask }, { enabled: open, staleTime: 15_000 },
  );
  return (
    <div className="border-t border-border/60 pt-2">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:opacity-75 transition-opacity">
        <History className="w-3.5 h-3.5" />
        {zh ? (open ? "收起全链溯源" : "全链溯源：数据 → 规则 → 评分 → 决策 → 执行 → 结果") : "Full trace"}
      </button>
      {open && isLoading && <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />{zh ? "回溯中…" : "Tracing…"}</div>}
      {open && t && (
        <div className="mt-2.5 space-y-2.5 text-[11px]">
          {!t.hasProvenance && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10.5px] text-amber-600">
              {zh ? "该决策创建于溯源链上线前，以下为按当前数据重建的近似链路（明示，不伪造）。" : "Reconstructed trace (created before provenance)."}
            </div>
          )}
          {/* ① 数据层 */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">① {zh ? "数据层 · 信号与画布" : "Data"}</div>
            <div className="flex flex-wrap gap-1">
              {t.data.signals.map((s, i) => (
                <span key={i} className="rounded-sm bg-secondary/70 px-1.5 py-0.5 text-[10px] text-foreground">{s.t} <span className="text-muted-foreground/70">T{s.tier} · {s.d}</span></span>
              ))}
            </div>
            <div className="mt-1 text-[10.5px] text-muted-foreground">
              {zh ? "生命周期" : "Lifecycle"}: {t.data.lifecycle}
              {Object.keys(t.data.canvas).length > 0 && <> · {zh ? "需求画布" : "Canvas"}: {Object.entries(t.data.canvas).map(([k, v]) => `${k}${v}★`).join(" ")}</>}
            </div>
          </div>
          {/* ② 规则层（版本漂移） */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">② {zh ? "规则层 · 版本快照" : "Rules"}</div>
            <div className="flex flex-wrap gap-1">
              {t.rules.hit.map((r) => <span key={r} className="rounded-sm bg-blue-500/10 text-blue-600 px-1.5 py-0.5 text-[10px] font-mono">{r}</span>)}
            </div>
            {Object.keys(t.rules.versionsAtCreation).length > 0 && (
              <div className="mt-1 text-[10.5px] text-muted-foreground">
                {Object.entries(t.rules.versionsAtCreation).map(([k, v]) => {
                  const now = t.rules.versionsNow[k];
                  const drift = now !== undefined && now !== v;
                  return <span key={k} className={`mr-2 ${drift ? "text-amber-600 font-medium" : ""}`}>{k}: v{v}{drift ? ` → v${now}（${zh ? "已漂移" : "drift"}）` : ""}</span>;
                })}
              </div>
            )}
          </div>
          {/* ③ 评分层 */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">③ {zh ? "评分层 · 创建时 vs 当前" : "Score"}</div>
            <div className="text-[10.5px] text-foreground">
              {t.score.atCreation ? `${zh ? "创建时" : "At creation"}: ${t.score.atCreation.lead}/${t.score.atCreation.tier}` : (zh ? "创建时评分未快照" : "—")}
              {t.score.now && <span className="text-muted-foreground"> · {zh ? "当前" : "Now"}: {t.score.now.lead}/{t.score.now.tier}</span>}
            </div>
          </div>
          {/* ④ 执行层 */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">④ {zh ? "执行层 · 状态流转与业务轨迹" : "Execution"}</div>
            <div className="space-y-0.5 max-h-[140px] overflow-y-auto pr-1">
              {t.execution.length === 0 && <div className="text-[10.5px] text-muted-foreground">{zh ? "尚无执行动作" : "No actions yet"}</div>}
              {t.execution.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-[10.5px]">
                  <span className="flex-none font-mono text-muted-foreground/70">{new Date(e.at).toLocaleString()}</span>
                  <span className="flex-none rounded bg-secondary/70 px-1 text-[9.5px] text-muted-foreground">{e.action}</span>
                  <span className="text-foreground min-w-0 truncate" title={e.detail ?? ""}>{e.detail}</span>
                </div>
              ))}
            </div>
          </div>
          {/* ⑤ 结果层 */}
          <div>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">⑤ {zh ? "结果层" : "Outcome"}</div>
            <div className="text-[10.5px] text-foreground">
              {zh ? "状态" : "Status"}: {t.outcome.status}
              {t.outcome.outcome && <> · {zh ? "结果" : "Result"}: {t.outcome.outcome}{t.outcome.dealAmount ? ` · ¥${t.outcome.dealAmount.toLocaleString()}` : ""}</>}
              {t.outcome.note && <span className="text-muted-foreground"> · {t.outcome.note}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
