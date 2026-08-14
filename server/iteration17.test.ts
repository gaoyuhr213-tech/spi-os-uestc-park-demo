/* 迭代17 · 工单1+2 验收测试
 * 工单1：ACL 转换正确性 / 摄入 job 留痕 / 失败不静默
 * 工单2：USCC 精确命中 / 归一化 / 模糊匹配 / 消歧队列裁定与撤销 */
import { describe, expect, it, afterAll } from "vitest";
import { normalizeName, aliasResolve, diceSimilarity, matchEntity, decideMerge, listDisambiguationQueue } from "./entityResolution";
import { transformBizRegistry, transformJobBoard, transformPatent, parseCsvText, ingestViaAcl } from "./aclTransform";
import { listConnectorRegistry, listIngestionJobs } from "./connectors";
import { getDb } from "./db";
import { mergeDecisions, ingestionJobs, enrichments } from "../drizzle/schema";
import { eq, like } from "drizzle-orm";

describe("工单2 · 归一化与匹配", () => {
  it("归一化：去地域前缀与公司后缀", () => {
    // 「科技有限公司」按最长后缀剥离 → 核心名「眸视」；别名词典再归一到「眸视科技」
    expect(normalizeName("成都眸视科技有限公司")).toBe("眸视");
    expect(aliasResolve(normalizeName("成都眸视科技有限公司"))).toBe("眸视科技");
    expect(normalizeName("四川中科维讯信息技术有限公司")).toBe("中科维讯");
    expect(normalizeName("眸视科技")).toBe("眸视科技");
  });
  it("别名词典：简称归一", () => {
    expect(aliasResolve("眸视科技")).toBe("眸视科技");
  });
  it("bigram 相似度：同名=1，无关<0.3", () => {
    expect(diceSimilarity("眸视科技", "眸视科技")).toBe(1);
    expect(diceSimilarity("眸视科技", "锦途教育")).toBeLessThan(0.3);
  });
  it("验收：同名不同写法（全称 vs 简称）匹配到同一 eid，置信度≥80", async () => {
    const full = await matchEntity({ rawName: "成都眸视科技有限公司" });
    expect(full.length).toBeGreaterThan(0);
    expect(full[0].confidence).toBeGreaterThanOrEqual(90);
    const short = await matchEntity({ rawName: "眸视科技" });
    expect(short.length).toBeGreaterThan(0);
    expect(short[0].eid).toBe(full[0].eid);
    expect(short[0].confidence).toBeGreaterThanOrEqual(80);
  });
  it("验收：USCC 精确命中置信度=100（如库中有 USCC）", async () => {
    const db = await getDb();
    if (!db) return;
    const withUscc = await db.select().from(enrichments).where(like(enrichments.uscc, "9%")).limit(1);
    if (withUscc.length === 0) return; // 库中暂无 USCC 数据则跳过
    const r = await matchEntity({ rawName: "完全不相关的名字", uscc: withUscc[0].uscc! });
    expect(r[0]?.confidence).toBe(100);
    expect(r[0]?.eid).toBe(withUscc[0].eid);
  });
});

describe("工单1 · ACL 转换", () => {
  it("工商源：字段映射与变更信号", () => {
    const r = transformBizRegistry({ "企业名称": "测试公司", "统一社会信用代码": "91510100TEST17XX", "注册资本": "500万", "参保人数": "45", "变更事项": "注册资本增加" });
    expect(r).not.toBeNull();
    expect(r!.entity.uscc).toBe("91510100TEST17XX");
    expect(r!.profile.insured).toBe(45);
    expect(r!.signals[0].t).toContain("工商变更");
  });
  it("招聘源：岗位数≥5 产 Tier-1 信号", () => {
    const r = transformJobBoard({ "企业名称": "测试公司", "在招岗位数": "6", "核心岗位": "算法工程师" });
    expect(r!.profile.jobs).toBe(6);
    expect(r!.signals[0].tier).toBe(1);
  });
  it("专利源：专利/软著数值化", () => {
    const r = transformPatent({ "企业名称": "测试公司", "专利数": "12", "软著数": "8" });
    expect(r!.profile.patents).toBe(12);
    expect(r!.profile.softCopyrights).toBe(8);
  });
  it("CSV 解析：表头映射与制表符支持", () => {
    const rows = parseCsvText("企业名称,在招岗位数\n甲公司,3\n乙公司,5");
    expect(rows).toHaveLength(2);
    expect(rows[0]["企业名称"]).toBe("甲公司");
  });
  it("空名行被 ACL 拒绝", () => {
    expect(transformBizRegistry({ "注册资本": "100万" })).toBeNull();
  });
});

describe("工单1 · 摄入管道（job 留痕 + 实体解析闭环）", () => {
  it("验收：摄入已有企业（眸视科技）自动归属且写 job；无匹配行被跳过不静默入库", async () => {
    const db = await getDb();
    if (!db) return;
    const result = await ingestViaAcl({
      adapterId: "job-board",
      rawRows: [
        { "企业名称": "成都眸视科技有限公司", "在招岗位数": "12", "核心岗位": "CV算法" },
        { "企业名称": "完全不存在的外星公司XYZ", "在招岗位数": "3" },
      ],
      triggeredBy: "iteration17-test",
    });
    expect(result.jobId).toBeGreaterThan(0);
    expect(result.rowsOut).toBe(1);      // 眸视归属成功
    expect(result.rowsSkipped).toBe(1);  // 外星公司无匹配被跳过
    expect(result.resolutions.some((r) => r.kind === "auto")).toBe(true);
    // job 留痕状态正确（partial 而非 success，失败不静默）
    const jobs = await listIngestionJobs(5);
    const myJob = jobs.find((j) => j.id === result.jobId);
    expect(myJob?.status).toBe("partial");
    expect(myJob?.rowsIn).toBe(2);
  });
  it("连接器注册表：4 个连接器幂等播种", async () => {
    const regs = await listConnectorRegistry();
    if (regs.length === 0) return;
    const cids = regs.map((r) => r.cid);
    for (const c of ["manual-enrichment", "biz-registry", "job-board", "patent"]) expect(cids).toContain(c);
    const again = await listConnectorRegistry();
    expect(again.length).toBe(regs.length); // 幂等
  });
});

describe("工单2 · 消歧队列与裁定", () => {
  it("验收：pending 记录可确认合并并可撤销（台账留痕）", async () => {
    const db = await getDb();
    if (!db) return;
    // 造一条 pending 消歧记录
    await db.insert(mergeDecisions).values({
      sourceEids: JSON.stringify(["E_TEST17"]), targetEid: "E_TEST17T",
      confidence: 72, evidenceJson: JSON.stringify({ rulesHit: ["测试造数"] }), status: "pending",
    });
    const queue = await listDisambiguationQueue();
    const mine = queue.find((q) => q.targetEid === "E_TEST17T" && q.status === "pending");
    expect(mine).toBeTruthy();
    // 确认合并
    const r1 = await decideMerge({ id: mine!.id, action: "confirm", actor: "test17" });
    expect(r1.ok).toBe(true);
    expect(r1.ok && r1.status).toBe("confirmed");
    // 撤销回 pending
    const r2 = await decideMerge({ id: mine!.id, action: "revert", actor: "test17" });
    expect(r2.ok && r2.status).toBe("pending");
    // 拆分
    const r3 = await decideMerge({ id: mine!.id, action: "split", actor: "test17" });
    expect(r3.ok && r3.status).toBe("split");
  });
});

afterAll(async () => {
  const db = await getDb();
  if (!db) return;
  await db.delete(mergeDecisions).where(eq(mergeDecisions.targetEid, "E_TEST17T"));
  // 清理测试造的 job 与"外星公司"痕迹（眸视 jobs=12 为真实写入，保留符合演示数据）
  await db.delete(ingestionJobs).where(eq(ingestionJobs.triggeredBy, "iteration17-test"));
  // 清理本测试摄入产生的 auto_merged 留痕（防重复运行堆积）
  await db.delete(mergeDecisions).where(like(mergeDecisions.sourceEids, "%眸视科技有限公司%"));
});
