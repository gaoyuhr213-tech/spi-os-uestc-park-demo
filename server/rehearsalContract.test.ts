import { describe, expect, it } from "vitest";
import { validateRehearsalContract } from "../scripts/rehearsal/validate-contract.mjs";

describe("migration rehearsal canonical baseline contract", () => {
  it("keeps the 69-entity dual-tenant fixture, source authority boundary and readiness scenarios complete", () => {
    const result = validateRehearsalContract();
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.migrationCount).toBe(11);
    expect(result.fixtureId).toBe("spios-production-like-synthetic-v2");
  });
});
