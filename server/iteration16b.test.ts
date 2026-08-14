/* V3 波次二/三/四 · 集成测试
   场景 OS / Graph What-if / Simulation / Memory / Agent 运行台 / Marketplace */
import { describe, it, expect } from "vitest";
import { buildScenarioBoard } from "./scenarioEngine";
import { whatIfEntity, simulateAttract, simulatePolicy, simulateResource } from "./graphCompute";
import { searchMemory, memoryStats } from "./memoryEngine";
import { AGENTS, buildAgentBoard } from "./agentRegistry";
import { MARKET_CATALOG } from "./marketplace";

describe("V3 波次二 · Scenario OS", () => {
  it("场景清单包含 4 个活跃场景且各有决策问题与 KPI", async () => {
    const sc = await buildScenarioBoard({ maskSensitive: false });
    expect(sc.length).toBeGreaterThanOrEqual(4);
    for (const s of sc.slice(0, 4)) {
      expect(s.decisionQuestion.length).toBeGreaterThan(4);
      expect(s.kpi.entities).toBeGreaterThanOrEqual(0);
      expect(s.agents.length).toBeGreaterThan(0);
    }
  });
});

describe("V3 波次三 · Graph What-if & Simulation", () => {
  it("E703 流失推演返回五维影响且税收为负向", async () => {
    const wi = await whatIfEntity("E703", "remove", { maskSensitive: false });
    expect(wi).not.toBeNull();
    expect(wi!.effects.length).toBeGreaterThanOrEqual(4);
    const tax = wi!.effects.find((e) => e.dim === "税收");
    expect(tax?.direction).toBe("down");
  });
  it("不存在企业返回 null", async () => {
    const wi = await whatIfEntity("E_NOPE", "remove", { maskSensitive: false });
    expect(wi).toBeNull();
  });
  it("招商模拟输出含税收/就业且随规模放大", async () => {
    const a = await simulateAttract("AI", 5, 30);
    const b = await simulateAttract("AI", 10, 30);
    expect(a.outputs.length).toBeGreaterThanOrEqual(4);
    const taxA = Number((a.outputs[0].value.match(/[\d.]+/) ?? ["0"])[0]);
    const taxB = Number((b.outputs[0].value.match(/[\d.]+/) ?? ["0"])[0]);
    expect(taxB).toBeGreaterThan(taxA);
  });
  it("政策与资源模拟器返回结构完整", async () => {
    const p = await simulatePolicy(60);
    const r = await simulateResource();
    for (const s of [p, r]) {
      expect(s.title.length).toBeGreaterThan(2);
      expect(s.timeline.length).toBeGreaterThan(0);
      expect(s.risks.length).toBeGreaterThan(0);
      expect(s.assumption.length).toBeGreaterThan(6);
    }
  });
});

describe("V3 波次四 · Memory / Agents / Marketplace", () => {
  it("组织记忆检索返回按时间倒序的条目", async () => {
    const mem = await searchMemory({ limit: 20, maskSensitive: false });
    expect(mem.length).toBeGreaterThan(0);
    for (let i = 1; i < mem.length; i++) expect(mem[i - 1].ts).toBeGreaterThanOrEqual(mem[i].ts);
  });
  it("记忆可按企业 eid 过滤", async () => {
    const mem = await searchMemory({ eid: "E703", limit: 30, maskSensitive: false });
    for (const m of mem) expect(m.eid).toBe("E703");
  });
  it("记忆统计五源齐全", async () => {
    const st = await memoryStats();
    expect(st.byKind.length).toBe(5);
    expect(st.total).toBeGreaterThan(0);
  });
  it("Agent 注册表 8 个且职责/输入/输出/协作完整，覆盖 Decision Loop 全环节", async () => {
    expect(AGENTS.length).toBe(8);
    for (const a of AGENTS) {
      expect(a.role.length).toBeGreaterThan(4);
      expect(a.inputs.length).toBeGreaterThan(0);
      expect(a.outputs.length).toBeGreaterThan(0);
      expect(a.collaborators.length).toBeGreaterThan(0);
    }
    const stages = new Set(AGENTS.map((a) => a.loopStage));
    for (const s of ["Signal", "Evidence", "Decision", "Execution", "Outcome"]) {
      expect([...stages].some((x) => x.includes(s))).toBe(true);
    }
    const board = await buildAgentBoard();
    expect(board.length).toBe(8);
  });
  it("Marketplace 覆盖六类商品且定价标注假设或订阅附带", () => {
    const cats = new Set(MARKET_CATALOG.map((m) => m.category));
    expect(cats.size).toBe(6);
    for (const m of MARKET_CATALOG) {
      expect(m.contains.length).toBeGreaterThan(0);
      expect(m.pricing.includes("假设") || m.pricing.includes("附带")).toBe(true);
    }
  });
});
