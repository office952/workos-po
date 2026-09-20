import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCIAL_POLICY } from "./policy.js";
import type { CommercialPolicyVersionRecord } from "./policyVersion.js";
import {
  CODE_DEFAULT_POLICY_GUIDANCE,
  ORGANIZATION_POLICY_INACTIVE,
  codeDefaultCommercialPolicy,
  resolveCommercialPolicy,
} from "./resolvePolicy.js";

function organizationVersion(
  overrides: Partial<CommercialPolicyVersionRecord> = {},
): CommercialPolicyVersionRecord {
  return {
    policyVersionRowId: "cpv:test",
    policyId: "DEFAULT_COMMERCIAL_POLICY",
    version: 1,
    status: "ACTIVE",
    label: "Politică comercială organizație",
    markupPercent: 40,
    vatPercent: 19,
    defaultDiscountPercent: 5,
    defaultAdjustment: 10,
    currency: "EUR",
    rounding: 0.01,
    source: "ORGANIZATION",
    effectiveFrom: "2026-09-20T00:00:00.000Z",
    createdAt: "2026-09-20T00:00:00.000Z",
    supersedesVersion: null,
    ...overrides,
  };
}

describe("commercial policy resolver", () => {
  it("resolves CODE_DEFAULT when the organization has no rows", () => {
    const resolved = resolveCommercialPolicy([]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }
    expect(resolved.policy.source).toBe("CODE_DEFAULT");
    expect(resolved.policy.markupPercent).toBe(DEFAULT_COMMERCIAL_POLICY.markupPercent);
    expect(resolved.policy.vatPercent).toBe(DEFAULT_COMMERCIAL_POLICY.vatPercent);
    expect(codeDefaultCommercialPolicy().source).toBe("CODE_DEFAULT");
    expect(CODE_DEFAULT_POLICY_GUIDANCE).toMatch(/nu au fost încă confirmate/i);
  });

  it("resolves the organization ACTIVE version", () => {
    const resolved = resolveCommercialPolicy([
      organizationVersion({ version: 1, status: "RETIRED" }),
      organizationVersion({
        policyVersionRowId: "cpv:2",
        version: 2,
        status: "ACTIVE",
        markupPercent: 28,
        supersedesVersion: 1,
      }),
    ]);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      return;
    }
    expect(resolved.policy.source).toBe("ORGANIZATION");
    expect(resolved.policy.version).toBe(2);
    expect(resolved.policy.markupPercent).toBe(28);
  });

  it("fails closed when the organization owns rows but no ACTIVE exists", () => {
    const resolved = resolveCommercialPolicy([
      organizationVersion({ status: "RETIRED" }),
    ]);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) {
      return;
    }
    expect(resolved.error).toBe(ORGANIZATION_POLICY_INACTIVE);
    expect(resolved.reason).toMatch(/nu există o versiune activă/i);
  });

  it("does not silently fall back to CODE_DEFAULT after organization ownership", () => {
    const resolved = resolveCommercialPolicy([
      organizationVersion({ status: "DRAFT" }),
    ]);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) {
      return;
    }
    expect(resolved.error).toBe(ORGANIZATION_POLICY_INACTIVE);
  });
});
