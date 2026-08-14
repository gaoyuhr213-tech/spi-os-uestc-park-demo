/* 迭代20 · 工单7 · Agent Runtime：三类 Agent 统一 Tool Contract + HITL
 * - Research（研究）/ Match（匹配）/ Outreach（触达）三类 Agent；
 * - 统一 Tool Contract：每个工具声明 name/description/riskLevel/requiresHuman；
 * - 关键动作（riskLevel=high）强制人审：Agent 只能产出「待确认建议」，
 *   由现有决策采纳流（decision.transition）承接人工确认——复用不重造；
 * - 全部工具为确定性内部函数调用，LLM 仅用于文本生成（经 llmGateway 护栏）。
 */
import { gatewayInvoke } from "./llmGateway";
import { findScoredPaths, findSimilarEntities } from "./graphIntel";
import { matchResources } from "./resourceMatch";
import { loadEntities, loadRules, buildExplainForEid } from "./dataAdapter";
import { calcEntity } from "./ruleEngine";
import { buildNeedCanvas, inferLifecycle } from "./decisionEngine";

/* ---------- 统一 Tool Contract ---------- */
export interface ToolContract {
  name: string;
  description: string;
  agent: "research" | "match" | "outreach";
  riskLevel: "low" | "medium" | "high";
  requiresHuman: boolean; // high 一律 true（HITL 铁律）
}

export const TOOL_REGISTRY: ToolContract[] = [
  { name: "entity_profile", description: "读取企业画像（评分/画布/阶段/信号）", agent: "research", riskLevel: "low", requiresHuman: false },
  { name: "similar_entities", description: "语义召回同类企业", agent: "research", riskLevel: "low", requiresHuman: false },
  { name: "research_brief", description: "生成企业研判简报（LLM）", agent: "research", riskLevel: "medium", requiresHuman: false },
  { name: "match_resources", description: "需求×资源匹配 Top-3", agent: "match", riskLevel: "low", requiresHuman: false },
  { name: "referral_paths", description: "Top-3 可信引荐路径", agent: "match", riskLevel: "low", requiresHuman: false },
  { name: "outreach_draft", description: "生成触达话术草稿（LLM）", agent: "outreach", riskLevel: "medium", requiresHuman: false },
  { name: "send_outreach", description: "对外发送触达消息", agent: "outreach", riskLevel: "high", requiresHuman: true },
  { name: "commit_deal", description: "承诺商务条款", agent: "outreach", riskLevel: "high", requiresHuman: true },
];

export interface AgentRunResult {
  agent: string;
  tool: string;
  ok: boolean;
  requiresHuman: boolean;
  humanGateNote: string | null;
  output: unknown;
  error: string | null;
}

/** 统一执行入口：按 Tool Contract 检查风险级别，high 直接返回人审门禁 */
export async function runAgentTool(tool: string, args: { eid?: string; text?: string; actor?: string | null }): Promise<AgentRunResult> {
  const contract = TOOL_REGISTRY.find((t) => t.name === tool);
  if (!contract) return { agent: "?", tool, ok: false, requiresHuman: false, humanGateNote: null, output: null, error: `未注册工具：${tool}` };
  const base = { agent: contract.agent, tool, requiresHuman: contract.requiresHuman };

  // HITL 铁律：高风险动作 Agent 不执行，产出待确认建议
  if (contract.requiresHuman) {
    return {
      ...base, ok: false,
      humanGateNote: "关键动作需人工确认（HITL）：请在决策中心采纳对应决策后由负责人执行，Agent 无权直接对外发送/承诺。",
      output: null, error: null,
    };
  }

  try {
    switch (tool) {
      case "entity_profile": {
        const [ents, rules] = await Promise.all([loadEntities(), loadRules()]);
        const e = ents.find((x) => x.eid === args.eid);
        if (!e) return { ...base, ok: false, humanGateNote: null, output: null, error: "企业不存在" };
        const calc = calcEntity(e as never, rules) as { score: number; tier: string };
        const lc = inferLifecycle(e as never);
        return { ...base, ok: true, humanGateNote: null, output: { eid: e.eid, name: e.name, ind: e.ind, score: calc.score, tier: calc.tier, phase: lc.phase, canvas: buildNeedCanvas(e as never, lc).filter((c) => c.stars >= 3) }, error: null };
      }
      case "similar_entities": {
        const r = await findSimilarEntities(args.eid ?? "", { maskSensitive: false });
        return { ...base, ok: !!r, humanGateNote: null, output: r, error: r ? null : "企业不存在" };
      }
      case "match_resources": {
        const [ents, rules] = await Promise.all([loadEntities(), loadRules()]);
        const e = ents.find((x) => x.eid === args.eid);
        if (!e) return { ...base, ok: false, humanGateNote: null, output: null, error: "企业不存在" };
        const lc = inferLifecycle(e as never);
        const canvas = buildNeedCanvas(e as never, lc);
        const top = canvas.sort((a, b) => b.stars - a.stars)[0];
        void rules;
        const matches = await matchResources(top?.tag ?? null, e.ind, lc.phase, 3);
        return { ...base, ok: true, humanGateNote: null, output: { need: top?.label, matches }, error: null };
      }
      case "referral_paths": {
        const r = await findScoredPaths(args.eid ?? "", { maskSensitive: false });
        return { ...base, ok: !!r, humanGateNote: null, output: r, error: r ? null : "目标不在图谱中" };
      }
      case "research_brief": {
        const explain = await buildExplainForEid(args.eid ?? "", { maskSensitive: false });
        if (!explain) return { ...base, ok: false, humanGateNote: null, output: null, error: "企业不存在" };
        const g = await gatewayInvoke({
          tier: "fast", agent: "research", actor: args.actor,
          system: "你是园区产业研究 Agent。基于给定的企业结构化数据生成 150 字内研判简报：现状一句话、关键信号、建议关注点。只用给定数据，不得编造。",
          user: JSON.stringify(explain).slice(0, 6000),
        });
        return { ...base, ok: g.ok, humanGateNote: null, output: g.ok ? { brief: g.content, model: g.model } : null, error: g.blockReason };
      }
      case "outreach_draft": {
        const paths = await findScoredPaths(args.eid ?? "", { maskSensitive: false });
        const g = await gatewayInvoke({
          tier: "quality", agent: "outreach", actor: args.actor,
          system: "你是园区触达话术 Agent。基于给定引荐路径生成 120 字内微信触达草稿，语气克制专业，注明经由哪条路径引荐，结尾约 30 分钟见面。草稿仅供人工确认后发送。",
          user: JSON.stringify(paths ?? { note: "无路径，走官方拜访" }).slice(0, 4000) + (args.text ? `\n补充要求：${args.text.slice(0, 500)}` : ""),
        });
        return { ...base, ok: g.ok, humanGateNote: "草稿需人工确认后方可发送（发送属高风险动作）", output: g.ok ? { draft: g.content, model: g.model } : null, error: g.blockReason };
      }
      default:
        return { ...base, ok: false, humanGateNote: null, output: null, error: "工具未实现" };
    }
  } catch (e) {
    // ADR-15：失败不得默认 Success
    return { ...base, ok: false, humanGateNote: null, output: null, error: String(e).slice(0, 150) };
  }
}

