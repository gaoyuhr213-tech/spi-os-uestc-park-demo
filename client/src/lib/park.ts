/* 前端数据层：仅持有展示常量与 tRPC 快照钩子。
   所有 KPI/评分/分级/排序/漏斗均由后端 park.snapshot 输出，前端不做业务计算。 */
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { createElement, useMemo } from "react";
import { create } from "zustand";

/* ---------- 展示常量（纯视觉映射，非业务规则）----------
   颜色一律引用 CSS 变量：深色作战/浅色办公两主题在 index.css 中定义各自取值，
   业务标签色语义不变，组件代码零重复维护。 */
export const TIER_COLOR: Record<string, string> = {
  P0: "var(--tier-p0)",
  P1: "var(--tier-p1)",
  P2: "var(--tier-p2)",
  N: "var(--tier-n)",
  运营方: "var(--tier-op)",
  配套: "var(--tier-support)",
};

export const TIER_LABEL: Record<string, string> = {
  P0: "P0 · 立即触达",
  P1: "P1 · 重点培育",
  P2: "P2 · 机会型",
  N: "N · 培育池",
  运营方: "运营方 · 锚点",
  配套: "园区配套",
};

export const PATHS = {
  A: { name: "路径A · 电子科大系", color: "var(--tier-p0)", desc: "信软学院/高等研究院/科技园股份/成电金盘/赛尔网络同属电子科大生态，以校企关系做统一暖引荐通道" },
  B: { name: "路径B · 园区锚点", color: "var(--tier-p1)", desc: "园区股份签约后，以官方名义向 69 家发起「人才服务进企业」活动，批量获客" },
  C: { name: "路径C · 协会一对多", color: "var(--tier-op)", desc: "新型显示行业协会触达其会员企业的用人需求" },
  D: { name: "路径D · 专业服务互荐", color: "var(--path-d)", desc: "律所/专利代理/咨询/EAP 构成本地专业服务转介网络" },
} as const;

export const STAGE_COLOR: Record<string, string> = {
  未触达: "var(--stage-untouched)",
  已触达: "var(--stage-reached)",
  已约见: "var(--stage-met)",
  已成交: "var(--stage-won)",
};

/** CSS 变量颜色 + 透明度（替代 `${hex}cc` 拼接写法，双主题兼容） */
export function alpha(cssColor: string, a: number): string {
  return `color-mix(in srgb, ${cssColor} ${Math.round(a * 100)}%, transparent)`;
}

export const LEDGER_NOTE =
  "数据源：电子科大国家大学科技园楼层索引（实景采录 · 2026-07）+ 情报富集导入；评分/分级/漏斗由后端规则引擎（v1）实时计算输出。";

/* NBA 展示文案（提示性动作指引，非评分规则） */
export function nba(tier: string): string {
  if (tier === "P0") return "① 信软学院定向实习/招聘专场 ② 高于高端寻访(高管/合伙人) ③ 经园区股份暖引荐，7日内约见";
  if (tier === "P1") return "① 纳入培育序列，内容触达 ② 校企人才管道对接 ③ 季度复访";
  if (tier === "运营方") return "方向一：园区人才/运维数字化平台共建（锚点客户）";
  return "① 监控信号变化 ② 择机转介";
}

/* ---------- 脱敏开关（全局，对外路演模式用） ---------- */
interface MaskState {
  mask: boolean;
  setMask: (v: boolean) => void;
}
export const useMaskStore = create<MaskState>((set) => ({
  mask: false,
  setMask: (v) => set({ mask: v }),
}));

/* ---------- AI 助手联动高亮（迭代6）：AI 回答中的企业在看板上定位高亮 ---------- */
export interface AiHighlight {
  eid: string;
  name: string;
  screen: "home" | "radar" | "referral" | "tasks";
}
interface HighlightState {
  highlights: AiHighlight[];
  /** 高亮批次时间戳（触发闪烁动画重放） */
  stamp: number;
  setHighlights: (h: AiHighlight[]) => void;
  clear: () => void;
}
export const useHighlightStore = create<HighlightState>((set) => ({
  highlights: [],
  stamp: 0,
  setHighlights: (h) => set({ highlights: h, stamp: Date.now() }),
  clear: () => set({ highlights: [], stamp: 0 }),
}));

/** 某企业是否处于 AI 高亮态 */
export function useIsHighlighted(eid: string): boolean {
  return useHighlightStore((s) => s.highlights.some((h) => h.eid === eid));
}

/* ---------- 快照钩子 ---------- */
type RouterOutputs = inferRouterOutputs<AppRouter>;
export type Snapshot = RouterOutputs["park"]["snapshot"];
export type ParkItem = Snapshot["items"][number];

/* 迭代10 · 意图标签徽章（规则版推断，title 展示触发规则与命中证据） */
export type IntentTag = ParkItem["intents"][number];
const INTENT_COLOR: Record<string, string> = {
  expansion: "var(--tier-p0)", talent_war: "var(--tier-p1)", ipo: "var(--path-a)", ai_shift: "var(--stage-met)", funding_active: "var(--tier-op)",
};
export function IntentBadge({ intent, small }: { intent: IntentTag; small?: boolean }) {
  const c = INTENT_COLOR[intent.tag] ?? "var(--tier-p2)";
  // park.ts 为 .ts 文件（非 .tsx），用 createElement 避免 JSX
  return createElement(
    "span",
    {
      title: `触发规则：${intent.rule}\n命中证据：${intent.hits.join("；")}`,
      className: `inline-flex items-center gap-1 rounded-full border font-medium cursor-help ${small ? "px-1.5 py-px text-[9.5px]" : "px-2 py-0.5 text-[10.5px]"}`,
      style: { color: c, borderColor: alpha(c, 0.45), background: alpha(c, 0.08) },
    },
    `◈ ${intent.label}`,
  );
}

export function useSnapshot() {
  const mask = useMaskStore((s) => s.mask);
  const q = trpc.park.snapshot.useQuery({ mask }, { staleTime: 15_000 });
  const items: ParkItem[] = q.data?.items ?? [];
  const derived = useMemo(() => {
    return {
      tenants: items.filter((x) => x.tier !== "运营方" && x.tier !== "配套"),
      p0: items.filter((x) => x.tier === "P0"),
      p1: items.filter((x) => x.tier === "P1"),
      leads: items.filter((x) => x.tier === "P0" || x.tier === "P1"),
    };
  }, [items]);
  return { ...q, snapshot: q.data, items, ...derived };
}
