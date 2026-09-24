import { describe, expect, it } from "vitest";
import { blankSiteInstallationFacts } from "./facts.js";
import { freezeSiteInstallationContexts } from "./hostContext.js";

function readyFacts(overrides: Partial<ReturnType<typeof blankSiteInstallationFacts>> = {}) {
  return {
    ...blankSiteInstallationFacts({
      requestId: "req:synthetic",
      createdAt: "2026-09-02T00:00:00.000Z",
    }),
    version: 3,
    street: "Strada Sintetică 1",
    city: "Oraș Sintetic",
    measurementStatus: "OFFICE_MEASURED" as const,
    facadeType: "CONCRETE" as const,
    fixingMethod: "MECHANICAL_ANCHOR" as const,
    siteElectrical: "NOT_APPLICABLE" as const,
    mountingSurfaceWidthMm: 2400,
    mountingSurfaceHeightMm: 800,
    crewSize: 2,
    plannedDurationHours: 3,
    contactName: "Contact Sintetic",
    contactPhone: "0700000000",
    ...overrides,
  };
}

describe("frozen host context", () => {
  it("derives host, mounting, and execution context from site facts", () => {
    const frozen = freezeSiteInstallationContexts(readyFacts(), "req:synthetic");
    expect(frozen?.hostContext).toMatchObject({
      schemaVersion: 1,
      kind: "EXISTING_SITE_SURFACE",
      sourceFactsVersion: 3,
      surfaceType: "CONCRETE",
      measurementStatus: "OFFICE_MEASURED",
      mountingSurfaceWidthMm: 2400,
      mountingSurfaceHeightMm: 800,
    });
    expect(frozen?.mountingInterface).toMatchObject({
      kind: "WORK_ON_EXISTING_HOST",
      fixingMethod: "MECHANICAL_ANCHOR",
    });
    expect(frozen?.siteExecutionContext).toMatchObject({
      street: "Strada Sintetică 1",
      city: "Oraș Sintetic",
      contactName: "Contact Sintetic",
      siteElectrical: "NOT_APPLICABLE",
    });
    expect(frozen?.hostContext).not.toHaveProperty("street");
    expect(frozen?.hostContext).not.toHaveProperty("contactName");
    expect(frozen?.hostContext).not.toHaveProperty("crewSize");
    expect(JSON.stringify(frozen?.hostContext)).not.toMatch(/EUR|price|ProductDefinition/);
  });

  it("keeps a frozen facts version after later request edits", () => {
    const frozen = freezeSiteInstallationContexts(readyFacts(), "req:synthetic");
    const later = readyFacts({
      version: 4,
      street: "Altă stradă",
      facadeType: "GLASS",
    });
    expect(freezeSiteInstallationContexts(later, "req:synthetic")?.hostContext.sourceFactsVersion).toBe(4);
    expect(frozen?.hostContext.sourceFactsVersion).toBe(3);
    expect(frozen?.hostContext.surfaceType).toBe("CONCRETE");
    expect(frozen?.siteExecutionContext.street).toBe("Strada Sintetică 1");
  });

  it("refuses electrical work that has no approved cost contract", () => {
    expect(
      freezeSiteInstallationContexts(
        readyFacts({ siteElectrical: "INCLUDED" }),
        "req:synthetic",
      ),
    ).toBeNull();
    expect(
      freezeSiteInstallationContexts(
        readyFacts({ siteElectrical: "SUBCONTRACTED" }),
        "req:synthetic",
      ),
    ).toBeNull();
    expect(
      freezeSiteInstallationContexts(
        readyFacts({ siteElectrical: "EXCLUDED_CUSTOMER_RESPONSIBILITY" }),
        "req:synthetic",
      ),
    ).not.toBeNull();
  });
});
