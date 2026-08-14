/**
 * 迭代6 · AI 侧边助手（后端）
 * - 自然语言查询企业数据 / 生成招商决策方案
 * - LLM 仅在服务端调用（密钥不出域）；上下文注入后端快照（脱敏跟随开关）
 * - 结构化输出：answer（markdown）+ highlights（联动看板高亮定位指令）
 */
import { invokeLLM } from "./_core/llm";
import { buildSnapshot } from "./dataAdapter";

export type AiHighlight = {
  eid: string;
  name: string;
  screen: "home" | "radar" | "referral" | "tasks";
};

/** 组装园区数据上下文（压缩为 LLM 友好的紧凑格式，控制 token 成本） */
function buildContext(snap: Awaited<ReturnType<typeof buildSnapshot>>): string {
  const k = snap.kpis;
  const lines: string[] = [];
  lines.push(`# 园区快照（后端规则引擎实时输出）`);
  lines.push(`入驻主体${k.total}家；高价值线索${k.highValue}条（P0=${k.p0}，P1=${k.p1}）；健康指数${k.healthIndex}/100；人才供需匹配率${k.matchRate}%；活跃信号${k.signalCount}条`);
  lines.push(`漏斗：未触达${snap.funnel.counts["未触达"]}→已触达${snap.funnel.counts["已触达"]}→已约见${snap.funnel.counts["已约见"]}→已成交${snap.funnel.counts["已成交"]}`);
  lines.push(`# 高价值企业清单（eid|名称|楼层|行业|Tier|评分|管道匹配|状态|信号|NBA）`);
  snap.items
    .filter((i) => i.tier === "P0" || i.tier === "P1")
    .forEach((i) => {
      const sig = i.signals.map((s) => `${s.t}(${s.d})`).join(",") || "无";
      lines.push(`${i.eid}|${i.name}|${i.floor}|${i.ind}|${i.tier}|${i.score}|${i.pipeMatch}|${i.stage}|${sig}|${(i as { nba?: string }).nba ?? ""}`);
    });
  lines.push(`# 其余主体（eid|名称|楼层|行业|Tier|评分）`);
  snap.items
    .filter((i) => i.tier !== "P0" && i.tier !== "P1")
    .forEach((i) => lines.push(`${i.eid}|${i.name}|${i.floor}|${i.ind}|${i.tier}|${i.score}`));
  return lines.join("\n");
}

const SYSTEM_PROMPT = `你是「SPI-OS 园区智能作战台」的招商决策助手，服务电子科大国家大学科技园的运营团队。
规则：
1. 仅基于提供的园区快照数据回答，禁止编造数据中不存在的企业或数字；数据不足时明确说明。
2. 回答用简体中文（若用户用英文提问则用英文），风格：结论先行、条理化、无废话，像资深招商顾问。
3. 涉及具体企业时，必须在回答末尾输出联动定位指令。
4. 招商方案类请求：给出目标企业清单（按优先级）、切入点（结合信号/NBA）、触达路径、时间节奏，控制在400字内。
5. 合规红线：仅使用企业公开信息；不输出个人隐私；评分与建议均标注"由规则引擎/AI生成，供人工决策参考"。
输出必须是 JSON：{"answer":"markdown回答","highlights":[{"eid":"E703","screen":"radar"}]}
highlights 为需要在看板上高亮定位的企业（最多8家），screen 取 home|radar|referral|tasks 之一（企业分析定位radar，园区概览定位home，引荐路径定位referral，任务相关定位tasks）。无具体企业时返回空数组。`;

export async function askAssistant(question: string, mask: boolean, history: { role: "user" | "assistant"; content: string }[]) {
  const snap = await buildSnapshot({ maskSensitive: mask });
  const context = buildContext(snap);
  const nameMap = new Map(snap.items.map((i) => [i.eid, i.name]));

  const response = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `园区数据上下文：\n${context}` },
      ...history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
      { role: "user", content: question },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "assistant_reply",
        strict: true,
        schema: {
          type: "object",
          properties: {
            answer: { type: "string", description: "markdown 格式回答" },
            highlights: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  eid: { type: "string" },
                  screen: { type: "string", enum: ["home", "radar", "referral", "tasks"] },
                },
                required: ["eid", "screen"],
                additionalProperties: false,
              },
            },
          },
          required: ["answer", "highlights"],
          additionalProperties: false,
        },
      },
    },
  });

  const raw = response.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw : "";
  let parsed: { answer: string; highlights: { eid: string; screen: AiHighlight["screen"] }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { answer: text || "抱歉，本次生成失败，请重试。", highlights: [] };
  }
  const highlights: AiHighlight[] = (parsed.highlights ?? [])
    .filter((h) => nameMap.has(h.eid))
    .slice(0, 8)
    .map((h) => ({ eid: h.eid, name: nameMap.get(h.eid)!, screen: h.screen }));
  return { answer: parsed.answer, highlights };
}
