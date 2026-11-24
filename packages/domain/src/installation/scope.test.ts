import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCIAL_POLICY } from "../commercial/policy.js";
import { projectManualFixedServicePrice } from "../commercial/servicePrice.js";
import {
  LAB_SITE_INSTALL_ID,
  SVC_SITE_ELECTRICAL_INCLUDED_ID,
  SVC_SITE_ELECTRICAL_SUBCONTRACT_ID,
  SVC_SITE_INSTALL_SUBCONTRACT_ID,
  type CostEvidence,
} from "../resources/catalog.js";
import { applySiteInstallationFactsPatch } from "./facts.js";
import {
  SITE_INSTALLATION_FREEZE_REASON,
  SITE_INSTALLATION_LABEL,
  SITE_INSTALLATION_PRICE_FREEZE_REASON,
  SITE_INSTALLATION_SCOPE_ID,
  normalizeOptionalScopeIds,
  presentSiteInstallationScope,
  projectSiteInstallationScope,
  siteInstallationBlocksQuoteFreeze,
  siteInstallationFreezeRefusal,
  siteInstallationIncompleteReasons,
  siteInstallationIsPrequoteReady,
  siteInstallationReadinessLabel,
} from "./scope.js";

const requestId = "crq:prequote-scope";

function completeFacts() {
  const saved = applySiteInstallationFactsPatch({
    selected: true,
    hasLinkedQuotes: false,
    current: null,
    requestId,
    expectedVersion: 0,
    patch: {
      street: "Strada Fabricii 10",
      city: "București",
      measurementStatus: "OFFICE_MEASURED",
      facadeType: "CONCRETE",
      fixingMethod: "MECHANICAL_ANCHOR",
      siteElectrical: "NOT_APPLICABLE",
      crewSize: 3,
      plannedDurationHours: 4,
    },
    updatedAt: "2026-09-02T10:00:00.000Z",
  });
  if (!saved.ok) {
    throw new Error("expected facts");
  }
  return saved.facts;
}

function ownerLabor(amount = 25): CostEvidence {
  return {
    resourceId: LAB_SITE_INSTALL_ID,
    amount,
    currency: "EUR",
    perUnit: "person_hour",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note: "Synthetic owner-confirmed site labor.",
  };
}

function includedElectrical(amount = 40, note = "Racord inclus."): CostEvidence {
  return {
    resourceId: SVC_SITE_ELECTRICAL_INCLUDED_ID,
    amount,
    currency: "EUR",
    perUnit: "job",
    source: "OWNER_CONFIRMED_WORKSHOP",
    classification: "OWNER_CONFIRMED",
    note,
  };
}

function subcontractedElectrical(amount = 55): CostEvidence {
  return {
    resourceId: SVC_SITE_ELECTRICAL_SUBCONTRACT_ID,
    amount,
    currency: "EUR",
    perUnit: "job",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Racord subcontractat.",
    supplierLabel: "Electrician test",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
  };
}

function factsWithElectrical(
  siteElectrical: "INCLUDED" | "SUBCONTRACTED" | "EXCLUDED_CUSTOMER_RESPONSIBILITY" | "UNCONFIRMED",
) {
  const saved = applySiteInstallationFactsPatch({
    selected: true,
    hasLinkedQuotes: false,
    current: completeFacts(),
    requestId,
    expectedVersion: completeFacts().version,
    patch: { siteElectrical },
    updatedAt: "2026-09-02T11:00:00.000Z",
  });
  if (!saved.ok) {
    throw new Error("expected electrical facts");
  }
  return saved.facts;
}

function ownerSubcontract(amount = 180): CostEvidence {
  return {
    resourceId: SVC_SITE_INSTALL_SUBCONTRACT_ID,
    amount,
    currency: "EUR",
    perUnit: "job",
    source: "OWNER_CONFIRMED_PURCHASE",
    classification: "OWNER_CONFIRMED",
    note: "Synthetic owner-confirmed subcontract.",
    supplierLabel: "Furnizor test montaj",
    validFrom: "2026-01-01",
    validUntil: "2026-12-31",
  };
}

describe("optional site installation scope", () => {
  it("is completely silent when unselected", () => {
    expect(projectSiteInstallationScope({ selected: false })).toBeNull();
    expect(presentSiteInstallationScope(null)).toBeNull();
    expect(siteInstallationBlocksQuoteFreeze([])).toBe(false);
    expect(siteInstallationFreezeRefusal([])).toBeNull();
  });

  it("projects PARTIAL EIC without LETTERS resources or cost-plus commercial", () => {
    const projected = projectSiteInstallationScope({ selected: true });
    expect(projected).not.toBeNull();
    if (!projected) {
      throw new Error("expected selected projection");
    }
    expect(projected.scopeId).toBe(SITE_INSTALLATION_SCOPE_ID);
    expect(projected.label).toBe(SITE_INSTALLATION_LABEL);
    expect(projected.eic.completeness).toBe("PARTIAL");
    expect(projected.eic.lines).toEqual([]);
    expect(projected.eic.total).toBe(0);
    expect(projected.commercial).toEqual(projectManualFixedServicePrice({ netPrice: null }));
    expect(projected.commercial.completeness).toBe("PARTIAL");
    expect(projected.commercial.policyId).toBe(DEFAULT_COMMERCIAL_POLICY.id);
    expect(JSON.stringify(projected.eic.lines)).not.toMatch(/RES-|RCP-|LED|PLEXI|ALUMINIUM/);
  });

  it("keeps incomplete reasons typed and excludes transport", () => {
    const projected = projectSiteInstallationScope({ selected: true });
    if (!projected) {
      throw new Error("expected selected projection");
    }
    const ids = projected.incompleteReasons.map((reason) => reason.id);
    expect(ids).toEqual(["MISSING_COST_EVIDENCE"]);
    expect(
      projectSiteInstallationScope({ selected: true, facts: null })?.incompleteReasons.map(
        (reason) => reason.id,
      ),
    ).toEqual([
      "SITE_ADDRESS_INCOMPLETE",
      "SITE_MEASUREMENTS_UNCONFIRMED",
      "FACADE_UNCONFIRMED",
      "FIXING_UNCONFIRMED",
      "SITE_ELECTRICAL_UNCONFIRMED",
      "MISSING_PROVIDER_MODE",
      "MISSING_COST_EVIDENCE",
    ]);
    expect(ids).not.toContain("TRANSPORT_UNCONFIRMED");
    expect(new Set(ids).size).toBe(ids.length);
    expect(projected.incompleteReasons.map((reason) => reason.label).join(" ")).not.toMatch(
      /inspectat|verificat la fața locului|măsurat efectiv/i,
    );
  });

  it("presents operator view without a 0 EUR cost or price", () => {
    const presented = presentSiteInstallationScope(
      projectSiteInstallationScope({ selected: true }),
    );
    expect(presented).toMatchObject({
      scopeId: SITE_INSTALLATION_SCOPE_ID,
      eicCompleteness: "PARTIAL",
      commercialCompleteness: "PARTIAL",
    });
    expect(JSON.stringify(presented)).not.toMatch(/0(?:[.,]0+)? EUR|internalCost|grossPrice|"total"/);
  });

  it("completes INTERNAL EIC from crew × hours × owner rate, not from 200 EUR", () => {
    const projected = projectSiteInstallationScope({
      selected: true,
      facts: completeFacts(),
      providerMode: "INTERNAL",
      evidence: { internalLabor: ownerLabor(25) },
      manualNetPrice: 200,
      asOf: "2026-09-02T12:00:00.000Z",
    });
    expect(projected?.eic.completeness).toBe("COMPLETE");
    expect(projected?.eic.total).toBe(300);
    expect(projected?.eic.lines).toHaveLength(1);
    expect(projected?.eic.lines[0]?.quantity).toBe(12);
    expect(projected?.eic.lines[0]?.resourceId).toBe(LAB_SITE_INSTALL_ID);
    expect(projected?.commercial.completeness).toBe("COMPLETE");
    expect(projected?.commercial.netPrice).toBe(200);
    expect(projected?.commercial.grossPrice).toBe(242);
    expect(projected?.commercial.markupAmount).toBe(0);
    const presented = presentSiteInstallationScope(projected);
    expect(presented?.ownerInternalCost).toEqual({
      label: "Cost intern estimat montaj",
      total: 300,
      currency: "EUR",
      quantity: 12,
      unitLabel: "ore-persoană",
      rate: 25,
    });
    expect(siteInstallationIsPrequoteReady(presented!)).toBe(true);
    expect(siteInstallationReadinessLabel(presented!)).toBe("Pregătit pentru ofertă");
  });

  it("completes SUBCONTRACTED EIC from supplier job evidence, not from customer price", () => {
    const projected = projectSiteInstallationScope({
      selected: true,
      facts: completeFacts(),
      providerMode: "SUBCONTRACTED",
      evidence: { subcontract: ownerSubcontract(180) },
      manualNetPrice: 200,
      asOf: "2026-06-01T00:00:00.000Z",
    });
    expect(projected?.eic.completeness).toBe("COMPLETE");
    expect(projected?.eic.total).toBe(180);
    expect(projected?.eic.lines[0]?.resourceId).toBe(SVC_SITE_INSTALL_SUBCONTRACT_ID);
    expect(projected?.commercial.netPrice).toBe(200);
    expect(presentSiteInstallationScope(projected)?.ownerInternalCost).toMatchObject({
      label: "Cost subcontractat montaj",
      total: 180,
      quantity: 1,
      unitLabel: "lucrare",
      rate: 180,
    });
  });

  it("refuses expired subcontract evidence", () => {
    const projected = projectSiteInstallationScope({
      selected: true,
      facts: completeFacts(),
      providerMode: "SUBCONTRACTED",
      evidence: { subcontract: ownerSubcontract(180) },
      manualNetPrice: 200,
      asOf: "2027-01-01T00:00:00.000Z",
    });
    expect(projected?.eic.completeness).toBe("PARTIAL");
    expect(projected?.incompleteReasons.map((reason) => reason.id)).toContain(
      "SUBCONTRACT_EVIDENCE_INVALID",
    );
    const presented = presentSiteInstallationScope(projected);
    expect(presented?.ownerInternalCost).toBeUndefined();
    expect(siteInstallationIsPrequoteReady(presented!)).toBe(false);
    expect(siteInstallationReadinessLabel(presented!)).toBe(
      "Preț client confirmat · Dovadă subcontract expirată",
    );
  });

  it("treats validUntil as inclusive through the last UTC calendar date", () => {
    const window = {
      ...ownerSubcontract(180),
      validFrom: "2027-01-01",
      validUntil: "2027-12-31",
    };
    const lastDay = projectSiteInstallationScope({
      selected: true,
      facts: completeFacts(),
      providerMode: "SUBCONTRACTED",
      evidence: { subcontract: window },
      manualNetPrice: 200,
      asOf: "2027-12-31T23:59:59Z",
    });
    expect(lastDay?.eic.completeness).toBe("COMPLETE");
    const nextDay = projectSiteInstallationScope({
      selected: true,
      facts: completeFacts(),
      providerMode: "SUBCONTRACTED",
      evidence: { subcontract: window },
      manualNetPrice: 200,
      asOf: "2028-01-01T00:00:00Z",
    });
    expect(nextDay?.eic.completeness).toBe("PARTIAL");
  });

  it("does not complete EIC from customer price alone", () => {
    const projected = projectSiteInstallationScope({
      selected: true,
      facts: completeFacts(),
      providerMode: "INTERNAL",
      manualNetPrice: 200,
    });
    expect(projected?.eic.completeness).toBe("PARTIAL");
    expect(projected?.commercial.completeness).toBe("COMPLETE");
    const presented = presentSiteInstallationScope(projected);
    expect(presented?.ownerInternalCost).toBeUndefined();
    expect(siteInstallationReadinessLabel(presented!)).toBe(
      "Preț client confirmat · Cost intern incomplet",
    );
  });

  it("normalizes known scopes and refuses unknown ones", () => {
    expect(
      normalizeOptionalScopeIds([SITE_INSTALLATION_SCOPE_ID, SITE_INSTALLATION_SCOPE_ID]),
    ).toEqual({ ok: true, ids: [SITE_INSTALLATION_SCOPE_ID] });
    expect(normalizeOptionalScopeIds([])).toEqual({ ok: true, ids: [] });
    expect(normalizeOptionalScopeIds(["NOT_A_SCOPE"])).toEqual({
      ok: false,
      error: "unknown_optional_scope",
    });
  });

  it("blocks quote freeze until EIC and manual price are both COMPLETE", () => {
    expect(siteInstallationBlocksQuoteFreeze([SITE_INSTALLATION_SCOPE_ID])).toBe(true);
    expect(siteInstallationFreezeRefusal([SITE_INSTALLATION_SCOPE_ID])).toEqual({
      error: "incomplete_offer",
      reasons: [SITE_INSTALLATION_FREEZE_REASON, SITE_INSTALLATION_PRICE_FREEZE_REASON],
    });
    expect(
      siteInstallationBlocksQuoteFreeze([SITE_INSTALLATION_SCOPE_ID], {
        facts: completeFacts(),
        providerMode: "INTERNAL",
        evidence: { internalLabor: ownerLabor(25) },
        manualNetPrice: 200,
        asOf: "2026-09-02T12:00:00.000Z",
      }),
    ).toBe(false);
    expect(siteInstallationIncompleteReasons().map((reason) => reason.id)).toEqual([
      "MISSING_COST_EVIDENCE",
    ]);
  });

  it("keeps excluded and unknown electrical free of a cost-evidence demand", () => {
    const excluded = projectSiteInstallationScope({
      selected: true,
      facts: factsWithElectrical("EXCLUDED_CUSTOMER_RESPONSIBILITY"),
      providerMode: "INTERNAL",
      evidence: { internalLabor: ownerLabor(25) },
      manualNetPrice: 200,
      asOf: "2026-09-02T12:00:00.000Z",
    });
    expect(excluded?.incompleteReasons.map((reason) => reason.id)).not.toContain(
      "SITE_ELECTRICAL_COST_REQUIRED",
    );
    expect(excluded?.eic.lines.map((line) => line.resourceId)).toEqual([LAB_SITE_INSTALL_ID]);
    const unknown = projectSiteInstallationScope({
      selected: true,
      facts: factsWithElectrical("UNCONFIRMED"),
      providerMode: "INTERNAL",
      evidence: { internalLabor: ownerLabor(25) },
      manualNetPrice: 200,
    });
    expect(unknown?.incompleteReasons.map((reason) => reason.id)).toContain(
      "SITE_ELECTRICAL_UNCONFIRMED",
    );
    expect(unknown?.incompleteReasons.map((reason) => reason.id)).not.toContain(
      "SITE_ELECTRICAL_COST_REQUIRED",
    );
  });

  it("completes included electrical from owner evidence, including a deliberate zero", () => {
    const priced = projectSiteInstallationScope({
      selected: true,
      facts: factsWithElectrical("INCLUDED"),
      providerMode: "INTERNAL",
      evidence: {
        internalLabor: ownerLabor(25),
        includedElectrical: includedElectrical(40),
      },
      manualNetPrice: 200,
      asOf: "2026-09-02T12:00:00.000Z",
    });
    expect(priced?.eic.completeness).toBe("COMPLETE");
    expect(priced?.eic.total).toBe(340);
    expect(priced?.eic.lines.map((line) => line.resourceId)).toEqual([
      LAB_SITE_INSTALL_ID,
      SVC_SITE_ELECTRICAL_INCLUDED_ID,
    ]);
    expect(presentSiteInstallationScope(priced)?.electricalCost).toEqual({
      label: "Cost racord electric inclus",
      total: 40,
      currency: "EUR",
      deliberateZero: false,
    });

    const zero = projectSiteInstallationScope({
      selected: true,
      facts: factsWithElectrical("INCLUDED"),
      providerMode: "INTERNAL",
      evidence: {
        internalLabor: ownerLabor(25),
        includedElectrical: includedElectrical(0, "Inclus fără cost separat."),
      },
      manualNetPrice: 200,
      asOf: "2026-09-02T12:00:00.000Z",
    });
    expect(zero?.eic.completeness).toBe("COMPLETE");
    expect(zero?.eic.total).toBe(300);
    expect(presentSiteInstallationScope(zero)?.electricalCost).toMatchObject({
      total: 0,
      deliberateZero: true,
    });
    expect(siteInstallationBlocksQuoteFreeze([SITE_INSTALLATION_SCOPE_ID], {
      facts: factsWithElectrical("INCLUDED"),
      providerMode: "INTERNAL",
      evidence: { internalLabor: ownerLabor(25) },
      manualNetPrice: 200,
    })).toBe(true);
    expect(
      siteInstallationFreezeRefusal([SITE_INSTALLATION_SCOPE_ID], {
        facts: factsWithElectrical("INCLUDED"),
        providerMode: "INTERNAL",
        evidence: {
          internalLabor: ownerLabor(25),
          includedElectrical: includedElectrical(0, ""),
        },
        manualNetPrice: 200,
      })?.reasons[0],
    ).toMatch(/notă/);
  });

  it("completes subcontracted electrical only with supplier evidence", () => {
    const ready = {
      selected: true,
      facts: factsWithElectrical("SUBCONTRACTED"),
      providerMode: "SUBCONTRACTED" as const,
      evidence: {
        subcontract: ownerSubcontract(180),
        subcontractedElectrical: subcontractedElectrical(55),
      },
      manualNetPrice: 200,
      asOf: "2026-06-01T00:00:00.000Z",
    };
    const projected = projectSiteInstallationScope(ready);
    expect(projected?.eic.completeness).toBe("COMPLETE");
    expect(projected?.eic.total).toBe(235);
    expect(projected?.eic.lines.map((line) => line.resourceId)).toEqual([
      SVC_SITE_INSTALL_SUBCONTRACT_ID,
      SVC_SITE_ELECTRICAL_SUBCONTRACT_ID,
    ]);
    const missing = projectSiteInstallationScope({
      ...ready,
      evidence: { subcontract: ownerSubcontract(180) },
    });
    expect(missing?.incompleteReasons.map((reason) => reason.id)).toContain(
      "SITE_ELECTRICAL_COST_REQUIRED",
    );
    expect(missing?.eic.completeness).toBe("PARTIAL");
  });

  it("refuses freeze until included electrical evidence is deliberate, then prices VAT from the organization policy", () => {
    const organizationPolicy = {
      ...DEFAULT_COMMERCIAL_POLICY,
      vatPercent: 19,
      source: "ORGANIZATION" as const,
      effectiveFrom: "2026-09-01T00:00:00.000Z",
      createdAt: "2026-09-01T00:00:00.000Z",
      supersedesVersion: null,
    };
    const base = {
      facts: factsWithElectrical("INCLUDED"),
      providerMode: "INTERNAL" as const,
      manualNetPrice: 700,
      asOf: "2026-09-02T12:00:00.000Z",
      policy: organizationPolicy,
    };
    const missing = siteInstallationFreezeRefusal([SITE_INSTALLATION_SCOPE_ID], {
      ...base,
      evidence: { internalLabor: ownerLabor(28) },
    });
    expect(missing?.error).toBe("incomplete_offer");
    expect(missing?.reasons[0]).toMatch(/notă/);

    const unjustifiedZero = siteInstallationFreezeRefusal([SITE_INSTALLATION_SCOPE_ID], {
      ...base,
      evidence: { internalLabor: ownerLabor(28), includedElectrical: includedElectrical(0, "") },
    });
    expect(unjustifiedZero).not.toBeNull();

    const deliberateZero = siteInstallationFreezeRefusal([SITE_INSTALLATION_SCOPE_ID], {
      ...base,
      evidence: {
        internalLabor: ownerLabor(28),
        includedElectrical: includedElectrical(0, "Inclus fără cost separat."),
      },
    });
    expect(deliberateZero).toBeNull();

    const confirmed = projectSiteInstallationScope({
      selected: true,
      ...base,
      evidence: { internalLabor: ownerLabor(28), includedElectrical: includedElectrical(40) },
    });
    expect(siteInstallationFreezeRefusal([SITE_INSTALLATION_SCOPE_ID], {
      ...base,
      evidence: { internalLabor: ownerLabor(28), includedElectrical: includedElectrical(40) },
    })).toBeNull();
    const presented = presentSiteInstallationScope(confirmed);
    const priced = projectManualFixedServicePrice({ netPrice: 700 }, organizationPolicy);
    expect(presented?.commercialNetPrice).toBe(700);
    expect(presented?.commercialVatPercent).toBe(19);
    expect(presented?.commercialPolicySource).toBe("ORGANIZATION");
    expect(presented?.commercialGrossPrice).toBe(priced.grossPrice);
    expect(presented?.commercialGrossPrice).not.toBe(
      projectManualFixedServicePrice({ netPrice: 700 }).grossPrice,
    );
    expect(confirmed?.eic.total).not.toBe(presented?.commercialNetPrice);
  });

  it("requires current supplier evidence before subcontracted electrical can be frozen", () => {
    const ready = {
      facts: factsWithElectrical("SUBCONTRACTED"),
      providerMode: "SUBCONTRACTED" as const,
      evidence: {
        subcontract: ownerSubcontract(180),
        subcontractedElectrical: subcontractedElectrical(55),
      },
      manualNetPrice: 200,
      asOf: "2026-06-01T00:00:00.000Z",
    };
    expect(siteInstallationFreezeRefusal([SITE_INSTALLATION_SCOPE_ID], ready)).toBeNull();
    expect(siteInstallationFreezeRefusal([SITE_INSTALLATION_SCOPE_ID], {
      ...ready,
      evidence: {
        subcontract: ownerSubcontract(180),
        subcontractedElectrical: { ...subcontractedElectrical(55), supplierLabel: "  " },
      },
    })).not.toBeNull();
    expect(siteInstallationFreezeRefusal([SITE_INSTALLATION_SCOPE_ID], {
      ...ready,
      asOf: "2027-01-02T00:00:00.000Z",
    })).not.toBeNull();
  });
});
