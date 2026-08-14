/* 迭代6 · AI 侧边助手：可收起右侧对话面板。
   - 自然语言查询企业数据 / 生成招商决策方案（LLM 全在后端调用）
   - 回答中的企业 → 联动看板高亮定位（跳屏 + 闪烁描边 + 抽屉直达）
   - 深浅双主题自适应；对话历史仅存于会话内存（不落库，合规） */
import { useI18n } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Streamdown } from "streamdown";
import { trpc } from "@/lib/trpc";
import { useMaskStore, useHighlightStore, type AiHighlight } from "@/lib/park";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { toast } from "sonner";
import { Bot, Crosshair, Loader2, Send, Sparkles, X } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; highlights?: AiHighlight[] };

const SCREEN_PATH: Record<AiHighlight["screen"], string> = {
  home: "/", radar: "/radar", referral: "/referral", tasks: "/tasks",
};
const SCREEN_LABEL: Record<AiHighlight["screen"], string> = {
  home: "屏一", radar: "屏二", referral: "屏三", tasks: "任务",
};

const PRESETS = [
  "哪些 P0 企业最近有扩张信号？",
  "给中科维讯生成一份招商触达方案",
  "本周应该优先拜访哪几家？为什么？",
  "软件行业线索的整体转化情况如何？",
];

/** 常驻快捷指令（路演现场一键提问）：label 为 i18n key，question 保持中文（业务数据为中文，LLM 回答跟随快照语言） */
const QUICK_CMDS: ["quickWho" | "quickReview" | "quickHealth", string][] = [
  ["quickWho", "根据当前线索评分、生命周期状态和任务清单，告诉我今天最应该触达的 3 家企业，并给出每家的触达理由和建议动作。"],
  ["quickReview", "汇总本周的作战复盘：完成了哪些任务、哪些企业状态推进了、转化漏斗有什么变化、下周应该重点跟进什么。"],
  ["quickHealth", "生成一份园区健康摘要：入驻主体总数、高价值线索分布、健康指数、活跃信号情况，以及当前最值得关注的 3 个变化。"],
];

export default function AiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const mask = useMaskStore((s) => s.mask);
  const setHighlights = useHighlightStore((s) => s.setHighlights);
  const { isAuthenticated } = useAuth();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const askMut = trpc.park.ai.ask.useMutation({
    onSuccess: (res) => {
      setMsgs((m) => [...m, { role: "assistant", content: res.answer, highlights: res.highlights }]);
      if (res.highlights.length > 0) setHighlights(res.highlights);
    },
    onError: (e) => {
      toast.error(`AI 生成失败：${e.message}`);
      setMsgs((m) => m.slice(0, -1));
    },
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, askMut.isPending]);

  const send = (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || askMut.isPending) return;
    if (!isAuthenticated) {
      toast("登录后可使用 AI 助手", { action: { label: "登录", onClick: () => startLogin() } });
      return;
    }
    const history = msgs.slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setInput("");
    askMut.mutate({ question, mask, history });
  };

  const locate = (h: AiHighlight, all: AiHighlight[]) => {
    setHighlights(all);
    navigate(SCREEN_PATH[h.screen]);
  };

  if (!open) return null;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[400px] flex flex-col border-l border-border bg-card shadow-2xl"
      style={{ animation: "aiSlideIn 220ms cubic-bezier(0.23, 1, 0.32, 1)" }}
      aria-label="AI 招商决策助手"
    >
      <style>{`@keyframes aiSlideIn { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }`}</style>
      {/* 头部 */}
      <div className="flex-none flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <span className="w-7 h-7 rounded-md flex items-center justify-center bg-primary/15 text-primary"><Bot className="w-4 h-4" /></span>
        <div className="flex-1 min-w-0">
          <div className="font-serif-sc font-bold text-[13.5px] text-foreground">AI 招商决策助手</div>
          <div className="text-[10.5px] text-muted-foreground">基于后端实时快照 · 回答供人工决策参考</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" aria-label="收起面板">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 对话区 */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* 常驻快捷指令条 */}
        <div className="flex flex-wrap gap-1.5 -mt-1">
          {QUICK_CMDS.map(([key, q]) => (
            <button
              key={key}
              onClick={() => send(q)}
              disabled={askMut.isPending}
              className="rounded-full border border-primary/40 bg-primary/8 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/18 disabled:opacity-40 transition-colors active:scale-[0.96]"
            >
              {t(key)}
            </button>
          ))}
        </div>
        {msgs.length === 0 && (
          <div className="pt-6">
            <Sparkles className="w-5 h-5 mx-auto text-muted-foreground/60" />
            <p className="mt-2 text-center text-[12px] text-muted-foreground">用自然语言查询园区企业数据，<br />或让我生成招商决策方案。</p>
            <div className="mt-4 space-y-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="w-full text-left rounded-md border border-border bg-secondary/40 px-3 py-2 text-[12px] text-foreground hover:bg-accent transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "user" ? (
              <div className="max-w-[85%] rounded-md bg-primary/12 border border-primary/25 px-3 py-2 text-[12.5px] text-foreground whitespace-pre-wrap">{m.content}</div>
            ) : (
              <div className="max-w-full">
                <div className="rounded-md border border-border bg-secondary/35 px-3.5 py-2.5 text-[12.5px] text-foreground prose-sm [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&_h1]:text-[13px] [&_h2]:text-[13px] [&_h3]:text-[12.5px] [&_strong]:text-foreground">
                  <Streamdown>{m.content}</Streamdown>
                </div>
                {m.highlights && m.highlights.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.highlights.map((h) => (
                      <button
                        key={h.eid}
                        onClick={() => locate(h, m.highlights!)}
                        className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/[0.08] px-2 py-1 text-[11px] text-foreground hover:bg-primary/[0.16] transition-colors"
                        title={`跳转${SCREEN_LABEL[h.screen]}并高亮定位`}
                      >
                        <Crosshair className="w-3 h-3 text-primary" />
                        {h.name}
                        <span className="text-muted-foreground">· {SCREEN_LABEL[h.screen]}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {askMut.isPending && (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在检索快照并生成…
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="flex-none border-t border-border px-3.5 py-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={2}
            placeholder="如：对比眸视科技和富通东方的触达优先级…"
            className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || askMut.isPending}
            className="flex-none w-9 h-9 rounded-md bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-all active:scale-[0.97]"
            aria-label="发送"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">仅基于企业公开信息快照回答 · 提问动作写入操作台账 · Enter 发送 / Shift+Enter 换行</p>
      </div>
    </aside>
  );
}
