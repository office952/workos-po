import { afterEach, describe, expect, it } from "vitest";
import {
  bindConfiguratorSessionToCustomer,
  labelsMatchingContext,
  lastQuoteOwnedByContext,
  ownedDraftsForContext,
  clearConfiguratorSession,
  readConfiguratorSession,
  resolveOwnedSpine,
  writeConfiguratorSession,
  type ConfiguratorContext,
  type ConfiguratorSession,
} from "./configuratorSession";

const LETTERS = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";
const ACM = "PRD-ACM-CASSETTE-NONE";
const LETTERS_ONLY_FIELD = "face.confirmedAreaMm2";
const ACM_ONLY_FIELD = "face.widthMm";

afterEach(() => {
  sessionStorage.clear();
});

function context(
  productCode: string | null,
  requestId: string | null,
  customerId: string | null,
): ConfiguratorContext {
  return { productCode, requestId, customerId };
}

describe("ownedDraftsForContext", () => {
  it("restores drafts only for the same product and request", () => {
    const stored = {
      drafts: { [ACM_ONLY_FIELD]: "1200" },
      draftContext: context(ACM, "req-1", "cus-1"),
    };

    expect(ownedDraftsForContext(stored, context(ACM, "req-1", "cus-1"))).toEqual({
      [ACM_ONLY_FIELD]: "1200",
    });
    expect(ownedDraftsForContext(stored, context(ACM, "req-2", "cus-1"))).toEqual({});
    expect(ownedDraftsForContext(stored, context(ACM, "req-1", "cus-2"))).toEqual({
      [ACM_ONLY_FIELD]: "1200",
    });
    expect(ownedDraftsForContext(stored, context(LETTERS, "req-1", "cus-1"))).toEqual({});
  });

  it("does not inherit a request-owned draft into a customer-only context", () => {
    const stored = {
      drafts: { [ACM_ONLY_FIELD]: "1200" },
      draftContext: context(ACM, "req-1", "cus-1"),
    };
    expect(ownedDraftsForContext(stored, context(ACM, null, "cus-1"))).toEqual({});
  });

  it("keeps customer-owned drafts only for that customer when no request is selected", () => {
    const stored = {
      drafts: { [ACM_ONLY_FIELD]: "800" },
      draftContext: context(ACM, null, "cus-1"),
    };
    expect(ownedDraftsForContext(stored, context(ACM, null, "cus-1"))).toEqual({
      [ACM_ONLY_FIELD]: "800",
    });
    expect(ownedDraftsForContext(stored, context(ACM, null, "cus-2"))).toEqual({});
    expect(ownedDraftsForContext(stored, context(ACM, "req-9", "cus-1"))).toEqual({});
  });

  it("counts zero foreign fields after a product switch", () => {
    const lettersSession = {
      drafts: { [LETTERS_ONLY_FIELD]: "18000" },
      draftContext: context(LETTERS, "req-1", "cus-1"),
    };
    const acmSession = {
      drafts: { [ACM_ONLY_FIELD]: "1200" },
      draftContext: context(ACM, "req-1", "cus-1"),
    };
    expect(ownedDraftsForContext(lettersSession, context(ACM, "req-1", "cus-1"))).toEqual({});
    expect(ownedDraftsForContext(acmSession, context(LETTERS, "req-1", "cus-1"))).toEqual({});
  });

  it("round-trips same-context drafts through session storage", () => {
    writeConfiguratorSession({
      drafts: { [ACM_ONLY_FIELD]: "1200" },
      draftContext: context(ACM, "req-1", "cus-1"),
      customerId: "cus-1",
      requestId: "req-1",
      productCode: ACM,
      lastQuote: null,
    });

    const stored = readConfiguratorSession();
    expect(stored.draftContext).toEqual(context(ACM, "req-1", "cus-1"));
    expect(ownedDraftsForContext(stored, context(ACM, "req-1", "cus-1"))).toEqual({
      [ACM_ONLY_FIELD]: "1200",
    });
    expect(ownedDraftsForContext(stored, context(ACM, "req-2", "cus-1"))).toEqual({});
  });

  it("clears stored drafts without leaving a session key", () => {
    writeConfiguratorSession({
      drafts: { [ACM_ONLY_FIELD]: "1200" },
      draftContext: context(ACM, "req-1", "cus-1"),
      customerId: "cus-1",
      requestId: "req-1",
      productCode: ACM,
      lastQuote: null,
    });
    clearConfiguratorSession();
    expect(readConfiguratorSession().drafts).toEqual({});
    expect(sessionStorage.getItem("workos-ui20.configurator.v1")).toBeNull();
  });
});

describe("labelsMatchingContext", () => {
  it("keeps labels only while customer and request ids still match", () => {
    const stored = {
      customerId: "cus-1",
      requestId: "req-1",
      customerLabel: "Atelier Nord",
      requestLabel: "Litere vitrină",
    };
    expect(labelsMatchingContext(stored, { customerId: "cus-1", requestId: "req-1" })).toEqual({
      customerLabel: "Atelier Nord",
      requestLabel: "Litere vitrină",
    });
    expect(labelsMatchingContext(stored, { customerId: "cus-1", requestId: "req-2" })).toEqual({
      customerLabel: "Atelier Nord",
      requestLabel: null,
    });
    expect(labelsMatchingContext(stored, { customerId: "cus-2", requestId: "req-1" })).toEqual({
      customerLabel: null,
      requestLabel: "Litere vitrină",
    });
  });
});

describe("lastQuoteOwnedByContext", () => {
  it("hides a quote from another configuration context", () => {
    const quote = {
      productCode: ACM,
      quoteSnapshotId: "q-a",
      customerId: "cus-A",
      requestId: "req-A",
    };
    expect(lastQuoteOwnedByContext(quote, context(ACM, "req-A", "cus-A"))).toEqual(quote);
    expect(lastQuoteOwnedByContext(quote, context(ACM, "req-B", "cus-B"))).toBeNull();
    expect(lastQuoteOwnedByContext(quote, context(LETTERS, "req-A", "cus-A"))).toBeNull();
  });
});

const session = (
  customerId: string | null,
  requestId: string | null,
): ConfiguratorSession => ({
  drafts: { widthMm: "1200" },
  draftContext: context(ACM, requestId, customerId),
  customerId,
  requestId,
  productCode: ACM,
  lastQuote: null,
  customerLabel: customerId === "cus-A" ? "Client A" : "Client B",
  requestLabel: requestId === "req-A" ? "Cerere A" : "Cerere B",
});

describe("bindConfiguratorSessionToCustomer", () => {
  it("keeps the request when the same customer is opened again", () => {
    const next = bindConfiguratorSessionToCustomer(session("cus-A", "req-A"), "cus-A", "Client A");
    expect(next.requestId).toBe("req-A");
    expect(next.requestLabel).toBe("Cerere A");
    expect(next.drafts).toEqual({ widthMm: "1200" });
  });

  it("does not keep customer A request after opening customer B", () => {
    const next = bindConfiguratorSessionToCustomer(session("cus-A", "req-A"), "cus-B", "Client B");
    expect(next.customerId).toBe("cus-B");
    expect(next.requestId).toBeNull();
    expect(next.requestLabel).toBeNull();
    expect(next.drafts).toEqual({ widthMm: "1200" });
  });
});

describe("resolveOwnedSpine", () => {
  const requests = [
    { requestId: "req-A", customerId: "cus-A" },
    { requestId: "req-B", customerId: "cus-B" },
  ];

  it("does not publish any unverified request while retaining the stored session", () => {
    const stored = session("cus-A", "req-A");
    expect(resolveOwnedSpine({ url: { customerId: null, requestId: "req-B", productCode: null }, stored, requests: null }).requestId).toBeNull();
    expect(resolveOwnedSpine({ url: { customerId: "cus-A", requestId: null, productCode: null }, stored, requests: null }).requestId).toBeNull();
    expect(stored.requestId).toBe("req-A");
  });

  it("uses a request's verified owner rather than another stored customer", () => {
    expect(resolveOwnedSpine({ url: { customerId: null, requestId: "req-B", productCode: null }, stored: session("cus-A", "req-A"), requests }))
      .toEqual({ customerId: "cus-B", requestId: "req-B", productCode: null });
  });

  it("rejects incompatible explicit customer and request identities", () => {
    expect(resolveOwnedSpine({ url: { customerId: "cus-A", requestId: "req-B", productCode: null }, stored: session("cus-A", "req-A"), requests }).requestId).toBeNull();
  });

  it("keeps a verified customer A request through catalog", () => {
    expect(
      resolveOwnedSpine({
        url: { customerId: "cus-A", requestId: "req-A", productCode: null },
        stored: session("cus-A", "req-A"),
        requests,
      }),
    ).toEqual({ customerId: "cus-A", requestId: "req-A", productCode: null });
  });

  it("drops customer A request when catalog falls back to customer B", () => {
    expect(
      resolveOwnedSpine({
        url: { customerId: "cus-B", requestId: null, productCode: null },
        stored: session("cus-A", "req-A"),
        requests,
      }),
    ).toEqual({ customerId: "cus-B", requestId: null, productCode: null });
  });

  it("does not pair a URL customer with another customer's stored request", () => {
    expect(
      resolveOwnedSpine({
        url: { customerId: "cus-B", requestId: null, productCode: null },
        stored: session("cus-A", "req-A"),
        requests: null,
      }),
    ).toEqual({ customerId: "cus-B", requestId: null, productCode: null });
  });
});

describe("draft continuity across products", () => {
  it("recovers A after A → B → A without leaking into another request or assembly", () => {
    const a = context(LETTERS, "req-A", "cus-A"); const b = context(ACM, "req-A", "cus-A");
    const session = (draftContext: ConfiguratorContext, drafts: Record<string, string>): ConfiguratorSession => ({ draftContext, drafts, ...draftContext, lastQuote: null });
    writeConfiguratorSession(session(a, { "root.inscription": "ATELIER", [LETTERS_ONLY_FIELD]: "250000" }));
    writeConfiguratorSession(session(b, { [ACM_ONLY_FIELD]: "1800" }));
    expect(ownedDraftsForContext(readConfiguratorSession(), a)).toEqual({ "root.inscription": "ATELIER", [LETTERS_ONLY_FIELD]: "250000" });
    expect(ownedDraftsForContext(readConfiguratorSession(), { ...a, requestId: "req-B" })).toEqual({});
    expect(ownedDraftsForContext(readConfiguratorSession(), { ...a, assemblyId: "asm-A" })).toEqual({});
    const member = { ...a, assemblyId: "asm-A" }; writeConfiguratorSession(session(member, { "root.inscription": "MEMBRU" }));
    writeConfiguratorSession(session(b, { [ACM_ONLY_FIELD]: "2000" }));
    expect(ownedDraftsForContext(readConfiguratorSession(), member)).toEqual({ "root.inscription": "MEMBRU" });
    clearConfiguratorSession(); expect(ownedDraftsForContext(readConfiguratorSession(), a)).toEqual({});
  });
});
