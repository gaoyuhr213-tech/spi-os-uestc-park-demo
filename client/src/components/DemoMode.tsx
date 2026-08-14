/* 迭代23 · 工单12 · 一键演示模式（DemoMode）
 * 面向路演现场：一键灌入一家真实企业（成都眸视科技，公开信息）全链数据，
 * 然后引导式分步走完十段 Pipeline，每步一句话结论——10 秒讲清「决策为什么产生」。
 * - 上一步/下一步按钮 + 方向键翻步；ESC 关闭
 * - 动画仅 opacity/transform，且 motion-reduce 全禁用
 */
import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Play, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const STAGE_WHY: Record<string, { zh: string; en: string }> = {
  Entity:   { zh: "为什么可信：数据经 ACL 防腐层进入，实体解析归属到唯一主体，不产生重复企业。", en: "Data enters via the ACL layer and resolves to one canonical entity." },
  Profile:  { zh: "为什么完整：工商/招聘等多源字段装配进企业 360 画像，空值不覆盖已有情报。", en: "Multi-source fields assemble the 360 profile." },
  Signal:   { zh: "为什么敏锐：批量招聘等动作被识别为需求信号，写入企业信号轴并标注来源。", en: "Hiring bursts become demand signals with provenance." },
  Graph:    { zh: "为什么有路径：信号联动关系图谱，暖引荐路径即时可用。", en: "Signals link into the graph; warm paths ready." },
  Score:    { zh: "为什么排它第一：12 维评分即时重算，画像变化直接改变优先级。", en: "12-dim score recomputes instantly." },
  Decision: { zh: "为什么该行动：评分+信号+规则装配出带完整溯源链（basedOn）的决策建议。", en: "Decision proposed with full basedOn provenance." },
  Workflow: { zh: "为什么不掉球：决策自动挂接 SLA 流程，人工步骤有截止时间与升级机制。", en: "Workflow with SLA deadlines starts automatically." },
  Agent:    { zh: "为什么高效：Agent 生成触达建议，高风险动作强制人审（HITL）。", en: "Agent drafts outreach; high-risk actions require human approval." },
  Outcome:  { zh: "为什么可衡量：执行结果回填成交金额与结论，进入学习样本池。", en: "Outcomes are recorded and measurable." },
  Learning: { zh: "为什么会变聪明：结果驱动白盒权重重估，人审晋升后模型进化可回滚。", en: "Outcomes recalibrate white-box weights with human review." },
};

export default function DemoMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useI18n();
  const zh = lang === "zh";
  const [step, setStep] = useState(-1); // -1 = 起始页
  const seed = trpc.park.demo.seed.useMutation();
  const story = seed.data?.story ?? [];

  const next = useCallback(() => setStep((s) => Math.min(s + 1, story.length - 1)), [story.length]);
  const prev = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, prev]);

  useEffect(() => { if (!open) { setStep(-1); } }, [open]);

  const cur = step >= 0 ? story[step] : null;
  const why = cur ? STAGE_WHY[cur.stage] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[640px] bg-card border-border p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="font-serif-sc text-[16px] text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {zh ? "一键演示 · 一家企业的十段决策链" : "One-click Demo · 10-stage decision chain"}
          </DialogTitle>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            {zh
              ? "灌入成都眸视科技（真实入驻主体，公开信息，对外脱敏）的工商+招聘数据，现场走完 Entity→Learning 十段链。方向键 ←→ 翻步。"
              : "Seeds one real company (public data, masked) and walks all 10 stages. Use ← → keys."}
          </p>
        </DialogHeader>

        <div className="px-5 py-5 min-h-[260px]">
          {/* 起始页：一键触发 */}
          {step === -1 && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              {seed.isPending ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin motion-reduce:animate-none text-primary" />
                  <p className="text-[13px] text-muted-foreground">{zh ? "正在灌入数据并触发十段链…（幂等：先清理上次演示残留）" : "Seeding & running pipeline…"}</p>
                </>
              ) : seed.isError ? (
                <>
                  <XCircle className="w-8 h-8 text-[#C8102E]" />
                  <p className="text-[13px] text-[#C8102E]">{seed.error.message}</p>
                  <Button onClick={() => seed.mutate()} variant="outline" className="border-border">{zh ? "重试" : "Retry"}</Button>
                </>
              ) : seed.isSuccess ? (
                <>
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-[13px] text-foreground text-center leading-relaxed">
                    {zh
                      ? `已完成 ${seed.data.runs.length} 次摄入（工商源+招聘源），十段链全部贯通。`
                      : "Seeded via 2 sources; all 10 stages completed."}
                    <br />
                    <span className="text-muted-foreground text-[11.5px]">
                      {zh ? `清理上次残留：${seed.data.cleaned.jobs} 个批次 / ${seed.data.cleaned.ledger} 条台账（可重复运行）` : `Cleaned ${seed.data.cleaned.jobs} old jobs (idempotent)`}
                    </span>
                  </p>
                  <Button onClick={() => setStep(0)} className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-transform duration-150 motion-reduce:transition-none">
                    {zh ? "开始分步演示" : "Start walkthrough"} <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-muted-foreground text-center leading-relaxed max-w-[420px]">
                    {zh
                      ? "点击下方按钮：系统将经 ACL 通道摄入该企业的公开工商与招聘数据，触发完整十段决策链（可重复运行，不堆积脏数据）。"
                      : "Click to seed public data and trigger the full 10-stage chain (repeatable, no residue)."}
                  </p>
                  <Button onClick={() => seed.mutate()} size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-transform duration-150 motion-reduce:transition-none">
                    <Play className="w-4 h-4 mr-1.5" />{zh ? "一键灌入并运行" : "Seed & Run"}
                  </Button>
                </>
              )}
            </div>
          )}

          {/* 分步页：每段一句话结论 + why */}
          {cur && (
            <div key={cur.seq} className="fade-up">
              {/* 十段进度点 */}
              <div className="flex items-center gap-1.5 mb-5">
                {story.map((s, i) => (
                  <button
                    key={s.seq}
                    onClick={() => setStep(i)}
                    aria-label={s.stage}
                    className={`h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${i === step ? "w-7 bg-primary" : i < step ? "w-3 bg-primary/50" : "w-3 bg-secondary"}`}
                  />
                ))}
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono-num text-[28px] font-extrabold text-primary leading-none">{String(cur.seq).padStart(2, "0")}</span>
                <h3 className="font-serif-sc text-[18px] font-bold text-foreground">{cur.stage}</h3>
                <span className="text-[11px] text-muted-foreground">{zh ? `第 ${cur.seq}/10 段` : `${cur.seq}/10`}</span>
              </div>
              <p className="mt-3 text-[14px] text-foreground leading-relaxed rounded-md border border-border bg-background/60 px-3.5 py-3">
                {cur.conclusion}
              </p>
              {why && (
                <p className="mt-2.5 text-[12px] text-muted-foreground leading-relaxed">
                  <span className="text-primary font-medium">{zh ? "Why · " : "Why · "}</span>{zh ? why.zh : why.en}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 底栏翻步 */}
        {step >= 0 && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={prev} disabled={step === 0} className="border-border">
              <ChevronLeft className="w-4 h-4 mr-1" />{zh ? "上一段" : "Prev"}
            </Button>
            <Button variant="outline" size="sm" onClick={next} disabled={step === story.length - 1} className="border-border">
              {zh ? "下一段" : "Next"}<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
            <span className="ml-auto text-[10.5px] text-muted-foreground">
              {zh ? "←/→ 翻段 · 演示数据来自公开渠道，对外自动脱敏" : "←/→ to navigate · public data, auto-masked"}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
