import { describe, expect, it } from "vitest";
import { capabilities } from "../capabilities.js";
import {
  implementationStateLabel,
  projectSystemGovernance,
} from "./projection.js";

describe("system governance projection", () => {
  it("projects current authority boundaries without a fake freeze", () => {
    const governance = projectSystemGovernance();
    const byId = Object.fromEntries(
      governance.authorities.map((item) => [item.id, item]),
    );
    expect(byId.PRODUCT?.state).toBe("IMPLEMENTED");
    expect(byId.COMPONENT_TECHNICAL_SETTINGS?.state).toBe("IMPLEMENTED");
    expect(byId.COMPONENT_TECHNICAL_SETTINGS?.owns).toEqual(
      expect.arrayContaining([
        "parametrii tehnici reutilizabili activi pentru variantele de componentă",
      ]),
    );
    expect(byId.COMMERCIAL?.state).toBe("IMPLEMENTED");
    expect(byId.COMMERCIAL?.owns).toEqual([
      "preț client",
      "reguli comerciale",
      "snapshot ofertă",
      "identitate vânzător curentă",
      "document ofertă PDF (proiecție)",
      "acceptare ofertă",
      "snapshot comandă",
    ]);
    expect(byId.EXECUTION?.state).toBe("NOT_IMPLEMENTED");
    expect(byId.ANALYZER?.state).toBe("NOT_IMPLEMENTED");
    expect(governance.freeze.state).toBe("PLANNED");
    expect(governance.freeze.note).toMatch(/Nu este activă/);
    expect(governance.sources).toContain(
      "Setările tehnice canonice ale variantelor de componentă",
    );
    expect(governance.sources).toContain(
      "Harta canonică de domenii și administrare",
    );
    expect(governance.roadmap.find((item) => item.id === "admin-map")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(
      governance.roadmap.find((item) => item.id === "product-system-admin")?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.sources).toContain(
      "Metadatele de afișare persistate ale Product System",
    );
    expect(
      governance.roadmap.find((item) => item.id === "display-label-write")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "resources-catalog-foundation")
        ?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "resource-admin-write")?.state,
    ).toBe("NOT_IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "operational-processes")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "letters-process-composition")
        ?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "execution-plan-preview")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "accepted-production-snapshot")
        ?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "execution-plan")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "execution-tasks")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "execution-task-lifecycle")
        ?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "execution-completion-evidence")
        ?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.roadmap.find((item) => item.id === "people-registry")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(
      governance.roadmap.find((item) => item.id === "execution-task-executor")?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.roadmap.find((item) => item.id === "people-skills")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(
      governance.authorities.find((item) => item.id === "WORKCENTERS_MACHINES")?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.roadmap.find((item) => item.id === "workcenters")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(
      governance.roadmap.find((item) => item.id === "assembly-workcenters")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "shopfloor-process-completion")
        ?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.roadmap.find((item) => item.id === "machines")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(
      governance.roadmap.find((item) => item.id === "capacity-planning")?.state,
    ).toBe("NOT_IMPLEMENTED");
    expect(governance.boundaries.find((item) => item.id === "machines")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(
      governance.boundaries.find((item) => item.id === "capacity-planning")?.state,
    ).toBe("NOT_IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "process-admin-write")?.state,
    ).toBe("NOT_IMPLEMENTED");
    expect(
      governance.authorities.find((item) => item.id === "OPERATIONAL_PROCESSES")
        ?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.boundaries.find((item) => item.id === "inventory")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.authorities.find((item) => item.id === "INVENTORY")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "inventory-stock-movements")
        ?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.roadmap.find((item) => item.id === "inventory")?.state).toBe(
      "NOT_IMPLEMENTED",
    );
    expect(
      governance.roadmap.find((item) => item.id === "execution-actual-internal-cost")
        ?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.boundaries.find((item) => item.id === "actual-internal-cost")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "technical-settings-write")
        ?.state,
    ).toBe("NOT_IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "lighting-foundation")?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.roadmap.find((item) => item.id === "lighting-foundation")?.label).toBe(
      "Fundație calcul iluminare",
    );
    expect(governance.roadmap.find((item) => item.id === "lighting")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(governance.roadmap.find((item) => item.id === "lighting")?.label).toBe(
      "Calcul complet iluminare",
    );
    expect(
      governance.authorities.find((item) => item.id === "AUTHORIZATION")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.authorities.find((item) => item.id === "CLOUD_CONTROL_PLANE")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.boundaries.find((item) => item.id === "cloud-foundation")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "cloud-foundation-v1")?.state,
    ).toBe("IMPLEMENTED");
    expect(
      governance.roadmap.find((item) => item.id === "real-hub-media-cloud-pilot")
        ?.state,
    ).toBe("NOT_IMPLEMENTED");
    expect(
      governance.boundaries.find((item) => item.id === "intake-settings")?.statement,
    ).toMatch(/Intake nu deține setările tehnice/);
    expect(implementationStateLabel("NOT_IMPLEMENTED")).toBe("Neimplementat");
  });

  it("keeps owner gates and implemented vs planned distinction", () => {
    const governance = projectSystemGovernance();
    expect(governance.ownerGates.map((item) => item.id)).toEqual([
      "scope",
      "commercial",
      "second-product",
      "analyzer",
      "db",
      "invented",
    ]);
    expect(
      governance.roadmap.find((item) => item.id === "commercial-price-rules")?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.roadmap.find((item) => item.id === "quote-snapshot")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(governance.roadmap.find((item) => item.id === "quote-document-pdf")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(governance.roadmap.find((item) => item.id === "quote-acceptance")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(governance.roadmap.find((item) => item.id === "order-snapshot")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(
      governance.roadmap.find((item) => item.id === "frozen-production-input")?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.roadmap.find((item) => item.id === "commercial")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(
      governance.roadmap.find((item) => item.id === "execution-from-order-release")?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.roadmap.find((item) => item.id === "execution-workspace")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(
      governance.roadmap.find((item) => item.id === "operational-job-overview")?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.boundaries.find((item) => item.id === "commercial")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(governance.roadmap.find((item) => item.id === "catalog")?.state).toBe(
      "IMPLEMENTED",
    );
    expect(governance.authorities.find((item) => item.id === "CUSTOMER")?.owns).toEqual([
      "profilul curent",
      "starea ACTIVE / RETIRED",
    ]);
    expect(
      governance.authorities.find((item) => item.id === "COMMERCIAL_REQUEST")?.state,
    ).toBe("IMPLEMENTED");
    expect(governance.boundaries.find((item) => item.id === "client-workspace")?.statement).toMatch(
      /Nu deține profil/,
    );
    expect(governance.roadmap.find((item) => item.id === "client-workspace")?.state).toBe(
      "IMPLEMENTED",
    );
  });

  it("does not promote the capability kernel to ACTIVE", () => {
    const governance = projectSystemGovernance();
    expect(governance.capabilityKernelStatuses).toEqual(
      capabilities.map((item) => ({ id: item.id, status: "PLANNED" })),
    );
  });
});
