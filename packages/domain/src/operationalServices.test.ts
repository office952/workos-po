import { describe, expect, it } from "vitest";
import { SITE_INSTALLATION_SCOPE_ID } from "./installation/scope.js";
import {
  TRANSPORT_CAPABILITY_ID,
  UNCONFIGURED_SITE_INSTALLATION_OFFER,
  applyOrganizationServiceOffer,
  applyRequestServiceSelection,
  canSelectNewOperationalService,
  projectOperationalServicesAdmin,
  projectSiteInstallationRequestOffer,
  resolveOrganizationServiceOffer,
  type OrganizationServiceOffer,
} from "./operationalServices.js";

const internalOffer: OrganizationServiceOffer = {
  capabilityId: SITE_INSTALLATION_SCOPE_ID,
  configured: true,
  offerMode: "INTERNAL",
  version: 1,
  updatedAt: "2026-08-28T20:00:00.000Z",
};

const bothOffer: OrganizationServiceOffer = {
  ...internalOffer,
  offerMode: "BOTH",
};

const disabledOffer: OrganizationServiceOffer = {
  ...internalOffer,
  offerMode: "SERVICE_DISABLED",
};

describe("operational services catalog and org offer", () => {
  it("treats missing org config as disabled for new selections only", () => {
    expect(resolveOrganizationServiceOffer(null)).toEqual(
      UNCONFIGURED_SITE_INSTALLATION_OFFER,
    );
    expect(canSelectNewOperationalService(UNCONFIGURED_SITE_INSTALLATION_OFFER)).toBe(
      false,
    );
    expect(canSelectNewOperationalService(disabledOffer)).toBe(false);
    expect(canSelectNewOperationalService(internalOffer)).toBe(true);
  });

  it("does not infer a provider mode from missing config", () => {
    const kept = applyRequestServiceSelection({
      currentScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      currentMode: null,
      nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      offer: UNCONFIGURED_SITE_INSTALLATION_OFFER,
      hasLinkedQuotes: false,
    });
    expect(kept).toEqual({
      ok: true,
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      siteInstallationMode: null,
    });
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        currentMode: null,
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        requestedMode: "INTERNAL",
        offer: UNCONFIGURED_SITE_INSTALLATION_OFFER,
        hasLinkedQuotes: false,
      }),
    ).toEqual({ ok: false, error: "service_mode_unavailable" });
  });

  it("refuses a new selection when the organization does not offer the service", () => {
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [],
        currentMode: null,
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        offer: UNCONFIGURED_SITE_INSTALLATION_OFFER,
        hasLinkedQuotes: false,
      }),
    ).toEqual({ ok: false, error: "service_not_offered" });
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [],
        currentMode: null,
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        offer: disabledOffer,
        hasLinkedQuotes: false,
      }),
    ).toEqual({ ok: false, error: "service_not_offered" });
  });

  it("applies the single offered path without treating it as inference from missing config", () => {
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [],
        currentMode: null,
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        offer: internalOffer,
        hasLinkedQuotes: false,
      }),
    ).toEqual({
      ok: true,
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      siteInstallationMode: "INTERNAL",
    });
  });

  it("requires an explicit mode when the organization offers both paths", () => {
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [],
        currentMode: null,
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        offer: bothOffer,
        hasLinkedQuotes: false,
      }),
    ).toEqual({ ok: false, error: "service_mode_required" });
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [],
        currentMode: null,
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        requestedMode: "SUBCONTRACTED",
        offer: bothOffer,
        hasLinkedQuotes: false,
      }),
    ).toEqual({
      ok: true,
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      siteInstallationMode: "SUBCONTRACTED",
    });
  });

  it("locks selection and mode after the first linked quote", () => {
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [],
        currentMode: null,
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        offer: internalOffer,
        hasLinkedQuotes: true,
      }),
    ).toEqual({ ok: false, error: "service_selection_locked" });
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        currentMode: "INTERNAL",
        nextScopeIds: [],
        offer: internalOffer,
        hasLinkedQuotes: true,
      }),
    ).toEqual({ ok: false, error: "service_selection_locked" });
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        currentMode: "INTERNAL",
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        requestedMode: "SUBCONTRACTED",
        offer: bothOffer,
        hasLinkedQuotes: true,
      }),
    ).toEqual({ ok: false, error: "service_selection_locked" });
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        currentMode: "INTERNAL",
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        offer: internalOffer,
        hasLinkedQuotes: true,
      }),
    ).toEqual({
      ok: true,
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      siteInstallationMode: "INTERNAL",
    });
  });

  it("keeps a persisted selection visible after later disable", () => {
    const view = projectSiteInstallationRequestOffer({
      selected: true,
      mode: "INTERNAL",
      offer: disabledOffer,
      hasLinkedQuotes: false,
    });
    expect(view.selected).toBe(true);
    expect(view.canSelectNew).toBe(false);
    expect(view.canChangeSelection).toBe(true);
    expect(view.persistedSelectionPreserved).toBe(true);
    expect(view.showModeControl).toBe(false);
    expect(view.mode).toBe("INTERNAL");
    expect(view.persistedModeIncompatible).toBe(false);
  });

  it("keeps a persisted mode after the organization offer changes", () => {
    const subcontractedOffer: OrganizationServiceOffer = {
      ...internalOffer,
      offerMode: "SUBCONTRACTED",
    };
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        currentMode: "INTERNAL",
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        offer: subcontractedOffer,
        hasLinkedQuotes: false,
      }),
    ).toEqual({
      ok: true,
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      siteInstallationMode: "INTERNAL",
    });
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        currentMode: "INTERNAL",
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        requestedMode: "INTERNAL",
        offer: subcontractedOffer,
        hasLinkedQuotes: false,
      }),
    ).toEqual({ ok: false, error: "invalid_service_mode" });
    const incompatible = projectSiteInstallationRequestOffer({
      selected: true,
      mode: "INTERNAL",
      offer: subcontractedOffer,
      hasLinkedQuotes: false,
    });
    expect(incompatible.mode).toBe("INTERNAL");
    expect(incompatible.selected).toBe(true);
    expect(incompatible.persistedModeIncompatible).toBe(true);
    expect(incompatible.canChangeMode).toBe(true);
    expect(incompatible.showModeControl).toBe(true);
  });

  it("applies an explicit subcontracted path when the organization offers only that path", () => {
    const subcontractedOffer: OrganizationServiceOffer = {
      ...internalOffer,
      offerMode: "SUBCONTRACTED",
    };
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [],
        currentMode: null,
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        offer: subcontractedOffer,
        hasLinkedQuotes: false,
      }),
    ).toEqual({
      ok: true,
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      siteInstallationMode: "SUBCONTRACTED",
    });
  });

  it("refuses an invalid requested mode", () => {
    expect(
      applyRequestServiceSelection({
        currentScopeIds: [],
        currentMode: null,
        nextScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        requestedMode: "INTERNAL",
        offer: {
          ...internalOffer,
          offerMode: "SUBCONTRACTED",
        },
        hasLinkedQuotes: false,
      }),
    ).toEqual({ ok: false, error: "invalid_service_mode" });
  });

  it("reserves transport and versions owner writes", () => {
    expect(
      applyOrganizationServiceOffer({
        capabilityId: TRANSPORT_CAPABILITY_ID,
        offerMode: "INTERNAL",
        current: null,
      }),
    ).toEqual({ ok: false, error: "capability_reserved" });
    const first = applyOrganizationServiceOffer({
      capabilityId: SITE_INSTALLATION_SCOPE_ID,
      offerMode: "INTERNAL",
      current: null,
      updatedAt: "2026-08-28T20:00:00.000Z",
    });
    expect(first).toMatchObject({
      ok: true,
      alreadyApplied: false,
      record: { offerMode: "INTERNAL", version: 1 },
    });
    if (!first.ok) {
      throw new Error("expected write");
    }
    expect(
      applyOrganizationServiceOffer({
        capabilityId: SITE_INSTALLATION_SCOPE_ID,
        offerMode: "INTERNAL",
        current: first.record,
      }),
    ).toMatchObject({ ok: true, alreadyApplied: true, record: first.record });
    expect(
      applyOrganizationServiceOffer({
        capabilityId: SITE_INSTALLATION_SCOPE_ID,
        offerMode: "SERVICE_DISABLED",
        current: first.record,
        updatedAt: "2026-08-28T21:00:00.000Z",
      }),
    ).toMatchObject({
      ok: true,
      alreadyApplied: false,
      record: { offerMode: "SERVICE_DISABLED", version: 2 },
    });
    const admin = projectOperationalServicesAdmin(internalOffer);
    expect(admin.capabilities.map((item) => item.capabilityId)).toEqual([
      SITE_INSTALLATION_SCOPE_ID,
      TRANSPORT_CAPABILITY_ID,
    ]);
    expect(admin.capabilities[1]).toMatchObject({
      reserved: true,
      selectable: false,
      offerMode: null,
    });
  });
});
