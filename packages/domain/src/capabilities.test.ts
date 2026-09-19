import { describe, expect, it } from "vitest";
import {
  CAPABILITY_IDS,
  capabilities,
  capability,
  type CapabilityId,
} from "./capabilities.js";

describe("capability kernel", () => {
  it("keeps capability IDs unique and complete", () => {
    const ids = capabilities.map((item) => item.id);
    expect(ids).toEqual([...CAPABILITY_IDS]);
    expect(new Set(ids).size).toBe(CAPABILITY_IDS.length);
  });

  it("requires a responsibility and non-empty ownership contracts", () => {
    for (const item of capabilities) {
      expect(item.responsibility.trim().length).toBeGreaterThan(0);
      expect(item.owns.length).toBeGreaterThan(0);
      expect(item.doesNotOwn.length).toBeGreaterThan(0);
      expect(item.consumes.length).toBeGreaterThan(0);
      expect(item.produces.length).toBeGreaterThan(0);
      expect(item.currentPhase.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not claim business capabilities are implemented", () => {
    for (const item of capabilities) {
      expect(item.status).toBe("PLANNED");
      expect(item.status).not.toBe("ACTIVE");
      expect(item.status).not.toBe("FOUNDATION_ONLY");
    }
  });

  it("keeps reporting as a projection that does not own business truth", () => {
    expect(capability("REPORTING_PROJECTION").doesNotOwn).toContain(
      "underlying business truth",
    );
  });

  it("keeps commercial from owning EIC", () => {
    expect(capability("COMMERCIAL").doesNotOwn).toContain("EIC authority");
    expect(capability("COMMERCIAL").owns.join(" ")).not.toMatch(/\bEIC\b/);
  });

  it("keeps execution from owning attendance", () => {
    expect(capability("EXECUTION").doesNotOwn).toContain("attendance truth");
    expect(capability("EXECUTION").owns.join(" ")).not.toMatch(/attendance/i);
  });

  it("keeps people from owning labor cost basis", () => {
    expect(capability("PEOPLE").doesNotOwn).toContain("labor cost basis");
    expect(capability("PEOPLE").owns.join(" ")).not.toMatch(/labor cost/i);
  });

  it("resolves every declared capability id", () => {
    for (const id of CAPABILITY_IDS) {
      const resolved: CapabilityId = capability(id).id;
      expect(resolved).toBe(id);
    }
  });
});
