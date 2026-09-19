import { describe, expect, it } from "vitest";
import { emptyCustomerProfile, type Customer } from "../customers/identity.js";
import {
  SITE_INSTALLATION_FREEZE_REASON,
  SITE_INSTALLATION_PRICE_FREEZE_REASON,
  SITE_INSTALLATION_SCOPE_ID,
} from "../installation/scope.js";
import type { OrganizationServiceOffer } from "../operationalServices.js";

const internalOffer: OrganizationServiceOffer = {
  capabilityId: SITE_INSTALLATION_SCOPE_ID,
  configured: true,
  offerMode: "INTERNAL",
  version: 1,
  updatedAt: "2026-08-28T20:00:00.000Z",
};
import {
  canChangeCommercialRequestStatus,
  commercialRequestReference,
  createCommercialRequest,
  generateCommercialRequestId,
  applyInstallationManualPrice,
  isCommercialRequestStatus,
  linkCommercialRequestQuote,
  updateCommercialRequest,
} from "./commercialRequest.js";

function customer(status: Customer["status"] = "ACTIVE"): Customer {
  return {
    customerId: "cus:active",
    displayName: "HUB MEDIA",
    status,
    createdAt: "2026-08-17T08:00:00.000Z",
    updatedAt: "2026-08-17T08:00:00.000Z",
    retiredAt: status === "RETIRED" ? "2026-08-17T09:00:00.000Z" : null,
    ...emptyCustomerProfile(),
  };
}

describe("commercial request identity", () => {
  it("mints a stable crq id and derived CER reference", () => {
    const requestId = generateCommercialRequestId();
    expect(requestId).toMatch(/^crq:[0-9a-f-]{36}$/);
    expect(commercialRequestReference(requestId)).toMatch(/^CER-[0-9A-F]{8}$/);
    expect(commercialRequestReference(requestId)).toBe(
      commercialRequestReference(requestId),
    );
  });

  it("creates a NEW request only for an ACTIVE customer", () => {
    const created = createCommercialRequest({
      customer: customer(),
      title: "Litere exterior sediu",
      description: "Clientul vrea litere luminoase pe fațadă.",
      requestId: "crq:11111111-2222-3333-4444-555555555555",
      createdAt: "2026-08-17T10:00:00.000Z",
    });
    expect(created).toMatchObject({
      ok: true,
      request: {
        requestId: "crq:11111111-2222-3333-4444-555555555555",
        reference: "CER-11111111",
        customerId: "cus:active",
        title: "Litere exterior sediu",
        status: "NEW",
        optionalScopeIds: [],
        siteInstallationMode: null,
      },
    });
    expect(createCommercialRequest({
      customer: customer("RETIRED"),
      title: "Litere",
      description: "Descriere",
    })).toEqual({ ok: false, error: "customer_unavailable" });
  });

  it("rejects empty title or description and unknown statuses", () => {
    expect(
      createCommercialRequest({
        customer: customer(),
        title: "   ",
        description: "Descriere",
      }),
    ).toEqual({ ok: false, error: "invalid_title" });
    expect(
      createCommercialRequest({
        customer: customer(),
        title: "Titlu",
        description: "   ",
      }),
    ).toEqual({ ok: false, error: "invalid_description" });
    expect(isCommercialRequestStatus("QUOTE_CREATED")).toBe(false);
    expect(isCommercialRequestStatus("LEAD")).toBe(false);
    expect(isCommercialRequestStatus("NEW")).toBe(true);
  });

  it("allows office correction between active states and keeps CANCELLED terminal", () => {
    const created = createCommercialRequest({
      customer: customer(),
      title: "Titlu",
      description: "Descriere",
    });
    if (!created.ok) {
      throw new Error("expected create");
    }
    const reviewed = updateCommercialRequest(
      created.request,
      { status: "IN_REVIEW" },
      { hasLinkedQuotes: false },
    );
    expect(reviewed.ok).toBe(true);
    expect(canChangeCommercialRequestStatus("READY_FOR_QUOTE", "BLOCKED")).toBe(true);
    expect(canChangeCommercialRequestStatus("CANCELLED", "NEW")).toBe(false);
    const cancelled = updateCommercialRequest(
      created.request,
      { status: "CANCELLED" },
      { hasLinkedQuotes: false },
    );
    if (!cancelled.ok) {
      throw new Error("expected cancel");
    }
    expect(
      updateCommercialRequest(
        cancelled.request,
        { status: "IN_REVIEW" },
        { hasLinkedQuotes: false },
      ),
    ).toEqual({ ok: false, error: "invalid_status" });
  });

  it("locks customer after a quote is linked and never copies quote status", () => {
    const created = createCommercialRequest({
      customer: customer(),
      title: "Titlu",
      description: "Descriere",
    });
    if (!created.ok) {
      throw new Error("expected create");
    }
    expect(
      updateCommercialRequest(
        created.request,
        { customerId: "cus:other" },
        { hasLinkedQuotes: true, nextCustomer: { ...customer(), customerId: "cus:other" } },
      ),
    ).toEqual({ ok: false, error: "customer_locked" });
    const renamed = updateCommercialRequest(
      created.request,
      { title: "Titlu corectat", description: "Descriere corectată" },
      { hasLinkedQuotes: true },
    );
    expect(renamed.ok).toBe(true);
    if (renamed.ok) {
      expect(renamed.request.status).toBe("NEW");
      expect(renamed.request).not.toHaveProperty("contentHash");
      expect(renamed.request).not.toHaveProperty("eic");
      expect(renamed.request).not.toHaveProperty("commercial");
    }
  });

  it("links a quote idempotently without mutating request status", () => {
    const created = createCommercialRequest({
      customer: customer(),
      title: "Titlu",
      description: "Descriere",
    });
    if (!created.ok) {
      throw new Error("expected create");
    }
    const first = linkCommercialRequestQuote({
      request: created.request,
      quoteSnapshotId: "qts:letters:abc",
      quoteCustomerId: "cus:active",
      existingLink: null,
      linkedAt: "2026-08-17T11:00:00.000Z",
    });
    expect(first).toMatchObject({
      ok: true,
      alreadyApplied: false,
      link: {
        requestId: created.request.requestId,
        quoteSnapshotId: "qts:letters:abc",
      },
    });
    const again = linkCommercialRequestQuote({
      request: created.request,
      quoteSnapshotId: "qts:letters:abc",
      quoteCustomerId: "cus:active",
      existingLink: first.ok ? first.link : null,
    });
    expect(again).toMatchObject({ ok: true, alreadyApplied: true });
    expect(
      linkCommercialRequestQuote({
        request: created.request,
        quoteSnapshotId: "qts:letters:abc",
        quoteCustomerId: "cus:other",
        existingLink: null,
      }),
    ).toEqual({ ok: false, error: "customer_mismatch" });
    expect(created.request.status).toBe("NEW");
  });

  it("refuses a new quote link when selected installation is not COMPLETE", () => {
    const created = createCommercialRequest({
      customer: customer(),
      title: "Titlu",
      description: "Descriere",
    });
    if (!created.ok) {
      throw new Error("expected create");
    }
    const selected = updateCommercialRequest(
      created.request,
      { optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] },
      { hasLinkedQuotes: false, serviceOffer: internalOffer },
    );
    if (!selected.ok) {
      throw new Error("expected select");
    }
    expect(
      linkCommercialRequestQuote({
        request: selected.request,
        quoteSnapshotId: "qts:letters:orphan",
        quoteCustomerId: "cus:active",
        existingLink: null,
      }),
    ).toEqual({
      ok: false,
      error: "incomplete_offer",
      reasons: [SITE_INSTALLATION_FREEZE_REASON, SITE_INSTALLATION_PRICE_FREEZE_REASON],
    });
    const alreadyLinked = linkCommercialRequestQuote({
      request: selected.request,
      quoteSnapshotId: "qts:letters:existing",
      quoteCustomerId: "cus:active",
      existingLink: {
        requestId: selected.request.requestId,
        quoteSnapshotId: "qts:letters:existing",
        linkedAt: "2026-08-17T11:00:00.000Z",
      },
    });
    expect(alreadyLinked).toMatchObject({ ok: true, alreadyApplied: true });
    expect(
      linkCommercialRequestQuote({
        request: { ...selected.request, status: "CANCELLED" },
        quoteSnapshotId: "qts:letters:orphan",
        quoteCustomerId: "cus:active",
        existingLink: null,
      }),
    ).toEqual({ ok: false, error: "request_cancelled" });
  });

  it("selects optional scopes idempotently and refuses unknown ids", () => {
    const created = createCommercialRequest({
      customer: customer(),
      title: "Titlu",
      description: "Descriere",
    });
    if (!created.ok) {
      throw new Error("expected create");
    }
    expect(created.request.optionalScopeIds).toEqual([]);
    const selected = updateCommercialRequest(
      created.request,
      { optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID, SITE_INSTALLATION_SCOPE_ID] },
      { hasLinkedQuotes: false, serviceOffer: internalOffer },
    );
    expect(selected.ok).toBe(true);
    if (!selected.ok) {
      throw new Error("expected select");
    }
    expect(selected.request.optionalScopeIds).toEqual([SITE_INSTALLATION_SCOPE_ID]);
    expect(selected.request.siteInstallationMode).toBe("INTERNAL");
    expect(
      updateCommercialRequest(
        selected.request,
        { optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] },
        { hasLinkedQuotes: false, serviceOffer: internalOffer },
      ),
    ).toMatchObject({ ok: true, alreadyApplied: true });
    const cleared = updateCommercialRequest(
      selected.request,
      { optionalScopeIds: [] },
      { hasLinkedQuotes: false, serviceOffer: internalOffer },
    );
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.request.optionalScopeIds).toEqual([]);
    }
    expect(
      updateCommercialRequest(
        selected.request,
        { optionalScopeIds: [] },
        {
          hasLinkedQuotes: false,
          hasInstallationFacts: true,
          serviceOffer: internalOffer,
        },
      ),
    ).toEqual({ ok: false, error: "installation_facts_delete_confirmation_required" });
    const confirmed = updateCommercialRequest(
      selected.request,
      { optionalScopeIds: [], confirmDeleteInstallationFacts: true },
      {
        hasLinkedQuotes: false,
        hasInstallationFacts: true,
        serviceOffer: internalOffer,
      },
    );
    expect(confirmed.ok).toBe(true);
    if (confirmed.ok) {
      expect(confirmed.request.optionalScopeIds).toEqual([]);
    }
    expect(
      updateCommercialRequest(
        created.request,
        { optionalScopeIds: ["NOT_A_SCOPE"] },
        { hasLinkedQuotes: false, serviceOffer: internalOffer },
      ),
    ).toEqual({ ok: false, error: "unknown_optional_scope" });
    expect(
      updateCommercialRequest(
        created.request,
        { optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] },
        { hasLinkedQuotes: false },
      ),
    ).toEqual({ ok: false, error: "service_not_offered" });
    expect(
      updateCommercialRequest(
        created.request,
        { optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] },
        { hasLinkedQuotes: true, serviceOffer: internalOffer },
      ),
    ).toEqual({ ok: false, error: "service_selection_locked" });
  });

  it("lets only the owner write a manual installation price on a selected request", () => {
    const created = createCommercialRequest({
      customer: customer(),
      title: "Titlu",
      description: "Descriere",
    });
    if (!created.ok) {
      throw new Error("expected create");
    }
    expect(
      applyInstallationManualPrice({
        request: created.request,
        netPrice: 200,
        isOwner: true,
        hasLinkedQuotes: false,
      }),
    ).toEqual({ ok: false, error: "installation_not_selected" });
    const selected = updateCommercialRequest(
      created.request,
      { optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] },
      { hasLinkedQuotes: false, serviceOffer: internalOffer },
    );
    if (!selected.ok) {
      throw new Error("expected select");
    }
    expect(
      applyInstallationManualPrice({
        request: selected.request,
        netPrice: 200,
        isOwner: false,
        hasLinkedQuotes: false,
      }),
    ).toEqual({ ok: false, error: "owner_required" });
    const written = applyInstallationManualPrice({
      request: selected.request,
      netPrice: 200,
      isOwner: true,
      hasLinkedQuotes: false,
      updatedAt: "2026-09-02T12:00:00.000Z",
    });
    expect(written).toMatchObject({
      ok: true,
      alreadyApplied: false,
      request: { installationManualNetEur: 200 },
    });
    expect(
      applyInstallationManualPrice({
        request: written.ok ? written.request : selected.request,
        netPrice: 200,
        isOwner: true,
        hasLinkedQuotes: true,
      }),
    ).toEqual({ ok: false, error: "installation_price_locked" });
  });
});
