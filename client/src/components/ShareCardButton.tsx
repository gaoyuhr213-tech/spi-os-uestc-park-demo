/* 迭代12 · 企微/飞书分享卡片按钮：
   解析完成 / 状态变更后生成结构化分享文本（后端 park.shareCard 组装），一键复制到剪贴板，
   直接粘贴到企业微信/飞书群即可协同跟进。需登录（写台账）。 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useMaskStore } from "@/lib/park";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { toast } from "sonner";
import { Share2, Check, Loader2 } from "lucide-react";

export default function ShareCardButton({ eid, scene, fieldsWritten, stage, note, small }: {
  eid: string;
  scene: "parse" | "stage";
  fieldsWritten?: string[];
  stage?: string;
  note?: string | null;
  small?: boolean;
}) {
  const mask = useMaskStore((s) => s.mask);
  const { t } = useI18n();
  const { isAuthenticated } = useAuth();
  const [copied, setCopied] = useState(false);
  const gen = trpc.park.shareCard.useMutation();

  const onClick = async () => {
    if (!isAuthenticated) {
      toast(t("login"), { action: { label: t("login"), onClick: () => startLogin() } });
      return;
    }
    try {
      const card = await gen.mutateAsync({
        eid, scene, mask,
        fieldsWritten: fieldsWritten?.slice(0, 30),
        stage, note: note ?? undefined,
      });
      await navigator.clipboard.writeText(card.text);
      setCopied(true);
      toast.success(t("shareCopied"));
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={gen.isPending}
      title={t("shareHint")}
      className={`inline-flex items-center gap-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors active:scale-[0.96] disabled:opacity-50 ${
        small ? "px-1.5 py-px text-[10px]" : "px-2.5 py-1 text-[11.5px]"
      }`}
    >
      {gen.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Share2 className="w-3 h-3" />}
      {t("shareCard")}
    </button>
  );
}

