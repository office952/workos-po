import { describe, expect, it } from "vitest";
import { blankSiteInstallationFacts } from "./facts.js";
import {
  freezeSiteInstallationContexts,
  projectSiteInstallationOperationalView,
} from "./hostContext.js";

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

  it("keeps crew on an internal freeze and omits it from a subcontracted freeze", () => {
    const internal = freezeSiteInstallationContexts(readyFacts(), "req:synthetic", "INTERNAL");
    expect(internal?.siteExecutionContext.crewSize).toBe(2);
    expect(internal?.siteExecutionContext.plannedDurationHours).toBe(3);
    const subcontracted = freezeSiteInstallationContexts(
      readyFacts(),
      "req:synthetic",
      "SUBCONTRACTED",
    );
    expect(subcontracted?.siteExecutionContext).not.toHaveProperty("crewSize");
    expect(subcontracted?.siteExecutionContext).not.toHaveProperty("plannedDurationHours");
    expect(subcontracted?.hostContext.surfaceType).toBe("CONCRETE");
  });

  it("copies OTHER notes into the operational view and omits them for ordinary values", () => {
    const otherFrozen = freezeSiteInstallationContexts(
      readyFacts({
        facadeType: "OTHER",
        facadeOtherNote: "Suprafață sintetică specială",
        fixingMethod: "OTHER",
        fixingOtherNote: "Fixare sintetică specială",
      }),
      "req:synthetic",
      "INTERNAL",
    );
    expect(otherFrozen).not.toBeNull();
    if (!otherFrozen) {
      return;
    }
    const otherView = projectSiteInstallationOperationalView({
      providerMode: "INTERNAL",
      hostContext: otherFrozen.hostContext,
      mountingInterface: otherFrozen.mountingInterface,
      siteExecutionContext: otherFrozen.siteExecutionContext,
    });
    expect(otherView.surfaceTypeLabel).toBe("Altul");
    expect(otherView.surfaceOtherNote).toBe("Suprafață sintetică specială");
    expect(otherView.fixingMethodLabel).toBe("Altul");
    expect(otherView.fixingOtherNote).toBe("Fixare sintetică specială");
    expect(otherView.crewSize).toBe(2);
    expect(otherView.plannedDurationHours).toBe(3);

    const ordinaryFrozen = freezeSiteInstallationContexts(
      readyFacts(),
      "req:synthetic",
      "SUBCONTRACTED",
    );
    expect(ordinaryFrozen).not.toBeNull();
    if (!ordinaryFrozen) {
      return;
    }
    const ordinaryView = projectSiteInstallationOperationalView({
      providerMode: "SUBCONTRACTED",
      hostContext: ordinaryFrozen.hostContext,
      mountingInterface: ordinaryFrozen.mountingInterface,
      siteExecutionContext: ordinaryFrozen.siteExecutionContext,
    });
    expect(ordinaryView.surfaceTypeLabel).toBe("Beton");
    expect(ordinaryView.surfaceOtherNote).toBeNull();
    expect(ordinaryView.fixingMethodLabel).toBe("Ancoră mecanică");
    expect(ordinaryView.fixingOtherNote).toBeNull();
    expect(ordinaryView.crewSize).toBeNull();
    expect(ordinaryView.plannedDurationHours).toBeNull();
  });
});
