/* 台账注记（制度签名元素）：印章点 + 数据源/口径说明，出现在每屏图表下方。 */
import { LEDGER_NOTE } from "@/lib/park";

export default function LedgerNote({ extra }: { extra?: string }) {
  return (
    <div className="mt-4 flex items-start gap-2.5 border-t border-dashed border-border/70 pt-3">
      <span className="mt-0.5 w-4 h-4 rounded-full border border-primary/70 flex items-center justify-center flex-none">
        <span className="w-1.5 h-1.5 rounded-full bg-primary/80" />
      </span>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground/75">
        <span className="font-serif-sc font-bold text-muted-foreground">备注</span> · {LEDGER_NOTE}
        {extra && <span> {extra}</span>}
      </p>
    </div>
  );
}
