/* 迭代12 · 解析历史与字段级溯源面板（证据 Tab 内嵌）：
   - 列表：每次 AI 解析/导入的时间、来源、写入字段、置信度、操作人
   - 溯源：字段 → 最近写入批次（回答「这个字段是哪次解析写入的」）
   - 原文快照可展开对照，强化证据链。数据来自 park.parseHistory.*（需登录） */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { alpha } from "@/lib/park";
import { History, Loader2, ChevronDown, ChevronUp } from "lucide-react";

const SRC_COLOR: Record<string, string> = {
  ai_parse: "var(--path-a)", ai_parse_batch: "var(--path-c)", excel_import: "var(--stage-met)",
};

/** 富集字段中文名（与 ENRICH_FIELDS 口径一致，用于溯源行展示） */
const FIELD_LABEL: Record<string, string> = {
  uscc: "统一社会信用代码", regCapital: "注册资本", founded: "成立年份", insured: "参保人数",
  jobs: "在招岗位数", topJobs: "核心在招岗位", patents: "专利数", softCopyrights: "软著数",
  hiTech: "高企资质", funding: "融资/股改", keyContact: "关键决策人", referralVia: "暖引荐中间人",
  legalRep: "法定代表人", salaryRange: "薪资范围", branches: "分支机构", bidAmount: "中标金额",
  icp: "ICP备案", referralNote: "引荐备注", verified: "核验状态", verifiedBy: "核验人", remark: "备注",
};

export default function ParseHistoryPane({ eid }: { eid: string }) {
  const { t } = useI18n();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [openId, setOpenId] = useState<number | null>(null);
  const list = trpc.park.parseHistory.list.useQuery({ eid }, { enabled: isAuthenticated, staleTime: 10_000 });
  const sources = trpc.park.parseHistory.fieldSources.useQuery({ eid }, { enabled: isAuthenticated, staleTime: 10_000 });

  return (
    <div>
      <h3 className="font-serif-sc font-bold text-[13px] text-foreground mb-1 tracking-wide flex items-center gap-1.5">
        <History className="w-3.5 h-3.5 text-muted-foreground" />
        {t("parseHistoryTitle")} <span className="text-muted-foreground font-normal text-[10.5px]">{t("parseHistorySub")}</span>
      </h3>
      {!isAuthenticated && !authLoading ? (
        <button
          onClick={() => startLogin()}
          className="w-full rounded-md border border-dashed border-border px-3 py-2.5 text-[11.5px] text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
        >
          {t("login")} · 查看解析历史与字段溯源
        </button>
      ) : list.isLoading || sources.isLoading ? (
        <div className="flex items-center gap-2 py-3 text-[11.5px] text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("loading")}</div>
      ) : !list.data || list.data.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/80 rounded-md border border-dashed border-border/70 px-3 py-2.5">{t("parseHistoryEmpty")}</p>
      ) : (
        <>
          {/* 字段级溯源：字段 → 最近写入批次 */}
          {sources.data && Object.keys(sources.data).length > 0 && (
            <div className="mb-2 rounded-md border border-border/70 bg-secondary/40 px-3 py-2">
              <div className="text-[10.5px] text-muted-foreground mb-1">{t("fieldsWrittenLabel")} · {t("sourceVia")}（最近一次）</div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(sources.data).map(([field, src]) => (
                  <span
                    key={field}
                    title={`${src.sourceLabel} · ${new Date(src.at).toLocaleString("zh-CN")} · ${src.actor}`}
                    className="inline-flex items-center gap-1 rounded border border-border/70 px-1.5 py-px text-[10px] text-muted-foreground cursor-help"
                  >
                    <span className="text-foreground">{FIELD_LABEL[field] ?? field}</span>
                    ← #{src.historyId}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* 历史批次列表 */}
          <div className="space-y-1.5">
            {list.data.map((h) => {
              const c = SRC_COLOR[h.sourceType] ?? "var(--tier-p2)";
              const open = openId === h.id;
              return (
                <div key={h.id} className="rounded-md border border-border/70 px-3 py-2">
                  <div className="flex items-center gap-2 flex-wrap text-[11px]">
                    <span className="font-mono-num text-muted-foreground">#{h.id}</span>
                    <span className="rounded px-1.5 py-px text-[9.5px] border" style={{ color: c, borderColor: alpha(c, 0.45), background: alpha(c, 0.08) }}>{h.sourceLabel}</span>
                    <span className="font-mono-num text-muted-foreground">{new Date(h.at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    {h.confidence && <span className="text-muted-foreground">{t("confidence")}{h.confidence}</span>}
                    <span className="ml-auto text-muted-foreground/70">{h.actor}</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-muted-foreground">
                    {t("fieldsWrittenLabel")}（{h.fieldsWritten.length}）：{h.fieldsWritten.map((f) => FIELD_LABEL[f] ?? f).join(" / ")}
                  </div>
                  {h.rawText && (
                    <button
                      onClick={() => setOpenId(open ? null : h.id)}
                      className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-primary/80 hover:text-primary transition-colors"
                    >
                      {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {open ? t("rawTextHide") : t("rawTextView")}
                    </button>
                  )}
                  {open && h.rawText && (
                    <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-secondary/50 px-2.5 py-2 text-[10.5px] leading-relaxed text-muted-foreground border border-border/60">
                      {h.rawText}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground/70">每次「AI 解析填充 / 批量解析 / Excel 导入」写入均自动留痕（原文 + 结果快照 + 写入字段清单），只增不改，对齐台账留痕公理。</p>
        </>
      )}
    </div>
  );
}
