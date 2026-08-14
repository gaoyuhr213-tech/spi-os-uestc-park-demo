/* 迭代23 · 工单10 · Decision Pipeline 串联视图
   展示最近一次十段链运行：每段事件名/一句话结论/耗时，失败段红标显式报错。
   数据来自 park.pipeline.runs（opsLedger 事件流），登录可见。 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import { ChevronDown, ChevronUp, GitBranch, XCircle, CheckCircle2 } from "lucide-react";

export default function PipelineStrip() {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const [open, setOpen] = useState(false);
  const { data: runs } = trpc.park.pipeline.runs.useQuery({ limit: 5 }, { staleTime: 15_000, retry: false });

  if (!runs || runs.length === 0) return null;
  const latest = runs[0];

  return (
    <div className="mt-4 rounded-md border border-border bg-card/60 px-4 py-3">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-left">
        <GitBranch className="w-4 h-4 text-muted-foreground flex-none" />
        <span className="text-[12.5px] font-medium text-foreground">
          {zh ? "端到端 Decision Pipeline（ADR-11 十段）" : "End-to-end Decision Pipeline (10 stages)"}
        </span>
        {latest.ok ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#0E9F6E]"><CheckCircle2 className="w-3.5 h-3.5" />{zh ? `最近运行 ${latest.events.length}/10 段完成` : `latest ${latest.events.length}/10 ok`}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-[#C8102E]"><XCircle className="w-3.5 h-3.5" />{zh ? `第${latest.failed?.seq}段 ${latest.failed?.stage} 失败中止` : `failed at ${latest.failed?.stage}`}</span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">{latest.at ? new Date(latest.at).toLocaleString() : ""}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="mt-3 space-y-1.5">
          {latest.events.map((e) => (
            <div key={e.seq} className="flex items-start gap-2.5 text-[12px]">
              <span className="flex-none w-5 h-5 rounded-full bg-secondary text-foreground font-mono-num text-[10px] inline-flex items-center justify-center mt-0.5">{e.seq}</span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">{e.stage}</span>
                <span className="mx-1.5 text-muted-foreground/60">·</span>
                <span className="text-muted-foreground font-mono-num text-[11px]">{e.name}</span>
                <span className="mx-1.5 text-muted-foreground/60">·</span>
                <span className="text-muted-foreground">{e.summary}</span>
              </div>
              <span className="flex-none font-mono-num text-[10.5px] text-muted-foreground/70 mt-0.5">{e.ms}ms</span>
            </div>
          ))}
          {!latest.ok && latest.failed && (
            <div className="flex items-start gap-2.5 text-[12px] rounded-sm bg-[#C8102E]/8 border border-[#C8102E]/30 px-2.5 py-1.5">
              <XCircle className="w-4 h-4 text-[#C8102E] flex-none mt-0.5" />
              <span className="text-[#C8102E]">{zh ? `第${latest.failed.seq}段 ${latest.failed.stage} 显式报错中止：` : `Stage ${latest.failed.seq} ${latest.failed.stage} aborted: `}{latest.failed.error}</span>
            </div>
          )}
          <p className="pt-1 text-[10.5px] text-muted-foreground/70 leading-relaxed">
            {zh
              ? "十段链：Entity→Profile→Signal→Graph→Score→Decision→Workflow→Agent→Outcome→Learning。一次数据导入触发全链，事件驱动串联，断链显式报错（不静默）。触发入口：数据接入中心「入库」或管道 API。"
              : "10 stages triggered by one data import; event-driven; failures abort explicitly. Trigger from Connector Center ingest."}
          </p>
        </div>
      )}
    </div>
  );
}
