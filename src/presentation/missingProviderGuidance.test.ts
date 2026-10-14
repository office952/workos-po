import { describe, expect, it } from "vitest";
import type { WorkcentersAdminTransport } from "../adapters/workcentersAdapter";
import { presentMissingProviderGuidance } from "./missingProviderGuidance";

function registry(
  coverage: "COVERED" | "PROVIDER_PLANNED" | "NO_PROVIDER",
  canEdit: boolean,
): WorkcentersAdminTransport {
  return {
    canEdit,
    workcenters: [],
    machines: [],
    capabilities: [{ id: "PROFILE_FORMING", label: "Fălțuire profil" }],
    coverage: [
      {
        capabilityId: "PROFILE_FORMING",
        label: "Fălțuire profil",
        coverage,
        coverageLabel: coverage,
        providerLabels: [],
      },
    ],
  };
}

describe("presentMissingProviderGuidance", () => {
  it("names activation only when the server reports a planned provider", () => {
    const owner = presentMissingProviderGuidance({
      capabilityId: "PROFILE_FORMING",
      capabilityLabel: null,
      registry: registry("PROVIDER_PLANNED", true),
    });
    expect(owner.title).toBe("Utilaj / zonă neactivată");
    expect(owner.reason).toContain("„Fălțuire profil”");
    expect(owner.next).toContain("Activează zona sau utilajul");
    expect(owner.actionLabel).toBe("Deschide zone și utilaje");

    const member = presentMissingProviderGuidance({
      capabilityId: "PROFILE_FORMING",
      capabilityLabel: "Fălțuire profil",
      registry: registry("PROVIDER_PLANNED", false),
    });
    expect(member.next).toContain("proprietarul organizației");
    expect(member.actionLabel).toBe("Vezi zone și utilaje");
  });

  it("reports no available provider when the only capable resource is retired", () => {
    const retiredOnlyRegistry = registry("NO_PROVIDER", true);
    retiredOnlyRegistry.machines = [
      {
        id: "machine-retired",
        label: "Fălțuitor retras",
        description: "",
        workcenterId: "workcenter-1",
        workcenterLabel: "Atelier",
        lifecycle: "RETIRED",
        lifecycleLabel: "Retras",
        capabilityIds: ["PROFILE_FORMING"],
        capabilityLabels: ["Fălțuire profil"],
      },
    ];

    const owner = presentMissingProviderGuidance({
      capabilityId: "PROFILE_FORMING",
      capabilityLabel: "Fălțuire profil",
      registry: retiredOnlyRegistry,
    });
    expect(owner.title).toBe("Utilaj / zonă lipsă");
    expect(owner.reason).toBe(
      "Nu există momentan o zonă sau un utilaj disponibil pentru această capabilitate.",
    );
    expect(owner.next).toContain("Verifică resursele existente și starea lor");
    expect(owner.next).toContain("configurează sau activează o resursă eligibilă");
    expect(`${owner.reason} ${owner.next}`).not.toContain("Planificat");
    expect(owner.reason).not.toContain("Nicio zonă și niciun utilaj");

    const member = presentMissingProviderGuidance({
      capabilityId: "PROFILE_FORMING",
      capabilityLabel: "Fălțuire profil",
      registry: { ...retiredOnlyRegistry, canEdit: false },
    });
    expect(member.next).toContain("Proprietarul organizației gestionează aceste resurse");
  });

  it("stays conditional when coverage is unknown or does not match the capability", () => {
    for (const input of [
      { capabilityId: "PROFILE_FORMING", capabilityLabel: "Fălțuire profil", registry: null },
      {
        capabilityId: "CNC_ROUTING",
        capabilityLabel: "Debitare CNC",
        registry: registry("PROVIDER_PLANNED", true),
      },
      { capabilityId: null, capabilityLabel: null, registry: registry("PROVIDER_PLANNED", true) },
    ]) {
      const guidance = presentMissingProviderGuidance(input);
      expect(guidance.title).toBe("Utilaj / zonă lipsă");
      expect(guidance.next).toContain("Verifică în Administrare");
      expect(guidance.reason).not.toContain("Planificat");
    }
  });

  it("stays conditional when the registry already reports active coverage", () => {
    const guidance = presentMissingProviderGuidance({
      capabilityId: "PROFILE_FORMING",
      capabilityLabel: "Fălțuire profil",
      registry: registry("COVERED", true),
    });
    expect(guidance.title).toBe("Utilaj / zonă lipsă");
    expect(guidance.next).toContain("starea zonei și starea utilajului");
  });
});
