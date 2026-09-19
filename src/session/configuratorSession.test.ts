import { afterEach, describe, expect, it } from "vitest";
import {
  labelsMatchingContext,
  lastQuoteOwnedByContext,
  ownedDraftsForContext,
  clearConfiguratorSession,
  readConfiguratorSession,
  writeConfiguratorSession,
  type ConfiguratorContext,
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
