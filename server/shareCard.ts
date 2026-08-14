/* ============================================================
 * 迭代12 · 企微/飞书分享卡片生成
 * - 场景1 parse：解析完成 → 富集摘要卡片（写入字段/评分变化/NBA）
 * - 场景2 stage：状态变更 → 作战推进卡片（新状态/评分/下一步）
 * - 输出为企微/飞书粘贴友好的结构化文本（markdown 加粗 + 分行），前端一键复制
 * - 敏感规则明细不出卡片；遵循脱敏开关
 * ============================================================ */
import { buildSnapshot } from "./dataAdapter";

export interface ShareCardOut {
  title: string;
  text: string;      // 企微/飞书通用富文本（markdown 轻量语法）
  plain: string;     // 纯文本兜底
  generatedAt: string;
}

const STAGE_NEXT: Record<string, string> = {
  "未触达": "按 NBA 完成首触，7 日内约见",
  "已触达": "72h 内跟进材料，推进约见",
  "已约见": "输出《人才供给方案》，推进签约",
  "已成交": "启动交付与续约管道，沉淀案例",
};

export async function buildShareCard(input: {
  eid: string;
  scene: "parse" | "stage";
  mask: boolean;
  extra?: { fieldsWritten?: string[]; stage?: string; note?: string | null };
}): Promise<ShareCardOut | null> {
  const snap = await buildSnapshot({ maskSensitive: input.mask });
  const x = snap.items.find((i) => i.eid === input.eid);
  if (!x) return null;
  const now = new Date();
  const ts = now.toISOString().slice(0, 16).replace("T", " ");
  const lines: string[] = [];
  let title: string;

  if (input.scene === "parse") {
    title = `【SPI-OS 情报更新】${x.name}`;
    lines.push(`**${x.name}**（${x.tier} · Lead ${x.score}/100）`);
    lines.push(`楼层 ${x.floor} · ${x.ind} · 招聘强度${x.hiring}`);
    if (input.extra?.fieldsWritten?.length) {
      lines.push(`本次回填字段：${input.extra.fieldsWritten.join(" / ")}`);
    }
    if (x.enriched) lines.push(`富集加分已生效（评分含富集修正 ${x.scoreDelta >= 0 ? "+" : ""}${x.scoreDelta}）`);
    if (x.signals.length > 0) lines.push(`活跃信号：${x.signals.map((s) => s.t).join("；")}`);
    if (x.intents && x.intents.length > 0) lines.push(`意图标签：${x.intents.map((i) => i.label).join(" / ")}`);
    const nbaText = (x as { nba?: string }).nba;
    if (nbaText) lines.push(`下一步（NBA）：${nbaText}`);
  } else {
    const stage = input.extra?.stage ?? x.stage;
    title = `【SPI-OS 作战推进】${x.name} → ${stage}`;
    lines.push(`**${x.name}**（${x.tier} · Lead ${x.score}/100）`);
    lines.push(`状态推进：→ **${stage}**${input.extra?.note ? `（${input.extra.note}）` : ""}`);
    lines.push(`楼层 ${x.floor} · ${x.ind} · 暖引荐${x.path ? `路径${x.path}` : "待定"}`);
    if (x.intents && x.intents.length > 0) lines.push(`意图标签：${x.intents.map((i) => i.label).join(" / ")}`);
    lines.push(`下一步：${STAGE_NEXT[stage] ?? "按任务清单推进"}`);
  }
  lines.push(`— SPI-OS 园区智能作战台 · ${ts}`);

  const text = `${title}\n${lines.join("\n")}`;
  return {
    title,
    text,
    plain: text.replace(/\*\*/g, ""),
    generatedAt: now.toISOString(),
  };
}
