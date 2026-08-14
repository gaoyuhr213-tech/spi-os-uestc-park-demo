/* V3 波次四 · 治理域：组织记忆 / Multi-Agent 运行台 / Decision Marketplace
   对标：Palantir Ontology 视图 / Agentforce Agent Builder / AppExchange。
   一页三 Tab，控制导航膨胀（Hard Constraint：减少上下文切换）。 */
import { useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import { trpc } from "@/lib/trpc";
import { useMaskStore } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { Brain, Bot, Store, Loader2, Search, ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

const KIND_COLOR: Record<string, string> = {
  ledger: "#64748B", decision: "#C8102E", parse: "#D97706", stage: "#0E9F6E", task: "#3B82F6",
};
const LOOP_ORDER = ["Signal", "Evidence", "Decision", "Execution", "Outcome", "Learning → Policy Update"];

export default function Governance() {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const mask = useMaskStore((s) => s.mask);
  const [tab, setTab] = useState<"memory" | "agents" | "market" | "authz">("memory");
  const [tab2, setTab2] = [tab, setTab] as any; // alias for type widening
  const [q, setQ] = useState(""); void tab2;

  const { data: mem, isLoading: memLoading } = trpc.park.decision.memorySearch.useQuery(
    { q: q || undefined, limit: 60, mask }, { enabled: tab === "memory", staleTime: 10_000 },
  );
  const { data: stats } = trpc.park.decision.memoryStats.useQuery(undefined, { enabled: tab === "memory", staleTime: 30_000 });
  const { data: agents, isLoading: agLoading } = trpc.park.decision.agentBoard.useQuery(undefined, { enabled: tab === "agents", staleTime: 30_000 });
  const { data: market, isLoading: mkLoading } = trpc.park.decision.marketplace.useQuery(undefined, { enabled: tab === "market", staleTime: 60_000 });
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <ScreenLayout>
      <div className="px-6 md:px-10 pt-8 pb-12">
        <ScreenHeader
          num={zh ? "治理" : "Gov"}
          title={zh ? "平台治理 · Memory / Agents / Marketplace" : "Governance"}
          desc={zh ? "组织记忆：全平台动作沉淀为长期记忆，AI 自动引用；Agent 运行台：8 个 Agent 的职责/输入/输出/协作与最近活动；Marketplace：已沉淀能力的商品化目录（平台生态雏形）。" : "Memory / Agent board / Marketplace."}
        />

        <div className="mt-6 flex flex-wrap rounded-md border border-border overflow-hidden w-fit">
          {([["memory", zh ? "组织记忆" : "Memory", Brain], ["agents", zh ? "Agent 运行台" : "Agents", Bot], ["market", "Marketplace", Store], ["authz", zh ? "安全合规" : "Authz", ShieldCheck], ["conflicts", zh ? "冲突中心" : "Conflicts", AlertTriangle], ["sources", zh ? "数据来源" : "Sources", Database], ["batches", zh ? "入库批次" : "Batches", Layers]] as const).map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k as any)}
              className={`flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-medium transition-colors ${tab === k ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent"}`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>

        {/* ===== 组织记忆 ===== */}
        {tab === "memory" && (
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={zh ? "检索记忆：企业名 / 动作 / 负责人…" : "Search memory…"}
                  className="rounded-md border border-border bg-secondary/40 pl-8 pr-3 py-2 text-[12.5px] text-foreground w-72 focus:outline-none focus:ring-1 focus:ring-primary/50" />
              </div>
              {stats && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{zh ? "记忆总量" : "Total"} <span className="font-mono-num font-bold text-foreground">{stats.total}</span></span>
                  {stats.byKind.map((k) => <span key={k.kind}>{k.kind} <span className="font-mono-num text-foreground">{k.n}</span></span>)}
                </div>
              )}
            </div>
            {memLoading && <div className="mt-5 flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{zh ? "检索中…" : "Loading…"}</div>}
            <div className="mt-4 space-y-1.5">
              {mem?.map((m, i) => (
                <div key={i} className="flex items-start gap-3 rounded-md border border-border/70 bg-card/50 px-3.5 py-2">
                  <span className="flex-none mt-1 w-2 h-2 rounded-full" style={{ background: KIND_COLOR[m.kind] }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 text-[12px]">
                      <span className="text-[10.5px] rounded bg-secondary/70 px-1.5 py-px text-muted-foreground">{m.kindLabel}</span>
                      {m.entity && <span className="font-medium text-foreground">{m.entity}</span>}
                      <span className="text-muted-foreground truncate">{m.summary}</span>
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-muted-foreground/70">
                      {new Date(m.ts).toLocaleString()}{m.actor ? ` · ${m.actor}` : ""}
                    </div>
                  </div>
                </div>
              ))}
              {mem && mem.length === 0 && <div className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[12px] text-muted-foreground">{zh ? "无匹配记忆" : "No match"}</div>}
            </div>
            <p className="mt-4 text-[10.5px] text-muted-foreground/70 leading-relaxed max-w-2xl">
              {zh ? "记忆来源：操作台账 / 决策全生命周期 / 情报解析快照 / 状态推进 / 任务打卡（只增不改）。AI 助手与决策生成引擎自动引用同一记忆库——企业360「历史」Tab 即该记忆的单企业视图。" : ""}
            </p>
          </div>
        )}

        {/* ===== Agent 运行台 ===== */}
        {tab === "agents" && (
          <div className="mt-5">
            {agLoading && <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>}
            {/* Decision Loop 泳道 */}
            <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground mb-4">
              {LOOP_ORDER.map((s, i) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className="rounded bg-secondary/70 px-2 py-0.5">{s}</span>
                  {i < LOOP_ORDER.length - 1 && <ArrowRight className="w-3 h-3" />}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {agents?.map((a) => (
                <div key={a.aid} className="rounded-md border border-border bg-card/60 p-4">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-primary flex-none" />
                    <span className="font-medium text-[13.5px] text-foreground">{a.name}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{a.nameEn}</span>
                    <span className={`ml-auto flex-none rounded px-1.5 py-px text-[10px] font-medium ${a.status === "running" ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>
                      {a.status === "running" ? (zh ? "运行中" : "Running") : "Planned"}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[11.5px] text-muted-foreground leading-snug">{a.role}</div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-[10.5px]">
                    <div>
                      <div className="text-muted-foreground/70 uppercase tracking-wide mb-0.5">{zh ? "输入" : "In"}</div>
                      {a.inputs.map((x) => <div key={x} className="text-muted-foreground">· {x}</div>)}
                    </div>
                    <div>
                      <div className="text-muted-foreground/70 uppercase tracking-wide mb-0.5">{zh ? "输出" : "Out"}</div>
                      {a.outputs.map((x) => <div key={x} className="text-muted-foreground">· {x}</div>)}
                    </div>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-border/60 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground/80">
                    <span>{zh ? "环节" : "Stage"}: <span className="text-primary">{a.loopStage}</span></span>
                    <span>{zh ? "协作" : "Collab"}: {a.collaborators.join(" / ")}</span>
                    <span className="w-full">{zh ? "引擎" : "Engine"}: <span className="font-mono text-[10px]">{a.engine}</span></span>
                    {a.lastActivity && <span className="w-full">{zh ? "最近活动" : "Last"}: {a.lastActivity.text} · {new Date(a.lastActivity.ts).toLocaleString()}</span>}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10.5px] text-muted-foreground/70 max-w-2xl leading-relaxed">
              {zh ? "人在环宪法：所有 Agent 只产出建议与证据，采纳 / 指派 / 执行 / 结果回填必须人工确认，全程台账留痕。" : ""}
            </p>
            {/* 迭代20 · 工单7 · Agent 试运行台（统一 Tool Contract + LLM Gateway 护栏） */}
            <AgentRunPanel zh={zh} />
          </div>
        )}

        {/* ===== Marketplace ===== */}
        {tab === "market" && (
          <div className="mt-5">
            {mkLoading && <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {market?.map((m) => (
                <div key={m.mid} className="rounded-md border border-border bg-card/60 p-4 flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] rounded bg-primary/10 text-primary px-1.5 py-px font-medium">{m.categoryLabel}</span>
                    <span className={`ml-auto text-[10px] rounded px-1.5 py-px font-medium ${m.status === "live" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
                      {m.status === "live" ? (zh ? "本园区运行中" : "Live") : (zh ? "可复制交付" : "Packaged")}
                    </span>
                  </div>
                  <div className="mt-2 font-medium text-[13.5px] text-foreground">{m.name}</div>
                  <div className="mt-1 text-[11.5px] text-muted-foreground leading-snug">{m.desc}</div>
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {m.contains.map((c) => <span key={c} className="rounded-sm bg-secondary/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">{c}</span>)}
                  </div>
                  <div className="mt-auto pt-2.5 text-[10.5px] text-muted-foreground/80">
                    <div>{zh ? "买家" : "Buyer"}: {m.buyer}</div>
                    <div>{zh ? "定价" : "Pricing"}: {m.pricing}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[10.5px] text-muted-foreground/70 max-w-2xl leading-relaxed">
              {zh ? "目录 = 平台已沉淀能力的商品化封装（底层引擎均在本园区真实运行）。定价为演示口径【假设】，正式商业化前需按目标客群校准。" : ""}
            </p>
          </div>
        )}

        {/* ===== 迭代18 · 工单4 · 安全合规（RBAC-ABAC + PIPL 同意） ===== */}
        {tab === "authz" && <AuthzPane zh={zh} isAdmin={isAdmin} />}

        {/* ===== 迭代28 · 冲突中心 ===== */}
        {tab === ("conflicts" as any) && <ConflictsPane zh={zh} />}

        {/* ===== 迭代28 · 数据来源 ===== */}
        {tab === ("sources" as any) && <SourcesPane zh={zh} />}

        {/* ===== 迭代28 · 入库批次 ===== */}
        {tab === ("batches" as any) && <BatchesPane zh={zh} />}
      </div>
    </ScreenLayout>
  );
}

/* ---------- 迭代28 · 冲突中心 Tab ---------- */
function ConflictsPane({ zh }: { zh: boolean }) {
  const { data: conflicts, isLoading } = trpc.park.conflicts.list.useQuery();
  const utils = trpc.useUtils();
  const resolve = trpc.park.conflicts.resolve.useMutation({
    onSuccess: () => { utils.park.conflicts.list.invalidate(); toast.success(zh ? "冲突已解决" : "Conflict resolved"); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <div className="mt-5">
      <h2 className="font-serif-sc font-bold text-[14px] text-foreground mb-3">{zh ? "数据冲突中心" : "Data Conflicts"}</h2>
      {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {conflicts && conflicts.length === 0 && <div className="text-[12px] text-muted-foreground border border-dashed border-border rounded-md px-4 py-8 text-center">{zh ? "暂无开放冲突" : "No open conflicts"}</div>}
      <div className="space-y-2">
        {conflicts?.map((c) => {
          const candidates = JSON.parse(c.candidateValuesJson || "[]") as Array<{ evidenceId: number; value: string; score: number }>;
          return (
            <div key={c.id} className="rounded-md border border-border bg-card/60 p-4">
              <div className="flex items-center gap-2 text-[12px]">
                <span className="font-medium text-foreground">{c.eid}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-primary font-medium">{c.fieldName}</span>
                <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${c.resolutionStatus === "open" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-600"}`}>
                  {c.resolutionStatus}
                </span>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">{zh ? "当前值" : "Current"}: <span className="text-foreground">{c.currentValue || "—"}</span></div>
              <div className="mt-1.5 space-y-1">
                {candidates.map((cand, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span className="text-foreground">{cand.value}</span>
                    <span className="text-muted-foreground/70">({cand.score}分)</span>
                    {c.recommendedEvidenceId === cand.evidenceId && <span className="text-[9px] bg-primary/10 text-primary rounded px-1 py-px">{zh ? "推荐" : "Rec"}</span>}
                    <button onClick={() => resolve.mutate({ conflictId: c.id, evidenceId: cand.evidenceId })}
                      className="ml-auto text-[10px] text-primary hover:underline">{zh ? "采用" : "Adopt"}</button>
                  </div>
                ))}
              </div>
              {c.recommendedReason && <div className="mt-2 text-[10px] text-muted-foreground/70">{zh ? "推荐理由" : "Reason"}: {c.recommendedReason}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- 迭代28 · 数据来源 Tab ---------- */
function SourcesPane({ zh }: { zh: boolean }) {
  const { data: sources, isLoading } = trpc.park.sources.list.useQuery();
  const CATEGORY_LABEL: Record<string, string> = { government: "政府公示", company_official: "企业官方", commercial_database: "商业数据库", recruitment: "招聘平台", media: "媒体", park_internal: "园区内部", field_visit: "走访", enterprise_submission: "企业报送", other: "其他" };
  return (
    <div className="mt-5">
      <h2 className="font-serif-sc font-bold text-[14px] text-foreground mb-3">{zh ? "数据来源目录" : "Source Catalog"}</h2>
      {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {sources && sources.length === 0 && <div className="text-[12px] text-muted-foreground border border-dashed border-border rounded-md px-4 py-8 text-center">{zh ? "暂无来源" : "No sources"}</div>}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-[11.5px]">
          <thead><tr className="bg-secondary/60 text-muted-foreground">
            <th className="text-left px-3 py-1.5 font-medium">{zh ? "来源" : "Source"}</th>
            <th className="text-left px-3 py-1.5 font-medium">{zh ? "类别" : "Category"}</th>
            <th className="text-left px-3 py-1.5 font-medium">{zh ? "可靠等级" : "Level"}</th>
            <th className="text-left px-3 py-1.5 font-medium">{zh ? "状态" : "Status"}</th>
          </tr></thead>
          <tbody>
            {sources?.map((s) => (
              <tr key={s.id} className="border-t border-border/50">
                <td className="px-3 py-2 text-foreground font-medium">{s.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{CATEGORY_LABEL[s.category] || s.category}</td>
                <td className="px-3 py-2"><span className="rounded bg-secondary/70 px-1.5 py-0.5 text-[10px]">{s.reliabilityLevel}</span></td>
                <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${s.status === "active" ? "bg-emerald-500/10 text-emerald-600" : s.status === "planned" ? "bg-secondary text-muted-foreground" : "bg-amber-500/10 text-amber-600"}`}>{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- 迭代28 · 入库批次 Tab ---------- */
function BatchesPane({ zh }: { zh: boolean }) {
  const { data: batches, isLoading } = trpc.park.ingestion.listBatches.useQuery();
  const utils = trpc.useUtils();
  const rollback = trpc.park.ingestion.rollback.useMutation({
    onSuccess: () => { utils.park.ingestion.listBatches.invalidate(); toast.success(zh ? "批次已回滚" : "Batch rolled back"); },
    onError: (e: any) => toast.error(e.message),
  });
  const STATUS_COLOR: Record<string, string> = { committed: "bg-emerald-500/10 text-emerald-600", rolled_back: "bg-red-500/10 text-red-500", draft: "bg-secondary text-muted-foreground", failed: "bg-red-500/10 text-red-500" };
  return (
    <div className="mt-5">
      <h2 className="font-serif-sc font-bold text-[14px] text-foreground mb-3">{zh ? "入库批次管理" : "Ingestion Batches"}</h2>
      {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {batches && batches.length === 0 && <div className="text-[12px] text-muted-foreground border border-dashed border-border rounded-md px-4 py-8 text-center">{zh ? "暂无批次" : "No batches"}</div>}
      <div className="space-y-2">
        {batches?.map((b) => (
          <div key={b.id} className="rounded-md border border-border bg-card/60 p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[12px]">
                <span className="font-mono text-muted-foreground text-[10px]">{b.batchKey.slice(0, 20)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[b.status] || "bg-secondary text-muted-foreground"}`}>{b.status}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {zh ? "记录" : "Records"}: {b.totalRecords} · {zh ? "匹配" : "Matched"}: {b.matchedRecords} · {zh ? "冲突" : "Conflicts"}: {b.conflictRecords} · {b.actor}
              </div>
            </div>
            {b.status === "committed" && (
              <button onClick={() => rollback.mutate({ batchId: b.id })}
                className="flex-none text-[11px] text-red-500 hover:underline">{zh ? "回滚" : "Rollback"}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 迭代18 · 工单4 · 安全合规 Tab ---------- */
const GROUP_LABEL: Record<string, string> = { public: "公开", business: "业务", sensitive: "敏感", pii: "个人信息" };
const EFFECT_LABEL: Record<string, string> = { allow: "允许", mask: "脱敏", deny: "拒绝" };
const EFFECT_COLOR: Record<string, string> = { allow: "text-emerald-600 bg-emerald-500/10", mask: "text-amber-600 bg-amber-500/10", deny: "text-red-500 bg-red-500/10" };
const SCOPE_LABEL: Record<string, string> = { contact_info: "联系人信息", hr_data: "用工数据", finance_data: "财务数据", full_profile: "完整档案" };

function AuthzPane({ zh, isAdmin }: { zh: boolean; isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const { data: policies, isLoading: polLoading } = trpc.park.authz.policies.useQuery();
  const { data: consents, isLoading: conLoading } = trpc.park.authz.consents.useQuery({});
  const updatePolicy = trpc.park.authz.updatePolicy.useMutation({
    onSuccess: () => { utils.park.authz.policies.invalidate(); toast.success(zh ? "策略已更新（台账留痕）" : "Policy updated"); },
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.park.authz.revokeConsent.useMutation({
    onSuccess: () => { utils.park.authz.consents.invalidate(); toast.success(zh ? "同意已撤回，相关字段自动降级" : "Consent revoked"); },
    onError: (e) => toast.error(e.message),
  });
  const [eid, setEid] = useState("");
  const [scope, setScope] = useState<"contact_info" | "hr_data" | "finance_data" | "full_profile">("contact_info");
  const [grantedBy, setGrantedBy] = useState("");
  const [basis, setBasis] = useState("");
  const grant = trpc.park.authz.grantConsent.useMutation({
    onSuccess: () => { utils.park.authz.consents.invalidate(); setEid(""); setGrantedBy(""); setBasis(""); toast.success(zh ? "同意授权已记录" : "Consent granted"); },
    onError: (e) => toast.error(e.message),
  });

  const cycle: Record<string, "allow" | "mask" | "deny"> = { allow: "mask", mask: "deny", deny: "allow" };

  return (
    <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* 策略矩阵 */}
      <section>
        <h2 className="font-serif-sc font-bold text-[14px] text-foreground mb-1">
          {zh ? "访问策略矩阵（RBAC-ABAC）" : "Access Policy Matrix"}
          <span className="ml-2 text-[10.5px] font-normal text-muted-foreground">{zh ? "角色 × 数据分级 → 允许/脱敏/拒绝" : ""}</span>
        </h2>
        {polLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="bg-secondary/60 text-muted-foreground">
                <th className="text-left px-3 py-1.5 font-medium">{zh ? "角色" : "Role"}</th>
                <th className="text-left px-3 py-1.5 font-medium">{zh ? "数据分级" : "Group"}</th>
                <th className="text-left px-3 py-1.5 font-medium">{zh ? "效果" : "Effect"}</th>
                <th className="text-left px-3 py-1.5 font-medium">{zh ? "属性条件" : "Condition"}</th>
              </tr>
            </thead>
            <tbody>
              {policies?.map((p) => (
                <tr key={p.id} className="border-t border-border/60">
                  <td className="px-3 py-1.5 font-mono text-[11px]">{p.role}</td>
                  <td className="px-3 py-1.5">{GROUP_LABEL[p.fieldGroup] ?? p.fieldGroup}</td>
                  <td className="px-3 py-1.5">
                    <button
                      disabled={!isAdmin || updatePolicy.isPending}
                      onClick={() => updatePolicy.mutate({ id: p.id, effect: cycle[p.effect] })}
                      title={isAdmin ? (zh ? "点击轮换：允许→脱敏→拒绝" : "Click to cycle") : (zh ? "仅管理员可修改" : "Admin only")}
                      className={`rounded px-1.5 py-px text-[10.5px] font-medium ${EFFECT_COLOR[p.effect]} ${isAdmin ? "hover:opacity-75 cursor-pointer" : "cursor-default"}`}
                    >
                      {EFFECT_LABEL[p.effect]}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground text-[10.5px]">
                    {p.condition === "requires_consent" ? (zh ? "需有效同意，否则降级脱敏" : "requires consent") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10.5px] text-muted-foreground/70 leading-relaxed">
          {zh ? "字段分级：公开（企业名/行业/楼层）· 业务（岗位/资质/知识产权）· 敏感（USCC/注册资本/融资/参保）· 个人信息（法定代表人/关键决策人/引荐中间人）。敏感与 PII 的每次访问自动写审计台账（field_access）。" : ""}
        </p>
      </section>
      {/* 同意管理 */}
      <section>
        <h2 className="font-serif-sc font-bold text-[14px] text-foreground mb-1">
          {zh ? "同意管理（PIPL）" : "Consent Management"}
          <span className="ml-2 text-[10.5px] font-normal text-muted-foreground">{zh ? "授权 / 有效期 / 撤回即降级" : ""}</span>
        </h2>
        <div className="rounded-md border border-border bg-card/60 p-3 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <input value={eid} onChange={(e) => setEid(e.target.value)} placeholder={zh ? "企业 EID（如 E703）" : "EID"}
              className="rounded border border-border bg-background px-2 py-1.5 text-[11.5px]" />
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}
              className="rounded border border-border bg-background px-2 py-1.5 text-[11.5px]">
              {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input value={grantedBy} onChange={(e) => setGrantedBy(e.target.value)} placeholder={zh ? "授权来源（联系人/合同号）" : "Granted by"}
              className="rounded border border-border bg-background px-2 py-1.5 text-[11.5px]" />
            <input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder={zh ? "合法性基础（合同履行/明示同意）" : "Basis"}
              className="rounded border border-border bg-background px-2 py-1.5 text-[11.5px]" />
          </div>
          <button
            disabled={!eid || !grantedBy || !basis || grant.isPending}
            onClick={() => grant.mutate({ eid: eid.trim().toUpperCase(), scope, grantedBy, basis, expiresDays: 365 })}
            className="mt-2 rounded bg-primary text-primary-foreground px-3 py-1.5 text-[11.5px] font-medium disabled:opacity-40 active:scale-[0.97] transition-transform"
          >
            {grant.isPending ? "…" : (zh ? "记录同意授权（默认365天）" : "Grant consent")}
          </button>
        </div>
        {conLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
          {consents?.length === 0 && <div className="text-[11.5px] text-muted-foreground">{zh ? "暂无同意记录——PII 字段对管理员默认降级脱敏，直至录入有效同意。" : "No consents."}</div>}
          {consents?.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded border border-border/70 bg-card/40 px-2.5 py-1.5 text-[11.5px]">
              <span className="font-mono text-[10.5px] text-muted-foreground flex-none">{c.eid}</span>
              <span className="text-foreground flex-none">{SCOPE_LABEL[c.scope] ?? c.scope}</span>
              <span className={`rounded px-1.5 py-px text-[10px] font-medium flex-none ${c.status === "granted" ? "bg-emerald-500/10 text-emerald-600" : c.status === "expired" ? "bg-amber-500/10 text-amber-600" : "bg-red-500/10 text-red-500"}`}>
                {c.status === "granted" ? (zh ? "有效" : "OK") : c.status === "expired" ? (zh ? "已过期" : "Expired") : (zh ? "已撤回" : "Revoked")}
              </span>
              <span className="text-[10px] text-muted-foreground/70 truncate">{c.grantedBy} · {c.basis}</span>
              {c.status === "granted" && (
                <button onClick={() => revoke.mutate({ id: c.id })} disabled={revoke.isPending}
                  className="ml-auto flex-none text-[10.5px] text-red-500/80 hover:text-red-500">
                  {zh ? "撤回" : "Revoke"}
                </button>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] text-muted-foreground/70 leading-relaxed">
          {zh ? "撤回或过期后，对应范围字段在所有读取端自动回退脱敏/拒绝（无需重启）。授权与撤回全程台账留痕（consent_grant / consent_revoke）。" : ""}
        </p>
      </section>
    </div>
  );
}

/* ========== 迭代20 · 工单7 · Agent 试运行台 ========== */
function AgentRunPanel({ zh }: { zh: boolean }) {
  const { isAuthenticated } = useAuth();
  const { data: tools } = trpc.park.agent.tools.useQuery(undefined, { staleTime: 60_000 });
  const [tool, setTool] = useState("entity_profile");
  const [eid, setEid] = useState("E703");
  const [out, setOut] = useState<{ ok: boolean; requiresHuman: boolean; humanGateNote: string | null; output: unknown; error: string | null } | null>(null);
  const run = trpc.park.agent.run.useMutation({
    onSuccess: (r) => {
      setOut(r);
      if (r.requiresHuman && !r.ok) toast.warning(zh ? "HITL 门禁：关键动作需人工确认" : "HITL gate");
      else if (!r.ok) toast.error(r.error ?? "failed");
    },
    onError: (e) => toast.error(e.message),
  });
  const riskColor: Record<string, string> = { low: "text-emerald-600", medium: "text-amber-600", high: "text-red-500" };
  return (
    <section className="mt-5 rounded-md border border-border bg-card/60 p-4">
      <h3 className="font-serif-sc font-bold text-[13.5px] text-foreground">
        {zh ? "Agent 试运行 · 统一 Tool Contract" : "Agent Sandbox"}
        <span className="ml-2 text-muted-foreground font-normal text-[10.5px]">{zh ? "LLM Gateway 护栏（注入检测/越权拦截）+ 高风险动作 HITL 强制门禁" : ""}</span>
      </h3>
      {/* 契约表 */}
      <div className="mt-2.5 overflow-x-auto">
        <table className="w-full text-[10.5px]">
          <thead><tr className="text-muted-foreground/70 text-left"><th className="py-1 pr-3 font-normal">Tool</th><th className="pr-3 font-normal">Agent</th><th className="pr-3 font-normal">{zh ? "风险" : "Risk"}</th><th className="font-normal">{zh ? "人审" : "HITL"}</th></tr></thead>
          <tbody>
            {tools?.map((t) => (
              <tr key={t.name} className={`border-t border-border/40 cursor-pointer hover:bg-secondary/40 ${tool === t.name ? "bg-secondary/50" : ""}`} onClick={() => setTool(t.name)}>
                <td className="py-1 pr-3 font-mono text-foreground">{t.name}</td>
                <td className="pr-3 text-muted-foreground">{t.agent}</td>
                <td className={`pr-3 font-medium ${riskColor[t.riskLevel]}`}>{t.riskLevel}</td>
                <td>{t.requiresHuman ? "🔒" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 运行区 */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted-foreground">{zh ? "选中工具" : "Tool"}: <b className="font-mono text-foreground">{tool}</b></span>
        <input value={eid} onChange={(e) => setEid(e.target.value)} placeholder="EID (E703)" className="w-24 rounded border border-border bg-background px-2 py-1 text-[11px] font-mono" />
        <button
          onClick={() => { if (!isAuthenticated) { toast.info(zh ? "请先登录" : "Login required"); return; } run.mutate({ tool, eid }); }}
          disabled={run.isPending}
          className="rounded bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90 active:scale-[0.97] transition disabled:opacity-50"
        >
          {run.isPending ? (zh ? "运行中…" : "Running…") : (zh ? "试运行" : "Run")}
        </button>
      </div>
      {out && (
        <div className={`mt-2.5 rounded-md border px-3 py-2 text-[11px] leading-relaxed ${out.requiresHuman && !out.ok ? "border-amber-500/50 bg-amber-500/[0.06]" : out.ok ? "border-emerald-500/40 bg-emerald-500/[0.05]" : "border-red-500/40 bg-red-500/[0.05]"}`}>
          {out.requiresHuman && !out.ok ? (
            <div className="text-amber-700 dark:text-amber-400"><b>{zh ? "HITL 门禁" : "HITL"}</b>：{out.humanGateNote}</div>
          ) : out.ok ? (
            <pre className="whitespace-pre-wrap break-words font-mono text-[10px] text-foreground max-h-56 overflow-y-auto">{JSON.stringify(out.output, null, 2)}</pre>
          ) : (
            <div className="text-red-600">{out.error}</div>
          )}
          {out.humanGateNote && out.ok && <div className="mt-1 text-[10px] text-amber-600">{out.humanGateNote}</div>}
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted-foreground/70">{zh ? "切换模型不改业务代码：模型路由集中在 llmGateway 配置（fast/quality/reasoning 三档位）。send_outreach / commit_deal 属高风险动作，Agent 无权执行，仅能经决策采纳流由人执行。" : ""}</p>
    </section>
  );
}
import { AlertTriangle, Database, Layers } from "lucide-react";
