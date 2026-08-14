import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, STAGES, buildPitch, calcEntity, calcFunnel, calcKpis } from "./ruleEngine";
import { PARK_SEED } from "./parkData";
import { maskEntityName } from "./dataAdapter";

const toInput = (eid: string) => {
  const s = PARK_SEED.find((x) => x.eid === eid)!;
  return {
    eid: s.eid, name: s.name, ind: s.ind, baseScore: s.baseScore, hiringBase: s.hiringBase,
    cross: !!s.cross, tierRole: (s.tierRole ?? "tenant") as "tenant" | "operator" | "support",
    signals: s.signals, referralPath: s.referralPath ?? null, entryPoint: s.entryPoint ?? null, enrich: null,
  };
};

describe("calcEntity 评分与分级", () => {
  it("无富集时 P0 企业按基线分分级为 P0", () => {
    const r = calcEntity(toInput("E703"));
    expect(r.score).toBe(88);
    expect(r.tier).toBe("P0");
  });

  it("运营方/配套不参与评分", () => {
    expect(calcEntity(toInput("E401")).tier).toBe("运营方");
    expect(calcEntity(toInput("E101")).tier).toBe("配套");
  });

  it("富集数据触发加分与升级：高在招岗位数 + 已核验", () => {
    const base = toInput("E509"); // baseScore 72 → P1
    const r0 = calcEntity(base);
    expect(r0.tier).toBe("P1");
    const r1 = calcEntity({ ...base, enrich: { jobs: 15, verified: "已核验", patents: null, insured: null, funding: null, hiTech: null, keyContact: null, topJobs: null } });
    expect(r1.score).toBeGreaterThan(r0.score);
    expect(r1.enriched).toBe(true);
    expect(r1.tier).toBe("P0"); // 72+6+2+信号半分 ≥ 75 且有信号
  });

  it("P0 需要信号：高分无信号企业不升 P0", () => {
    const base = { ...toInput("E504"), baseScore: 80, signals: [] };
    expect(calcEntity(base).tier).toBe("P1");
  });

  it("12 维拆解权重合计 100", () => {
    const r = calcEntity(toInput("E703"));
    expect(r.dims.reduce((a, [, , w]) => a + w, 0)).toBe(100);
  });
});

describe("calcKpis KPI 聚合", () => {
  it("聚合口径正确且健康指数 ≤ 100", () => {
    const results = PARK_SEED.map((s) => ({ ...calcEntity(toInput(s.eid)), signals: s.signals }));
    const k = calcKpis(results);
    expect(k.total).toBe(PARK_SEED.length);
    expect(k.p0 + k.p1).toBe(k.highValue);
    expect(k.healthIndex).toBeLessThanOrEqual(100);
    expect(k.matchRate).toBeGreaterThan(0);
  });
});

describe("buildPitch 双版话术", () => {
  it("正式版与轻量版内容不同且都包含企业短名", () => {
    const x = { ...toInput("E703"), tier: "P0" };
    const formal = buildPitch(x, "formal");
    const light = buildPitch(x, "light");
    expect(formal).not.toBe(light);
    expect(formal).toContain("成都眸视科技");
    expect(formal).toContain("园区官方"); // 路径B
    expect(light).toContain("30 分钟");
  });

  it("路径A走校企开场；富集在招岗位数会注入话术", () => {
    const x = { ...toInput("E411"), tier: "P0", enrich: { jobs: 8, patents: null, insured: null, funding: null, hiTech: null, verified: null, keyContact: null, topJobs: null } };
    const formal = buildPitch(x, "formal");
    expect(formal).toContain("引荐人");
    expect(formal).toContain("在招岗位 8 个");
  });
});

describe("calcFunnel 转化漏斗", () => {
  it("未标记时全部计入未触达", () => {
    const f = calcFunnel(new Map(), ["E1", "E2", "E3"]);
    expect(f.counts.未触达).toBe(3);
    expect(f.reachRate).toBe(0);
  });
  it("阶段转化率按漏斗层级计算", () => {
    const m = new Map<string, (typeof STAGES)[number]>([
      ["E1", "已触达"], ["E2", "已约见"], ["E3", "已成交"], ["E4", "未触达"],
    ]);
    const f = calcFunnel(m, ["E1", "E2", "E3", "E4"]);
    expect(f.reachRate).toBe(75); // 3/4
    expect(f.meetRate).toBe(67); // 2/3
    expect(f.winRate).toBe(50); // 1/2
  });
});

describe("maskEntityName 脱敏", () => {
  it("保留头尾并打码中段", () => {
    const m = maskEntityName("成都眸视科技有限公司");
    expect(m).toContain("*");
    expect(m.startsWith("成都")).toBe(true);
    expect(m.endsWith("有限公司")).toBe(true);
    expect(m).not.toContain("眸视");
  });
});
