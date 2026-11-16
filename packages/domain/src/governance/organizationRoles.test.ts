import { describe, expect, it } from "vitest";
import { resolveFinancialAccess } from "../commercial/financialAccess.js";
import {
  ORGANIZATION_CAPABILITIES,
  ORGANIZATION_ROLES,
  ROLE_CAPABILITIES,
  activeStatusForRole,
  capabilitiesForRole,
  isActiveMembershipPair,
  isValidMembershipPair,
  narrowFinancialScope,
  roleCan,
  roleFinancialScope,
} from "./organizationRoles.js";

describe("organization roles and capabilities (V1)", () => {
  it("owner holds every capability", () => {
    for (const capability of ORGANIZATION_CAPABILITIES) expect(roleCan("owner", capability)).toBe(true);
  });

  it("member keeps exactly the pre-V1 owner-only boundary: no owner-only capability", () => {
    const ownerOnly = [
      "org.access.manage", "org.settings.manage", "costs.internal.read", "costs.internal.manage",
      "resources.manage", "customers.terms.write", "requests.decide", "assemblies.manage",
      "prices.manual.set", "quotes.accept", "production.release", "planning.manage",
      "execution.supervise", "inventory.adjust",
    ] as const;
    for (const capability of ownerOnly) expect(roleCan("member", capability)).toBe(false);
    for (const capability of ["customers.read", "customers.terms.read", "quotes.read", "quotes.create", "execution.operate", "org.access.read"] as const) {
      expect(roleCan("member", capability)).toBe(true);
    }
  });

  it("production plans and supervises but never sees money, people/PIN or stock administration (D4)", () => {
    for (const capability of ["planning.manage", "production.release", "execution.supervise", "jobs.read"] as const) {
      expect(roleCan("production", capability)).toBe(true);
    }
    for (const capability of ["prices.client.read", "costs.internal.read", "customers.terms.read", "customers.financials.read", "quotes.read", "resources.manage", "inventory.adjust", "quotes.accept", "org.access.read"] as const) {
      expect(roleCan("production", capability)).toBe(false);
    }
  });

  it("workshop only reads released work and operates execution", () => {
    expect(capabilitiesForRole("workshop")).toEqual(["jobs.read", "execution.operate"]);
  });

  it("an unknown role has no capability and is never treated as member", () => {
    for (const role of ["auditor", "MEMBER", "", null, undefined, 7]) {
      for (const capability of ORGANIZATION_CAPABILITIES) expect(roleCan(role, capability)).toBe(false);
      expect(capabilitiesForRole(role)).toEqual([]);
      expect(roleFinancialScope(role)).toBe("workshop");
    }
  });

  it("stores new roles with ACTIVE_SCOPED and legacy roles with ACTIVE", () => {
    expect(activeStatusForRole("owner")).toBe("ACTIVE");
    expect(activeStatusForRole("member")).toBe("ACTIVE");
    expect(activeStatusForRole("production")).toBe("ACTIVE_SCOPED");
    expect(activeStatusForRole("workshop")).toBe("ACTIVE_SCOPED");
    expect(isActiveMembershipPair("workshop", "ACTIVE")).toBe(false);
    expect(isActiveMembershipPair("member", "ACTIVE_SCOPED")).toBe(false);
    expect(isActiveMembershipPair("auditor", "ACTIVE")).toBe(false);
    expect(isValidMembershipPair("production", "REVOKED")).toBe(true);
    expect(isValidMembershipPair("production", "ACTIVE")).toBe(false);
  });

  it("financial scope never exceeds the role", () => {
    expect(roleFinancialScope("owner")).toBe("owner");
    expect(roleFinancialScope("member")).toBe("commercial");
    expect(roleFinancialScope("production")).toBe("workshop");
    expect(narrowFinancialScope("owner", "member")).toBe("commercial");
    expect(narrowFinancialScope("commercial", "workshop")).toBe("workshop");
    expect(narrowFinancialScope("workshop", "owner")).toBe("workshop");
    expect(resolveFinancialAccess({ family: "commercial", isOwner: true, role: "owner" })).toBe("owner");
    expect(resolveFinancialAccess({ family: "commercial", isOwner: false, role: "member" })).toBe("commercial");
    expect(resolveFinancialAccess({ family: "commercial", isOwner: false, role: "production" })).toBe("workshop");
    expect(resolveFinancialAccess({ family: "commercial", isOwner: false, role: "auditor" })).toBe("workshop");
    expect(resolveFinancialAccess({ family: "workshop", isOwner: true, role: "owner" })).toBe("workshop");
    // Legacy callers without a role keep the old behaviour exactly.
    expect(resolveFinancialAccess({ family: "commercial", isOwner: false })).toBe("commercial");
  });

  it("every role entry references only catalogued capabilities", () => {
    for (const role of ORGANIZATION_ROLES) {
      for (const capability of ROLE_CAPABILITIES[role]) expect(ORGANIZATION_CAPABILITIES).toContain(capability);
    }
  });
});
