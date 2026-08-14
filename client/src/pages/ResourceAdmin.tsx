/* 迭代14 · 资源库管理页（管理员）：Marketplace 供给侧运营
   - 全量资源清单（含停用），行内编辑容量、启停
   - 新增/编辑表单：类型/名称/机构/需求维度/行业/阶段/容量/备注
   - 全部动作走后端 adminProcedure + 台账留痕 */
import { useState } from "react";
import ScreenLayout, { ScreenHeader } from "@/components/ScreenLayout";
import LedgerNote from "@/components/LedgerNote";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { Link } from "wouter";
import { ArrowRight, Loader2, Package, Pencil, Plus, Power, ShieldAlert, X } from "lucide-react";

const RTYPE_OPTIONS: Array<[string, string]> = [
  ["gaoyu", "高于人力"], ["professor", "教授"], ["mentor", "导师"], ["alumni", "校友"],
  ["investor", "投资人"], ["lawfirm", "律所"], ["tax", "财税"], ["headhunter", "猎头"], ["vendor", "服务商"],
];
const NEED_OPTIONS: Array<[string, string]> = [
  ["talent", "人才"], ["funding", "融资"], ["policy", "政策"], ["market", "市场"],
  ["rnd", "研发"], ["digital", "数字化"], ["legal", "法务"],
];

interface ResRow {
  id: number; rtype: string; name: string; org: string | null; needTags: string;
  indTags: string | null; stageTags: string | null; capacity: number; note: string | null; active: boolean;
}
interface FormState {
  rtype: string; name: string; org: string; needTags: string[]; indTags: string; stageTags: string; capacity: string; note: string;
}
const emptyForm: FormState = { rtype: "vendor", name: "", org: "", needTags: [], indTags: "", stageTags: "", capacity: "5", note: "" };

export default function ResourceAdmin() {
  const { user, isAuthenticated, loading } = useAuth();
  const { lang } = useI18n();
  const zh = lang === "zh";
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<ResRow | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows, isLoading } = trpc.park.decision.resourceAdmin.list.useQuery(undefined, { enabled: isAdmin, retry: false });
  const { data: usage } = trpc.park.decision.resourceUsage.useQuery(undefined, { enabled: isAdmin, staleTime: 10_000 });
  const invalidate = () => { utils.park.decision.resourceAdmin.invalidate(); utils.park.decision.resources.invalidate(); };
  const createMut = trpc.park.decision.resourceAdmin.create.useMutation({
    onSuccess: () => { invalidate(); setCreating(false); toast.success(zh ? "资源已新增（台账留痕）" : "Resource created"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.park.decision.resourceAdmin.update.useMutation({
    onSuccess: () => { invalidate(); setEditing(null); toast.success(zh ? "资源已更新（台账留痕）" : "Resource updated"); },
    onError: (e) => toast.error(e.message),
  });
  const toggleMut = trpc.park.decision.resourceAdmin.toggle.useMutation({
    onSuccess: () => { invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  if (loading) return <ScreenLayout><div className="px-10 py-16 flex items-center gap-2 text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin" />加载中…</div></ScreenLayout>;
  if (!isAuthenticated || !isAdmin) {
    return (
      <ScreenLayout>
        <div className="px-10 py-16 max-w-lg">
          <div className="rounded-md border border-border bg-card/70 p-6 text-center">
            <ShieldAlert className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
            <div className="font-serif-sc font-bold text-[15px] text-foreground">{zh ? "资源库管理为管理员专属" : "Admin only"}</div>
            <p className="mt-2 text-[12.5px] text-muted-foreground leading-relaxed">
              {zh ? "Marketplace 供给侧运营（资源增删/容量维护）仅限管理员操作，全部变更写入台账。" : "Resource CRUD is restricted to admins; all changes are ledgered."}
            </p>
            {!isAuthenticated && (
              <button onClick={() => startLogin()} className="mt-4 rounded-md bg-primary text-primary-foreground px-4 py-2 text-[13px] font-medium hover:opacity-90 active:scale-[0.97]">
                {zh ? "登录" : "Login"}
              </button>
            )}
          </div>
        </div>
      </ScreenLayout>
    );
  }

  const activeCount = (rows ?? []).filter((r) => r.active).length;
  const totalCapacity = (rows ?? []).filter((r) => r.active).reduce((s, r) => s + r.capacity, 0);

  return (
    <ScreenLayout>
      <div className="px-10 pt-9 pb-8 border-b border-border">
        <ScreenHeader
          num={zh ? "供给" : "Supply"}
          title={zh ? "资源库管理" : "Resource Admin"}
          desc={zh
            ? "Marketplace 供给侧运营：资源增删 / 容量维护 / 启停。资源匹配引擎按需求×行业×阶段×容量四因子实时打分，容量变化即刻影响决策建议的匹配结果。"
            : "Marketplace supply-side ops: CRUD resources and maintain capacity; matching uses need × industry × stage × capacity."}
          right={
            <Link href="/decision" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
              {zh ? "决策中心" : "Decision Center"} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          }
        />
        <div className="mt-6 flex flex-wrap items-center gap-6">
          <div><span className="font-mono-num font-extrabold text-[28px] text-foreground">{rows?.length ?? 0}</span><span className="ml-2 text-[12px] text-muted-foreground">{zh ? "资源总数" : "Total"}</span></div>
          <div><span className="font-mono-num font-extrabold text-[28px]" style={{ color: "#0E9F6E" }}>{activeCount}</span><span className="ml-2 text-[12px] text-muted-foreground">{zh ? "启用中" : "Active"}</span></div>
          <div><span className="font-mono-num font-extrabold text-[28px]" style={{ color: "#D97706" }}>{totalCapacity}</span><span className="ml-2 text-[12px] text-muted-foreground">{zh ? "本期总承接容量（家）" : "Capacity"}</span></div>
          <button onClick={() => { setCreating(true); setEditing(null); }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 py-2 text-[12.5px] font-medium hover:opacity-90 active:scale-[0.97]">
            <Plus className="w-4 h-4" />{zh ? "新增资源" : "Add resource"}
          </button>
        </div>
      </div>

      <div className="px-10 py-8">
        {isLoading && <div className="flex items-center gap-2 text-muted-foreground text-[13px]"><Loader2 className="w-4 h-4 animate-spin" />{zh ? "加载资源库…" : "Loading…"}</div>}
        {(creating || editing) && (
          <ResourceForm
            zh={zh}
            initial={editing}
            pending={createMut.isPending || updateMut.isPending}
            onCancel={() => { setCreating(false); setEditing(null); }}
            onSubmit={(f) => {
              const payload = {
                rtype: f.rtype, name: f.name.trim(), org: f.org.trim() || undefined,
                needTags: f.needTags.join(","), indTags: f.indTags.trim() || undefined, stageTags: f.stageTags.trim() || undefined,
                capacity: Number(f.capacity || "0"), note: f.note.trim() || undefined,
              };
              if (editing) updateMut.mutate({ id: editing.id, ...payload });
              else createMut.mutate(payload);
            }}
          />
        )}
        {rows && rows.length > 0 && (
          <div className="rounded-md border border-border overflow-x-auto">
            <table className="w-full text-[12px] min-w-[860px]">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-muted-foreground">
                  <th className="text-left font-medium px-3 py-2.5">{zh ? "资源" : "Resource"}</th>
                  <th className="text-left font-medium px-3 py-2.5">{zh ? "类型" : "Type"}</th>
                  <th className="text-left font-medium px-3 py-2.5">{zh ? "需求维度" : "Needs"}</th>
                  <th className="text-left font-medium px-3 py-2.5">{zh ? "行业/阶段" : "Ind/Stage"}</th>
                  <th className="text-right font-medium px-3 py-2.5">{zh ? "容量" : "Cap"}</th>
                  <th className="text-right font-medium px-3 py-2.5">{zh ? "已占用" : "In use"}</th>
                  <th className="text-left font-medium px-3 py-2.5">{zh ? "状态" : "Status"}</th>
                  <th className="text-right font-medium px-3 py-2.5">{zh ? "操作" : "Actions"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rtypeLabel = RTYPE_OPTIONS.find(([k]) => k === r.rtype)?.[1] ?? r.rtype;
                  return (
                    <tr key={r.id} className={`border-b border-border/60 last:border-0 ${r.active ? "" : "opacity-50"}`}>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground">{r.name}</div>
                        {r.org && <div className="text-[11px] text-muted-foreground">{r.org}</div>}
                        {r.note && <div className="text-[10.5px] text-muted-foreground/80 mt-0.5">{r.note}</div>}
                      </td>
                      <td className="px-3 py-2.5"><span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10.5px]">{rtypeLabel}</span></td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.needTags.split(",").filter(Boolean).map((t) => (
                            <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                              {NEED_OPTIONS.find(([k]) => k === t.trim())?.[1] ?? t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground text-[11px] max-w-[180px]">
                        <div className="truncate" title={`${r.indTags || (zh ? "全行业" : "all")} / ${r.stageTags || (zh ? "全阶段" : "all")}`}>
                          {(r.indTags || (zh ? "全行业" : "all"))} · {(r.stageTags || (zh ? "全阶段" : "all"))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono-num font-bold text-foreground">{r.capacity}</td>
                      <td className="px-3 py-2.5 text-right">
                        {(() => {
                          const used = usage?.find((u) => u.resourceId === r.id)?.used ?? 0;
                          const full = used >= r.capacity && r.capacity > 0;
                          return (
                            <span className={`font-mono-num text-[11px] rounded px-1.5 py-0.5 ${full ? "bg-red-500/10 text-red-600 font-semibold" : used > 0 ? "bg-blue-500/10 text-blue-600" : "text-muted-foreground"}`}
                              title={zh ? "执行中决策占用的名额 · 完成/放弃自动释放" : "Held by executing decisions; auto-released on done/dismiss"}>
                              {used}/{r.capacity}{full ? (zh ? " 满" : " full") : ""}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-medium ${r.active ? "bg-emerald-500/15 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>
                          {r.active ? (zh ? "启用" : "Active") : (zh ? "停用" : "Off")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        <button onClick={() => { setEditing(r); setCreating(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                          <Pencil className="w-3 h-3" />{zh ? "编辑" : "Edit"}
                        </button>
                        <button onClick={() => toggleMut.mutate({ id: r.id, active: !r.active })} disabled={toggleMut.isPending}
                          className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${r.active ? "text-muted-foreground hover:text-destructive" : "text-emerald-600 hover:opacity-80"}`}>
                          <Power className="w-3 h-3" />{r.active ? (zh ? "停用" : "Disable") : (zh ? "启用" : "Enable")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <LedgerNote extra={zh
          ? "资源库 = Marketplace 收入层产品底座。演示资源经公开信息整理、联系方式脱敏；新增/编辑/启停全部写台账；容量自动扣减已上线——决策进入执行即占用名额，完成/放弃自动释放，超容量派单被拦截。"
          : "Resource pool backs the Marketplace tier; all changes are ledgered."} />
      </div>
    </ScreenLayout>
  );
}

function ResourceForm({ zh, initial, pending, onSubmit, onCancel }: {
  zh: boolean; initial: ResRow | null; pending: boolean;
  onSubmit: (f: FormState) => void; onCancel: () => void;
}) {
  const [f, setF] = useState<FormState>(initial ? {
    rtype: initial.rtype, name: initial.name, org: initial.org ?? "",
    needTags: initial.needTags.split(",").map((s) => s.trim()).filter(Boolean),
    indTags: initial.indTags ?? "", stageTags: initial.stageTags ?? "",
    capacity: String(initial.capacity), note: initial.note ?? "",
  } : emptyForm);
  const set = (k: keyof FormState, v: string | string[]) => setF((p) => ({ ...p, [k]: v }));
  const toggleNeed = (tag: string) => set("needTags", f.needTags.includes(tag) ? f.needTags.filter((t) => t !== tag) : [...f.needTags, tag]);
  const valid = f.name.trim().length > 0 && f.needTags.length > 0 && /^\d{1,3}$/.test(f.capacity);
  return (
    <div className="mb-6 rounded-md border border-primary/35 bg-primary/[0.04] p-5">
      <div className="flex items-center gap-2 mb-4">
        <Package className="w-4 h-4 text-primary" />
        <span className="font-serif-sc font-bold text-[14px] text-foreground">{initial ? (zh ? `编辑资源 #${initial.id}` : `Edit #${initial.id}`) : (zh ? "新增资源" : "New resource")}</span>
        <button onClick={onCancel} className="ml-auto rounded p-1 text-muted-foreground hover:text-foreground transition-colors"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3.5">
        <label className="block">
          <span className="text-[11.5px] text-muted-foreground">{zh ? "资源名称 *" : "Name *"}</span>
          <input value={f.name} onChange={(e) => set("name", e.target.value)} maxLength={128}
            className="mt-1 w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </label>
        <label className="block">
          <span className="text-[11.5px] text-muted-foreground">{zh ? "所属机构" : "Org"}</span>
          <input value={f.org} onChange={(e) => set("org", e.target.value)} maxLength={128}
            className="mt-1 w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </label>
        <label className="block">
          <span className="text-[11.5px] text-muted-foreground">{zh ? "资源类型 *" : "Type *"}</span>
          <select value={f.rtype} onChange={(e) => set("rtype", e.target.value)}
            className="mt-1 w-full rounded-sm border border-border bg-background px-2 py-1.5 text-[12.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40">
            {RTYPE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{zh ? l : k}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-[11.5px] text-muted-foreground">{zh ? "本期承接容量 *（0-999）" : "Capacity *"}</span>
          <input value={f.capacity} onChange={(e) => set("capacity", e.target.value.replace(/[^\d]/g, "").slice(0, 3))} inputMode="numeric"
            className="mt-1 w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12.5px] font-mono-num text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </label>
        <div className="md:col-span-2">
          <span className="text-[11.5px] text-muted-foreground">{zh ? "可服务需求维度 *（多选）" : "Need tags *"}</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {NEED_OPTIONS.map(([k, l]) => (
              <button key={k} onClick={() => toggleNeed(k)} type="button"
                className={`rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors ${f.needTags.includes(k) ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                {zh ? l : k}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="text-[11.5px] text-muted-foreground">{zh ? "擅长行业（逗号分隔，空=全行业）" : "Industries (comma, empty=all)"}</span>
          <input value={f.indTags} onChange={(e) => set("indTags", e.target.value)} maxLength={128} placeholder={zh ? "如：AI,软件,芯片" : "e.g. AI"}
            className="mt-1 w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </label>
        <label className="block">
          <span className="text-[11.5px] text-muted-foreground">{zh ? "适配阶段（逗号分隔，空=全阶段）" : "Stages (comma, empty=all)"}</span>
          <input value={f.stageTags} onChange={(e) => set("stageTags", e.target.value)} maxLength={128} placeholder={zh ? "如：A轮,B轮及后,IPO准备" : "e.g. Series A"}
            className="mt-1 w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </label>
        <label className="block md:col-span-2">
          <span className="text-[11.5px] text-muted-foreground">{zh ? "备注" : "Note"}</span>
          <input value={f.note} onChange={(e) => set("note", e.target.value)} maxLength={255}
            className="mt-1 w-full rounded-sm border border-border bg-background px-2.5 py-1.5 text-[12.5px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => valid && onSubmit(f)} disabled={pending || !valid}
          className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-[12.5px] font-medium hover:opacity-90 active:scale-[0.97] disabled:opacity-50">
          {pending ? (zh ? "保存中…" : "Saving…") : (zh ? "保存（写台账）" : "Save")}
        </button>
        <button onClick={onCancel} className="rounded-md border border-border px-3.5 py-1.5 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors">
          {zh ? "取消" : "Cancel"}
        </button>
      </div>
    </div>
  );
}
