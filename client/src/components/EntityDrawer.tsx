/* 企业 360 · 情报工作面板 v1（迭代9 第一波升维）：
   - 从"静态字段陈列"升级为四区工作空间：决策 / 信号流 / 证据 / 历史
   - 决策区：评分+NBA+生命周期标记+双版话术+「为什么」七问解释链
   - 信号流：时间倒序信号 + 衰减状态；证据区：富集档案 + AI 解析填充 + 12维拆解
   - 历史区：生命周期事件流。数据全部来自后端（snapshot/pitch/explain/history），前端仅渲染 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ParkItem, TIER_COLOR, TIER_LABEL, PATHS, STAGE_COLOR, nba, alpha, IntentBadge } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { Copy, Check, ScrollText, Loader2, Flag, Sparkles, HelpCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import IntelParseDialog from "@/components/IntelParseDialog";
import { ExplainBody } from "@/components/ExplainPanel";
import ShareCardButton from "@/components/ShareCardButton";
import ParseHistoryPane from "@/components/ParseHistoryPane";
import DecisionProfilePane from "@/components/DecisionProfilePane";
import ProvenanceDrawer from "@/components/ProvenanceDrawer";

export function TierTag({ tier, small }: { tier: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-bold text-white ${small ? "px-2 py-px text-[10px]" : "px-2.5 py-0.5 text-[11px]"}`}
      style={{ background: TIER_COLOR[tier] || "var(--tier-p2)" }}
    >
      {tier}
    </span>
  );
}

export function StageTag({ stage, small }: { stage: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm font-medium border ${small ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
      style={{ color: STAGE_COLOR[stage], borderColor: alpha(STAGE_COLOR[stage], 0.4), background: alpha(STAGE_COLOR[stage], 0.08) }}
    >
      {stage}
    </span>
  );
}

/* 双版话术卡：正式版（决策层）/ 轻量版（HR/主管），后端生成 */
function PitchCard({ x }: { x: ParkItem }) {
  const [version, setVersion] = useState<"formal" | "light">("formal");
  const [copied, setCopied] = useState(false);
  const { t: tr } = useI18n();
  const { data, isLoading } = trpc.park.pitch.useQuery({ eid: x.eid, version });
  const draft = data?.text ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      toast.success(`${version === "formal" ? "正式版" : "轻量版"}话术已复制，可直接粘贴到微信/邮件`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请手动选择文本复制");
    }
  };
  return (
    <div className="rounded-md border border-primary/40 overflow-hidden">
      <div className="flex items-center justify-between bg-primary/10 px-3.5 py-2 border-b border-primary/30">
        <span className="flex items-center gap-1.5 font-serif-sc font-bold text-[12.5px] text-foreground">
          <ScrollText className="w-3.5 h-3.5 text-primary" />
          {tr("drawerPitch")} <span className="text-muted-foreground font-normal text-[10.5px]">{tr("taskFirstTouch")} · 7d</span>
        </span>
        <button
          onClick={copy}
          disabled={isLoading}
          className="flex items-center gap-1 rounded border border-primary/50 bg-background/60 px-2 py-1 text-[11px] text-foreground hover:bg-primary/20 transition-colors active:scale-[0.97]"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          {copied ? tr("copied") : tr("copyBtn")}
        </button>
      </div>
      <div className="flex border-b border-primary/20">
        {([["formal", tr("formalPitch")], ["light", tr("lightPitch")]] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setVersion(v)}
            className={`flex-1 px-3 py-1.5 text-[11px] font-medium transition-colors ${
              version === v ? "bg-primary/20 text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="px-3.5 py-3 text-[12px] leading-relaxed text-foreground/90 whitespace-pre-line bg-card/60 min-h-[80px]">
        {isLoading ? (
          <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 由后端规则引擎生成中…</span>
        ) : (
          draft
        )}
      </div>
      <div className="px-3.5 py-1.5 border-t border-dashed border-border/70 text-[10px] text-muted-foreground/70">
        按暖引荐路径（{x.path ? PATHS[x.path as keyof typeof PATHS].name : "—"}）+ 活跃信号 + 富集情报由后端模板引擎拼装；发送前请人工校订称谓与引荐人姓名。
      </div>
    </div>
  );
}

/* 生命周期标记条 */
const STAGE_LIST = ["未触达", "已触达", "已约见", "已成交"] as const;
const STAGE_ORDER: Record<string, number> = { 未触达: 0, 已触达: 1, 已约见: 2, 已成交: 3 };
const WIN_REASONS = ["价格合适", "管道对口", "暖引荐信任", "服务方案匹配", "其他"] as const;
const LOSS_REASONS = ["预算不足", "已有供应商", "需求消失", "决策人变动", "竞对拿下", "其他"] as const;
function LifecycleBar({ x }: { x: ParkItem }) {
  const utils = trpc.useUtils();
  const { t: tr } = useI18n();
  /** 原因选择态：win=标记已成交；loss=状态回退（流失/降级） */
  const [reasonAsk, setReasonAsk] = useState<null | { stage: (typeof STAGE_LIST)[number]; kind: "win" | "loss" }>(null);
  const shareMut = trpc.park.shareCard.useMutation();
  const markMut = trpc.park.lifecycle.mark.useMutation({
    onSuccess: (_d, vars) => {
      utils.park.snapshot.invalidate();
      utils.park.lifecycle.history.invalidate({ eid: x.eid });
      utils.park.tasks.invalidate();
      utils.park.weeklyReview.invalidate();
      setReasonAsk(null);
      // 迭代12 · 状态变更后提供企微/飞书分享卡片入口
      toast.success(`已标记「${vars.stage}」，漏斗与雷达已联动更新`, {
        duration: 8000,
        action: {
          label: "复制分享卡片",
          onClick: () => {
            shareMut.mutate(
              { eid: x.eid, scene: "stage", mask: false, stage: vars.stage, note: vars.note },
              {
                onSuccess: async (card) => {
                  try {
                    await navigator.clipboard.writeText(card.text);
                    toast.success("分享卡片已复制，可直接粘贴到企业微信 / 飞书群");
                  } catch { toast.error("复制失败，请重试"); }
                },
                onError: (e) => toast.error(`生成失败：${e.message}`),
              },
            );
          },
        },
      });
    },
    onError: (e) => toast.error(`标记失败：${e.message}`),
  });
  const { data: history } = trpc.park.lifecycle.history.useQuery({ eid: x.eid });

  const onStageClick = (s: (typeof STAGE_LIST)[number]) => {
    if (s === "已成交") { setReasonAsk({ stage: s, kind: "win" }); return; }
    // 状态回退 = 流失/降级信号，要求编码原因（Cap-09 Outcome）
    if (STAGE_ORDER[s] < STAGE_ORDER[x.stage]) { setReasonAsk({ stage: s, kind: "loss" }); return; }
    markMut.mutate({ eid: x.eid, stage: s });
  };
  return (
    <div>
      <h3 className="font-serif-sc font-bold text-[13px] text-foreground mb-2 tracking-wide flex items-center gap-1.5">
        <Flag className="w-3.5 h-3.5 text-muted-foreground" />
        {tr("drawerLifecycle")} <span className="text-muted-foreground font-normal">（<StageTag stage={x.stage} small />）</span>
      </h3>
      <div className="flex gap-1.5">
        {STAGE_LIST.map((s) => (
          <button
            key={s}
            disabled={markMut.isPending || x.stage === s}
            onClick={() => onStageClick(s)}
            className={`flex-1 rounded-md border px-2 py-1.5 text-[11.5px] font-medium transition-colors active:scale-[0.97] ${
              x.stage === s
                ? "cursor-default text-white"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
            }`}
            style={x.stage === s ? { background: STAGE_COLOR[s], borderColor: STAGE_COLOR[s] } : undefined}
          >
            {s}
          </button>
        ))}
      </div>
      {/* 成交/流失原因编码（Cap-09 Outcome）：确认原因后才写入事件 */}
      {reasonAsk && (
        <div className="mt-2 rounded-md border border-border bg-secondary/40 px-3 py-2.5">
          <div className="text-[11px] text-muted-foreground mb-1.5">
            {reasonAsk.kind === "win" ? "标记「已成交」· 请选择成交原因（计入 Outcome 回填）" : `状态回退至「${reasonAsk.stage}」· 请选择流失/回退原因`}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(reasonAsk.kind === "win" ? WIN_REASONS : LOSS_REASONS).map((r) => (
              <button
                key={r}
                disabled={markMut.isPending}
                onClick={() => markMut.mutate({
                  eid: x.eid, stage: reasonAsk.stage,
                  ...(reasonAsk.kind === "win" ? { outcomeReason: r as never } : { lossReason: r as never }),
                })}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors active:scale-[0.96]"
              >
                {r}
              </button>
            ))}
            <button onClick={() => setReasonAsk(null)} className="rounded-full px-2.5 py-1 text-[11px] text-muted-foreground/60 hover:text-foreground">取消</button>
          </div>
        </div>
      )}
      {history && history.length > 0 && (
        <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
          {history.map((h) => (
            <div key={h.id} className="text-[10.5px] text-muted-foreground font-mono-num">
              {new Date(h.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              <span className="ml-2" style={{ color: STAGE_COLOR[h.stage] }}>{h.stage}</span>
              {h.note && <span className="ml-2 opacity-80">{h.note}</span>}
              {h.actor && <span className="ml-2 opacity-70">{h.actor}</span>}
            </div>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-muted-foreground/70">状态事件追加式入库，90 天转化漏斗（屏二）由后端按事件流实时聚合。</p>
    </div>
  );
}

const ENRICH_FIELDS: [string, string][] = [
  ["uscc", "统一社会信用代码"],
  ["regCapital", "注册资本(万元)"],
  ["founded", "成立年份"],
  ["insured", "参保人数"],
  ["jobs", "在招岗位数"],
  ["topJobs", "核心在招岗位"],
  ["patents", "专利数"],
  ["softCopyrights", "软著数"],
  ["hiTech", "高企资质"],
  ["funding", "融资/股改"],
  ["keyContact", "关键决策人"],
  ["referralVia", "暖引荐中间人"],
];

export default function EntityDrawer({
  entity,
  onClose,
}: {
  entity: ParkItem | null;
  onClose: () => void;
}) {
  const x = entity;
  const enrich = (x?.enrich ?? null) as Record<string, string | number | null> | null;
  const [parseOpen, setParseOpen] = useState(false);
  const [tab, setTab] = useState<"decision" | "signals" | "evidence" | "history" | "why">("decision");
  // 迭代23 · 工单12 · 溯源钻取：点信号「溯源」逐跳钻到 connector→ingestionJob 原始证据
  const [provSignal, setProvSignal] = useState<string | null>(null);
  const { t: tr } = useI18n();
  const isLead = x?.tier === "P0" || x?.tier === "P1";
  const TABS = [
    ["decision", tr("tabDecision")],
    ["signals", tr("tabSignals")],
    ["evidence", tr("tabEvidence")],
    ["history", tr("tabHistory")],
  ] as const;
  return (
    <Sheet open={!!x} onOpenChange={(o) => { if (!o) { onClose(); setTab("decision"); } }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-card border-border">
        {x && (
          <>
            {/* ===== 迭代15 · Header 根治重构 =====
                硬性约束落地：标准 Flex 文档流（flex flex-col），每个信息层级为独立块级行，
                不使用 inline/align-middle 混排、不使用 absolute/负 margin（Tab 下划线除外，作用于自身不影响兄弟流）。
                行序：1 企业名（可折行）→ 2 徽章行（自动换行）→ 3 意图标签行（自动换行）→ 4 元信息行 → 5 Tab 栏（与 Header 解耦，固定其下）。
                容器自适应高度：SheetHeader 无固定高度，行间距用 gap 控制。 */}
            <SheetHeader className="flex flex-col gap-1.5 pb-0">
              <SheetTitle className="block font-serif-sc text-lg leading-snug text-foreground pr-8 break-words">
                {x.name}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                <TierTag tier={x.tier} />
                {(x.tier === "P0" || x.tier === "P1") && <StageTag stage={x.stage} small />}
                {/* 迭代10 · 意图标签（规则版推断，hover 查看触发规则与证据）——并入徽章行，flex-wrap 自动换行 */}
                {x.intents && x.intents.map((it) => <IntentBadge key={it.tag} intent={it} />)}
              </div>
              <div className="text-[11px] leading-relaxed text-muted-foreground break-words">
                {x.floor} · 房间 {x.room} · {x.ind} · {x.nature} · {x.eid}
                {x.note ? ` · ${x.note}` : ""}
              </div>
            </SheetHeader>
            {/* Tab 栏：与 Header 解耦的独立块级行，固定在头部下方，overflow-x-auto 防窄屏挤压 */}
            <div className="flex items-center gap-1 border-b border-border px-3 -mt-2 overflow-x-auto flex-none">
              {TABS.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`flex-none px-2.5 py-1.5 text-[11.5px] font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                    tab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
              {x.score > 0 && (
                <button
                  onClick={() => setTab("why")}
                  className={`ml-auto flex-none flex items-center gap-1 px-2.5 py-1.5 text-[11.5px] font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                    tab === "why" ? "border-primary text-primary" : "border-transparent text-primary/70 hover:text-primary"
                  }`}
                >
                  <HelpCircle className="w-3.5 h-3.5" /> {tr("whyBtn")}
                </button>
              )}
            </div>
            {/* ===== Tab 决策：结论 + 生命周期 + 话术 + NBA ===== */}
            <div className={`px-4 pb-8 space-y-5 ${tab === "decision" ? "" : "hidden"}`}>
              <div className="grid grid-cols-2 gap-x-5 gap-y-2 text-[12.5px]">
                {[
                  [tr("drawerScore"), x.score > 0 ? `${x.score} / 100${x.enriched ? `（${x.scoreDelta >= 0 ? "+" : ""}${x.scoreDelta}）` : ""}` : "—"],
                  [tr("drawerTier"), TIER_LABEL[x.tier] || x.tier],
                  [tr("drawerHiring"), x.hiring],
                  [tr("drawerCross"), x.cross ? "✓" : "—"],
                  [tr("drawerPipe"), `${x.pipeMatch} / 100`],
                  [tr("drawerPath"), x.path ? PATHS[x.path as keyof typeof PATHS].name : "—"],
                ].map(([k, v]) => (
                  <div key={k as string} className="border-b border-dashed border-border/70 pb-1.5">
                    <span className="text-muted-foreground">{k}</span>
                    <span className="float-right font-medium text-foreground">{v}</span>
                  </div>
                ))}
              </div>

              {x.entry && (
                <div className="rounded-md border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-[12.5px]">
                  <span className="text-primary font-bold">{tr("drawerEntry")}</span>
                  <span className="ml-2 text-foreground">{x.entry}</span>
                </div>
              )}

              {(x.tier === "P0" || x.tier === "P1") && <LifecycleBar x={x} />}

              {/* 迭代13 · 决策画像：需求画布 + 生命周期阶段 + 决策清单（后端决策引擎推断） */}
              {(x.tier === "P0" || x.tier === "P1") && <DecisionProfilePane eid={x.eid} />}

              {x.tier === "P0" && <PitchCard x={x} />}

              <div className="rounded-md border border-border bg-secondary/60 px-3.5 py-3 text-[12.5px] leading-relaxed">
                <b className="text-foreground">{tr("drawerNba")}</b>
                <p className="mt-1 text-muted-foreground">{nba(x.tier)}</p>
              </div>

              {/* 迭代12 · 企微/飞书分享卡片：作战推进场景（当前状态+下一步，一键复制到群） */}
              {isLead && (
                <div className="flex items-center justify-between rounded-md border border-dashed border-border/70 px-3.5 py-2">
                  <span className="text-[11px] text-muted-foreground">团队协同：生成当前作战卡片发到企微/飞书群</span>
                  <ShareCardButton eid={x.eid} scene="stage" stage={x.stage} />
                </div>
              )}
            </div>

            {/* ===== Tab 信号流：时间倒序 ===== */}
            <div className={`px-4 pb-8 ${tab === "signals" ? "" : "hidden"}`}>
              <h3 className="font-serif-sc font-bold text-[13px] text-foreground mb-2 tracking-wide">{tr("drawerSignals")}</h3>
              {x.pipeSignals && x.pipeSignals.length > 0 ? (
                <div className="space-y-1.5">
                  {x.pipeSignals.map((s, i) => (
                    <div
                      key={i}
                      className={`rounded-r-md border-l-2 px-3 py-2 text-[12px] ${
                        s.tier === 1
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-chart-2 bg-chart-2/10 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <b>{s.text}</b>
                        {s.count > 1 && <span className="rounded-full bg-secondary px-1.5 text-[10px] font-mono-num text-muted-foreground">×{s.count}</span>}
                        <button
                          onClick={() => setProvSignal(s.text)}
                          className="rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors duration-150 motion-reduce:transition-none"
                          title={tr("provDrill")}
                        >
                          {tr("provDrill")}
                        </button>
                        <span
                          className={`ml-auto rounded px-1.5 py-px text-[10px] border ${
                            s.confidence === "高" ? "border-emerald-600/50 text-emerald-500" : s.confidence === "中" ? "border-amber-600/50 text-amber-500" : "border-border text-muted-foreground"
                          }`}
                        >
                          {tr("sigConfidence")} {s.confidence}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                        Tier-{s.tier} · {s.date} · {tr("sigSource")}：{s.source} · {s.fresh ? `${tr("sigFresh")} ${s.decayPct}%` : `${tr("sigDecayed")} ${s.decayPct}%`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-muted-foreground">暂无活跃信号 · 富集回填与批量解析可补充信号源。</div>
              )}
              <p className="mt-2 text-[10px] text-muted-foreground/70">信号流水线 v1：同文本归并计数 + 来源标注 + 置信度评级（已核验回填=高，衰减过半降档）；加分随半衰期衰减（T1 45天 / T2 90天）。</p>
            </div>

            {/* ===== Tab 证据：富集档案 + 12维拆解 ===== */}
            <div className={`px-4 pb-8 space-y-5 ${tab === "evidence" ? "" : "hidden"}`}>
              {isLead ? (
                <div>
                  <h3 className="font-serif-sc font-bold text-[13px] text-foreground mb-2 tracking-wide">
                    {tr("drawerEnrich")} <span className="text-muted-foreground font-normal">（L1/L2）</span>
                    <span
                      className={`ml-2 inline-flex items-center rounded px-1.5 py-px text-[10px] font-normal border ${
                        enrich?.verified === "已核验"
                          ? "border-emerald-600/50 text-emerald-500"
                          : "border-amber-600/50 text-amber-500"
                      }`}
                    >
                      {(enrich?.verified as string) ?? "待回填"}
                    </span>
                    <button
                      onClick={() => setParseOpen(true)}
                      className="ml-2 inline-flex items-center gap-1 rounded border border-primary/50 bg-primary/10 px-2 py-px text-[10.5px] font-medium text-primary hover:bg-primary/20 transition-colors active:scale-[0.96]"
                    >
                      <Sparkles className="w-3 h-3" /> {tr("aiParse")}
                    </button>
                  </h3>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-1.5 text-[11.5px]">
                    {ENRICH_FIELDS.map(([k, label]) => (
                      <div key={k} className={`border-b border-dashed border-border/60 pb-1 ${k === "topJobs" ? "col-span-2" : ""}`}>
                        <span className="text-muted-foreground">{label}</span>
                        <span className={`float-right ${enrich?.[k] != null && enrich?.[k] !== "" ? "text-foreground font-medium" : "text-muted-foreground/50"}`}>
                          {enrich?.[k] != null && enrich?.[k] !== "" ? String(enrich[k]) : "待回填"}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[10px] text-muted-foreground/70">
                    按《情报作业标准》以企查查/BOSS/incoPat 等公开信源回填：可粘贴公开页面文本用「AI 解析填充」单家回填，或经屏二「情报导入」批量入库；仅企业公开信息，PIPL 合规。富集字段触发后端评分自动复算。
                  </p>
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">P2/N 层级暂不做深度富集 · 出现 Tier-1 信号后自动进入富集队列。</p>
              )}

              {/* 迭代12 · 解析历史与字段级溯源：原文+结果快照，回溯「字段由哪次解析写入」 */}
              {isLead && <ParseHistoryPane eid={x.eid} />}
              {/* 迭代28 · 字段级证据（真实后端数据） */}
              {isLead && <FieldEvidencePane eid={x.eid} />}

              {x.score > 0 && x.dims.length > 0 && (
                <div>
                  <h3 className="font-serif-sc font-bold text-[13px] text-foreground mb-2.5 tracking-wide">
                    {tr("drawerDims")} <span className="text-muted-foreground font-normal">（12D · v1）</span>
                  </h3>
                  <div className="space-y-1.5">
                    {x.dims.map(([n, v, w]) => (
                      <div key={n} className="flex items-center gap-2 text-[11px]">
                        <span className="w-16 flex-none text-muted-foreground">{n}</span>
                        <span className="w-7 flex-none text-muted-foreground/60 font-mono-num">w{w}</span>
                        <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full grow-bar"
                            style={{ width: `${(v / 5) * 100}%`, background: TIER_COLOR[x.tier] || "var(--path-d)" }}
                          />
                        </div>
                        <span className="w-6 text-right font-mono-num text-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ===== Tab 历史：生命周期事件流 ===== */}
            <div className={`px-4 pb-8 ${tab === "history" ? "" : "hidden"}`}>
              {isLead ? <TimelinePane eid={x.eid} /> : <p className="text-[12px] text-muted-foreground">非 P0/P1 线索暂无触达历史。</p>}
            </div>

            {/* ===== Tab 为什么：七问解释链 ===== */}
            {tab === "why" && (
              <div className="px-4 pb-8">
                <ExplainBody eid={x.eid} />
              </div>
            )}
            <IntelParseDialog eid={x.eid} name={x.name} open={parseOpen} onClose={() => setParseOpen(false)} />
            {/* 迭代23 · 工单12 · 溯源钻取抽屉：signal→connector→ingestionJob */}
            <ProvenanceDrawer eid={provSignal ? x.eid : null} signalText={provSignal} onClose={() => setProvSignal(null)} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* 迭代10 · 历史区升级：因果时间线（信号/富集/触达/打卡单一事件轴，后端聚合） */
const TL_COLOR: Record<string, string> = {
  signal: "var(--tier-p1)", enrich: "var(--stage-done)", ai_parse: "var(--path-a)",
  stage: "var(--stage-meeting)", task: "var(--path-c)",
};
const TL_LABEL: Record<string, string> = { signal: "信号", enrich: "富集", ai_parse: "AI解析", stage: "触达", task: "打卡" };
function TimelinePane({ eid }: { eid: string }) {
  const { t: tr } = useI18n();
  const { data, isLoading } = trpc.park.timeline.useQuery({ eid });
  if (isLoading) return <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground text-[12px]"><Loader2 className="w-4 h-4 animate-spin" /> 加载因果时间线…</div>;
  if (!data || data.events.length === 0) return <p className="text-[12px] text-muted-foreground">尚无事件 · 信号命中、富集写入与状态标记会汇入此时间轴。</p>;
  return (
    <div>
      <h3 className="font-serif-sc font-bold text-[13px] text-foreground mb-1 tracking-wide">{tr("tlTitle")}</h3>
      <p className="text-[10.5px] text-muted-foreground/80 mb-3">{tr("tlDesc")}</p>
      <div className="space-y-0">
        {data.events.map((e, i) => (
          <div key={i} className="relative pl-5 pb-3.5">
            {i < data.events.length - 1 && <span className="absolute left-[5px] top-3 bottom-0 w-px bg-border" />}
            <span className="absolute left-0 top-1.5 w-[11px] h-[11px] rounded-full border-2 border-card" style={{ background: TL_COLOR[e.type] ?? "var(--tier-p2)" }} />
            <div className="flex items-center gap-2 text-[11px] font-mono-num text-muted-foreground">
              {new Date(e.at).toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              <span className="rounded px-1 text-[9.5px] border" style={{ color: TL_COLOR[e.type], borderColor: alpha(TL_COLOR[e.type] ?? "var(--tier-p2)", 0.45) }}>{TL_LABEL[e.type]}</span>
            </div>
            <div className="text-[12.5px] text-foreground font-medium">{e.title}</div>
            {e.detail && <div className="text-[11.5px] text-muted-foreground">{e.detail}</div>}
            {e.impact && <div className="text-[10.5px] text-muted-foreground/80">↳ {e.impact}</div>}
            {e.actor && <div className="text-[10.5px] text-muted-foreground/70">操作人：{e.actor}</div>}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/70">{data.note}</p>
    </div>
  );
}

/* ---------- 迭代28 · 字段级证据面板 ---------- */
function FieldEvidencePane({ eid }: { eid: string }) {
  const { data: evidence, isLoading } = trpc.park.evidence.byEntity.useQuery({ eid });
  const utils = trpc.useUtils();
  const verify = trpc.park.evidence.verify.useMutation({
    onSuccess: () => { utils.park.evidence.byEntity.invalidate({ eid }); toast.success("证据已核验"); },
    onError: (e: any) => toast.error(e.message),
  });
  const reject = trpc.park.evidence.reject.useMutation({
    onSuccess: () => { utils.park.evidence.byEntity.invalidate({ eid }); toast.success("证据已拒绝"); },
    onError: (e: any) => toast.error(e.message),
  });
  if (isLoading) return <div className="flex items-center gap-2 py-4 text-muted-foreground text-[11px]"><Loader2 className="w-3.5 h-3.5 animate-spin" />加载证据…</div>;
  if (!evidence || evidence.length === 0) return null;
  const byField: Record<string, typeof evidence> = {};
  for (const e of evidence) { (byField[e.fieldName] ??= []).push(e); }
  const STATUS_COLOR: Record<string, string> = { pending: "text-amber-500", verified: "text-emerald-500", disputed: "text-red-500", rejected: "text-muted-foreground line-through", expired: "text-muted-foreground/50" };
  return (
    <div className="mt-4">
      <h3 className="font-serif-sc font-bold text-[13px] text-foreground mb-2 tracking-wide">
        字段级证据 <span className="text-muted-foreground font-normal text-[10.5px]">（{evidence.length} 条 · 来自真实入库批次）</span>
      </h3>
      <div className="space-y-3">
        {Object.entries(byField).map(([field, evs]) => (
          <div key={field} className="rounded-md border border-border/70 bg-secondary/20 px-3 py-2">
            <div className="text-[11px] font-medium text-primary mb-1">{field}</div>
            <div className="space-y-1">
              {evs.map((e) => (
                <div key={e.id} className="flex items-center gap-2 text-[10.5px]">
                  <span className={`flex-1 min-w-0 truncate ${e.isCurrent ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {e.isCurrent ? <span className="text-[9px] bg-primary/10 text-primary rounded px-1 py-px mr-1">当前</span> : null}
                    {e.normalizedValue}
                  </span>
                  <span className={`flex-none text-[9px] ${STATUS_COLOR[e.verificationStatus] || ""}`}>{e.verificationStatus}</span>
                  <span className="flex-none text-[9px] text-muted-foreground/60">{e.confidenceScore ?? "—"}分</span>
                  {e.verificationStatus === "pending" && (
                    <>
                      <button onClick={() => verify.mutate({ evidenceId: e.id })} className="flex-none text-[9px] text-emerald-500 hover:underline">核验</button>
                      <button onClick={() => reject.mutate({ evidenceId: e.id })} className="flex-none text-[9px] text-red-400 hover:underline">拒绝</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
