/* 迭代8 · 批量解析能力测试
   - matchEntity/normalizeCompanyName：企业名归一化与三态匹配（纯函数）
   - ai.parseIntelBatch：未登录 401 拦截（协议层）、输入长度校验 */
import { describe, expect, it } from "vitest";
import { matchEntity, normalizeCompanyName } from "./intelParser";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ENTITIES = [
  { eid: "E701", name: "成都眸视科技有限公司" },
  { eid: "E703", name: "四川中科维讯智能科技有限公司" },
  { eid: "E802", name: "北京富通东方科技有限公司" },
  { eid: "E610", name: "成都智汇广联科技有限公司" },
];

describe("normalizeCompanyName 归一化", () => {
  it("去除公司后缀与地域前缀", () => {
    expect(normalizeCompanyName("成都眸视科技有限公司")).toBe("眸视科技");
    expect(normalizeCompanyName("北京富通东方科技有限公司")).toBe("富通东方科技");
  });
  it("去除括号内容与空白", () => {
    expect(normalizeCompanyName("成都眸视科技（集团）有限公司")).toBe("眸视科技");
  });
});

describe("matchEntity 三态匹配", () => {
  it("全称一致 → 精确匹配", () => {
    const m = matchEntity("成都眸视科技有限公司", ENTITIES);
    expect(m.eid).toBe("E701");
    expect(m.exact).toBe(true);
  });
  it("名称包含 → 模糊匹配（exact=false）", () => {
    const m = matchEntity("中科维讯", ENTITIES);
    expect(m.eid).toBe("E703");
    expect(m.exact).toBe(false);
  });
  it("无关名称 → 未匹配", () => {
    const m = matchEntity("深圳完全无关企业有限公司", ENTITIES);
    expect(m.eid).toBeNull();
  });
  it("空名称 → 未匹配", () => {
    expect(matchEntity("", ENTITIES).eid).toBeNull();
  });
});

describe("ai.parseIntelBatch 权限与输入校验", () => {
  const anonCtx = { user: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] } as unknown as TrpcContext;

  it("未登录调用被拦截（UNAUTHORIZED）", async () => {
    const caller = appRouter.createCaller(anonCtx);
    await expect(
      caller.park.ai.parseIntelBatch({ text: "x".repeat(100) }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("文本过短被 zod 校验拦截（登录态）", async () => {
    const authedCtx = {
      user: { id: 1, openId: "u", name: "tester", email: null, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as unknown as TrpcContext;
    const caller = appRouter.createCaller(authedCtx);
    await expect(
      caller.park.ai.parseIntelBatch({ text: "太短" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
