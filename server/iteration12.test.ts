/* 迭代12 · 解析历史溯源 / Intent 补强 / 分享卡片 测试
   - parseHistory：落库→列表→字段级溯源（最近写入者优先）
   - intents：IPO 与融资拆分为独立标签；funding_active 命中融资类信号
   - shareCard：parse/stage 两场景卡片结构与内容 */
import { beforeAll, describe, expect, it } from "vitest";
import { buildFieldSources, listParseHistory, recordParseHistory } from "./parseHistory";
import { buildShareCard } from "./shareCard";
import { DEFAULT_RULES, inferIntents, type CalcInput } from "./ruleEngine";
import { getDb } from "./db";
import { parseHistory } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const TEST_EID = "E_TEST12";

function mkInput(partial: Partial<CalcInput>): CalcInput {
  return {
    eid: "E1", name: "测试企业", ind: "软件", baseScore: 70, hiringBase: "高",
    cross: false, tierRole: "tenant", signals: [], referralPath: "B", entryPoint: null,
    note: null, enrich: null, ...partial,
  };
}

describe("迭代12 · 解析历史与字段级溯源", () => {
  beforeAll(async () => {
    // 清理测试残留
    const db = await getDb();
    if (db) await db.delete(parseHistory).where(eq(parseHistory.eid, TEST_EID));
  });

  it("recordParseHistory 落库后 listParseHistory 可回读（倒序）", async () => {
    await recordParseHistory({
      eid: TEST_EID, sourceType: "ai_parse", rawText: "公开工商文本快照A",
      result: { insured: 45, jobs: 12 }, fieldsWritten: ["insured", "jobs"],
      confidence: "高", actor: "vitest",
    });
    await recordParseHistory({
      eid: TEST_EID, sourceType: "excel_import", rawText: null,
      result: { jobs: 20, patents: 3 }, fieldsWritten: ["jobs", "patents"],
      actor: "vitest",
    });
    const items = await listParseHistory(TEST_EID);
    expect(items.length).toBeGreaterThanOrEqual(2);
    // 倒序：最新的 excel_import 在前
    expect(items[0].sourceType).toBe("excel_import");
    expect(items[0].fieldsWritten).toContain("patents");
    expect(items[1].rawText).toBe("公开工商文本快照A");
    expect(items[1].confidence).toBe("高");
    expect(items[0].sourceLabel).toBe("Excel 导入");
  });

  it("buildFieldSources：字段归属最近一次写入批次（jobs → excel_import；insured → ai_parse）", async () => {
    const src = await buildFieldSources(TEST_EID);
    expect(src.jobs).toBeDefined();
    expect(src.jobs.sourceLabel).toBe("Excel 导入");
    expect(src.insured).toBeDefined();
    expect(src.insured.sourceLabel).toBe("AI 解析（单家）");
    expect(src.patents.sourceLabel).toBe("Excel 导入");
  });
});

describe("迭代12 · Intent 标签补强", () => {
  it("融资信号命中 funding_active 而非 ipo（口径拆分）", () => {
    const x = mkInput({ signals: [{ d: "07-01", t: "完成A轮融资", tier: 2 }] });
    const tags = inferIntents(x, DEFAULT_RULES).map((t) => t.tag);
    expect(tags).toContain("funding_active");
    expect(tags).not.toContain("ipo");
  });
  it("股改/上市辅导信号命中 ipo", () => {
    const x = mkInput({ signals: [{ d: "07-01", t: "启动股改并进入上市辅导", tier: 1 }] });
    const tags = inferIntents(x, DEFAULT_RULES).map((t) => t.tag);
    expect(tags).toContain("ipo");
  });
  it("意图标签输出含触发规则与命中证据（可解释）", () => {
    const x = mkInput({ signals: [{ d: "07-01", t: "扩租独占6间", tier: 1 }] });
    const tags = inferIntents(x, DEFAULT_RULES);
    const exp = tags.find((t) => t.tag === "expansion");
    expect(exp).toBeDefined();
    expect(exp!.rule.length).toBeGreaterThan(0);
    expect(exp!.hits.length).toBeGreaterThan(0);
  });
});

describe("迭代12 · 企微/飞书分享卡片", () => {
  it("parse 场景：卡片含企业名/评分/写入字段，plain 无 markdown 加粗", async () => {
    const card = await buildShareCard({
      eid: "E703", scene: "parse", mask: false,
      extra: { fieldsWritten: ["insured", "jobs"] },
    });
    expect(card).not.toBeNull();
    expect(card!.title).toContain("情报更新");
    expect(card!.text).toContain("本次回填字段");
    expect(card!.plain).not.toContain("**");
    expect(card!.text).toContain("SPI-OS");
  });
  it("stage 场景：卡片含状态推进与下一步指引", async () => {
    const card = await buildShareCard({
      eid: "E703", scene: "stage", mask: false,
      extra: { stage: "已约见", note: "首轮会议顺利" },
    });
    expect(card).not.toBeNull();
    expect(card!.title).toContain("作战推进");
    expect(card!.text).toContain("已约见");
    expect(card!.text).toContain("下一步");
    expect(card!.text).toContain("首轮会议顺利");
  });
  it("企业不存在返回 null", async () => {
    const card = await buildShareCard({ eid: "E_NOT_EXIST", scene: "parse", mask: false });
    expect(card).toBeNull();
  });
});
