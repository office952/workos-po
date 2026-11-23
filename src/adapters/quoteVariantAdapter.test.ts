import { describe, expect, it } from "vitest";
import {
  presentJournal,
  presentQuoteVariant,
  presentQuoteVariantConflict,
  presentQuoteVariantDetail,
  presentQuoteVariantList,
} from "./quoteVariantAdapter";

const transport = {
  variantId: "var-1",
  requestId: "req-1",
  index: 2,
  indexLabel: "02",
  productCode: "PRD-A",
  productLabel: "Litere",
  inscription: "VITRINA",
  alternativeOf: { variantId: "var-0", indexLabel: "01" },
  lifecycle: "ACTIVE",
  version: 4,
  state: "AWAITING_APPROVAL",
  stateLabel: "Așteaptă aprobarea",
  action: "DECIDE_APPROVAL",
  actionLabel: "Decide",
  needsAction: true,
  missingCount: 0,
  confirmation: { confirmedAt: "2026-11-22T10:00:00.000Z", confirmedByLabel: "ana@demo.test", valid: true },
  priceVisible: true,
  price: { netPrice: 320, forConfirmedConfiguration: true, setByLabel: "ana@demo.test" },
  canSetPrice: true,
  priceBlockedReason: null,
  totals: { netPrice: 320, vatAmount: 67.2, grossPrice: 387.2, currency: "EUR" },
  installationNetPrice: null,
  approval: { status: "REQUESTED", statusLabel: "Așteaptă aprobarea Proprietarului", approvalId: "apr-1", requestNote: "Client vechi." },
  notes: null,
  quoteSnapshotId: null,
  updatedAt: "2026-11-22T10:05:00.000Z",
  updatedByLabel: "ana@demo.test",
};

describe("quote variant adapter", () => {
  it("passes the server state, label and single action through without deriving anything", () => {
    expect(presentQuoteVariant(transport)).toMatchObject({
      variantId: "var-1",
      indexLabel: "02",
      alternativeOfIndexLabel: "01",
      stateLabel: "Așteaptă aprobarea",
      action: "DECIDE_APPROVAL",
      actionLabel: "Decide",
      needsAction: true,
      netPrice: 320,
      grossPrice: 387.2,
      confirmedByLabel: "ana@demo.test",
      approval: { status: "REQUESTED", approvalId: "apr-1", requestNote: "Client vechi." },
    });
  });

  it("refuses a payload without the fields the interface cannot guess", () => {
    expect(presentQuoteVariant(null)).toBeNull();
    expect(presentQuoteVariant({ ...transport, action: "SOMETHING_ELSE" })).toBeNull();
    expect(presentQuoteVariant({ ...transport, stateLabel: undefined })).toBeNull();
    expect(presentQuoteVariant({ ...transport, version: "4" })).toBeNull();
  });

  it("shows no price to a role the server did not give one", () => {
    const hidden = presentQuoteVariant({ ...transport, priceVisible: false, price: null, totals: null });
    expect(hidden).toMatchObject({ priceVisible: false, netPrice: null, grossPrice: null });
  });

  it("reads a list, a detail and the conflict the server reports", () => {
    expect(presentQuoteVariantList({ variants: [transport, { broken: true }] })).toHaveLength(1);
    expect(presentQuoteVariantList({})).toEqual([]);
    expect(presentQuoteVariantDetail({ variant: transport, values: { "root.inscription": "VITRINA" } })?.values).toEqual({
      "root.inscription": "VITRINA",
    });
    expect(
      presentQuoteVariantConflict({
        error: "version_conflict",
        current: { version: 7, updatedAt: "2026-11-22T10:06:00.000Z", updatedByLabel: "mihai@demo.test" },
      }),
    ).toEqual({ version: 7, updatedAt: "2026-11-22T10:06:00.000Z", updatedByLabel: "mihai@demo.test" });
    expect(presentQuoteVariantConflict({ error: "forbidden" })).toBeNull();
  });
});

describe("journal adapter", () => {
  it("orders person entries and application events in one thread, newest first", () => {
    const items = presentJournal({
      entries: [
        {
          entryId: "j1",
          kindLabel: "Buget client",
          occurredAt: "2026-11-17T16:02:00.000Z",
          authorLabel: "ana@demo.test",
          channelLabel: "întâlnire",
          amountMin: null,
          amountMax: 1800,
          currency: "EUR",
          vatBasisLabel: "TVA neprecizat",
          notes: "Vrea montaj inclus.",
          rectifiedBy: null,
        },
        {
          entryId: "j2",
          kindLabel: "Preț discutat",
          occurredAt: "2026-11-18T11:20:00.000Z",
          authorLabel: "ana@demo.test",
          channelLabel: "telefon",
          binding: "fără angajament",
          amountMin: 1400,
          amountMax: 1500,
          currency: "EUR",
          variantIndexLabel: "01",
        },
      ],
      officialEvents: [
        { entryId: "e1", kindLabel: "Ofertă emisă", occurredAt: "2026-11-19T15:05:00.000Z", authorLabel: "mihai@demo.test", netPrice: 1450, currency: "EUR" },
        { entryId: "e2", kindLabel: "Preț propus", occurredAt: "2026-11-19T14:40:00.000Z", authorLabel: "ana@demo.test", netPrice: null, currency: "EUR" },
      ],
    });
    expect(items.map((item) => item.key)).toEqual(["e1", "e2", "j2", "j1"]);
    expect(items[0]).toMatchObject({ source: "APPLICATION", detail: "din aplicație" });
    expect(items[0]?.amountLabel).toContain("1.450,00 EUR net");
    // An official price the server withheld stays withheld.
    expect(items[1]?.amountLabel).toBeNull();
    expect(items[2]?.detail).toContain("fără angajament");
    expect(items[2]?.amountLabel).toContain("–");
    expect(items[3]?.amountLabel).toMatch(/^până la/);
  });
});
