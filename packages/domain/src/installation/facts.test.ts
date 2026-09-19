import { describe, expect, it } from "vitest";
import {
  applySiteInstallationFactsPatch,
  blankSiteInstallationFacts,
  siteInstallationIncompleteReasonIds,
} from "../index.js";

const requestId = "crq:11111111-2222-3333-4444-555555555555";

function completeFactsPatch() {
  return {
    siteName: "Sediu client",
    street: "Strada Fabricii 10",
    city: "București",
    county: "București",
    postalCode: "010101",
    countryCode: "RO",
    contactName: "Ion",
    contactPhone: "0700000000",
    accessNotes: "Intrare pe laterala",
    measurementStatus: "OFFICE_MEASURED",
    mountingSurfaceWidthMm: 2400,
    mountingSurfaceHeightMm: 800,
    installationElevationMm: 3500,
    measuredAt: "2026-08-20",
    measurementNotes: "Măsurat de birou",
    facadeType: "CONCRETE",
    fixingMethod: "MECHANICAL_ANCHOR",
    siteElectrical: "NOT_APPLICABLE",
  };
}

describe("site installation facts", () => {
  it("treats a request without a facts row as null defaults", () => {
    expect(siteInstallationIncompleteReasonIds({ facts: null })).toEqual([
      "SITE_ADDRESS_INCOMPLETE",
      "SITE_MEASUREMENTS_UNCONFIRMED",
      "FACADE_UNCONFIRMED",
      "FIXING_UNCONFIRMED",
      "SITE_ELECTRICAL_UNCONFIRMED",
      "MISSING_PROVIDER_MODE",
      "MISSING_COST_EVIDENCE",
    ]);
  });

  it("saves, reads and reloads typed facts without completing EIC", () => {
    const saved = applySiteInstallationFactsPatch({
      selected: true,
      hasLinkedQuotes: false,
      current: null,
      requestId,
      expectedVersion: 0,
      patch: completeFactsPatch(),
      updatedAt: "2026-08-29T10:00:00.000Z",
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      throw new Error("expected save");
    }
    expect(saved.facts.version).toBe(1);
    expect(saved.facts.countryCode).toBe("RO");
    expect(saved.facts.siteElectrical).toBe("NOT_APPLICABLE");
    expect(siteInstallationIncompleteReasonIds({ facts: saved.facts })).toEqual([
      "MISSING_PROVIDER_MODE",
      "MISSING_COST_EVIDENCE",
    ]);
    const again = applySiteInstallationFactsPatch({
      selected: true,
      hasLinkedQuotes: false,
      current: saved.facts,
      requestId,
      expectedVersion: saved.facts.version,
      patch: completeFactsPatch(),
    });
    expect(again).toMatchObject({ ok: true, alreadyApplied: true });
    if (again.ok) {
      expect(again.facts.version).toBe(1);
    }
  });

  it("preserves omitted fields on a partial patch", () => {
    const first = applySiteInstallationFactsPatch({
      selected: true,
      hasLinkedQuotes: false,
      current: null,
      requestId,
      expectedVersion: 0,
      patch: completeFactsPatch(),
      updatedAt: "2026-08-29T10:00:00.000Z",
    });
    if (!first.ok) {
      throw new Error("expected first save");
    }
    const patched = applySiteInstallationFactsPatch({
      selected: true,
      hasLinkedQuotes: false,
      current: first.facts,
      requestId,
      expectedVersion: first.facts.version,
      patch: { accessNotes: "Curte interioară" },
      updatedAt: "2026-08-29T11:00:00.000Z",
    });
    expect(patched.ok).toBe(true);
    if (!patched.ok) {
      throw new Error("expected patch");
    }
    expect(patched.facts.street).toBe("Strada Fabricii 10");
    expect(patched.facts.accessNotes).toBe("Curte interioară");
    expect(patched.facts.version).toBe(2);
  });

  it("refuses unknown enums, impossible sizes and OTHER without a note", () => {
    const current = blankSiteInstallationFacts({
      requestId,
      createdAt: "2026-08-29T10:00:00.000Z",
    });
    expect(
      applySiteInstallationFactsPatch({
        selected: true,
        hasLinkedQuotes: false,
        current,
        requestId,
        expectedVersion: 0,
        patch: { facadeType: "PLASTIC" },
      }),
    ).toEqual({ ok: false, error: "invalid_facade_type" });
    expect(
      applySiteInstallationFactsPatch({
        selected: true,
        hasLinkedQuotes: false,
        current,
        requestId,
        expectedVersion: 0,
        patch: { mountingSurfaceWidthMm: -10 },
      }),
    ).toEqual({ ok: false, error: "invalid_dimensions" });
    expect(
      applySiteInstallationFactsPatch({
        selected: true,
        hasLinkedQuotes: false,
        current,
        requestId,
        expectedVersion: 0,
        patch: { installationElevationMm: 0 },
      }),
    ).toEqual({ ok: false, error: "invalid_elevation" });
    expect(
      applySiteInstallationFactsPatch({
        selected: true,
        hasLinkedQuotes: false,
        current,
        requestId,
        expectedVersion: 0,
        patch: { facadeType: "OTHER" },
      }),
    ).toEqual({ ok: false, error: "other_note_required" });
    expect(
      applySiteInstallationFactsPatch({
        selected: true,
        hasLinkedQuotes: false,
        current,
        requestId,
        expectedVersion: 0,
        patch: { siteElectrical: "maybe" },
      }),
    ).toEqual({ ok: false, error: "invalid_site_electrical" });
  });

  it("refuses write when unselected or locked and does not default to NOT_APPLICABLE", () => {
    expect(
      applySiteInstallationFactsPatch({
        selected: false,
        hasLinkedQuotes: false,
        current: null,
        requestId,
        expectedVersion: 0,
        patch: { city: "Cluj" },
      }),
    ).toEqual({ ok: false, error: "installation_not_selected" });
    expect(
      applySiteInstallationFactsPatch({
        selected: true,
        hasLinkedQuotes: true,
        current: null,
        requestId,
        expectedVersion: 0,
        patch: { city: "Cluj" },
      }),
    ).toEqual({ ok: false, error: "installation_facts_locked" });
    const blank = blankSiteInstallationFacts({
      requestId,
      createdAt: "2026-08-29T10:00:00.000Z",
    });
    expect(blank.siteElectrical).toBe("UNCONFIRMED");
    expect(blank.countryCode).toBe("RO");
    expect(JSON.stringify(blank)).not.toMatch(/productWidth|productHeight|confirmedAreaMm2|TRANSPORT/);
  });

  it("requires expectedVersion 0 to create and refuses missing or stale versions", () => {
    expect(
      applySiteInstallationFactsPatch({
        selected: true,
        hasLinkedQuotes: false,
        current: null,
        requestId,
        expectedVersion: Number.NaN,
        patch: completeFactsPatch(),
      }),
    ).toEqual({ ok: false, error: "expected_version_required" });
    expect(
      applySiteInstallationFactsPatch({
        selected: true,
        hasLinkedQuotes: false,
        current: null,
        requestId,
        expectedVersion: 1,
        patch: completeFactsPatch(),
      }),
    ).toEqual({ ok: false, error: "version_conflict" });
    const created = applySiteInstallationFactsPatch({
      selected: true,
      hasLinkedQuotes: false,
      current: null,
      requestId,
      expectedVersion: 0,
      patch: completeFactsPatch(),
      updatedAt: "2026-08-29T10:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected create");
    }
    expect(created.facts.version).toBe(1);
    expect(
      applySiteInstallationFactsPatch({
        selected: true,
        hasLinkedQuotes: false,
        current: created.facts,
        requestId,
        expectedVersion: 0,
        patch: { accessNotes: "Nu" },
      }),
    ).toEqual({ ok: false, error: "version_conflict" });
    const updated = applySiteInstallationFactsPatch({
      selected: true,
      hasLinkedQuotes: false,
      current: created.facts,
      requestId,
      expectedVersion: 1,
      patch: { accessNotes: "Curte" },
      updatedAt: "2026-08-29T11:00:00.000Z",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      throw new Error("expected update");
    }
    expect(updated.facts.version).toBe(2);
    expect(updated.facts.street).toBe("Strada Fabricii 10");
    expect(updated.facts.accessNotes).toBe("Curte");
    const stale = applySiteInstallationFactsPatch({
      selected: true,
      hasLinkedQuotes: false,
      current: updated.facts,
      requestId,
      expectedVersion: 1,
      patch: { accessNotes: "Altceva" },
    });
    expect(stale).toEqual({ ok: false, error: "version_conflict" });
    const identical = applySiteInstallationFactsPatch({
      selected: true,
      hasLinkedQuotes: false,
      current: updated.facts,
      requestId,
      expectedVersion: 2,
      patch: { accessNotes: "Curte" },
    });
    expect(identical).toMatchObject({ ok: true, alreadyApplied: true });
    if (identical.ok) {
      expect(identical.facts.version).toBe(2);
      expect(identical.facts.accessNotes).toBe("Curte");
    }
  });
});
