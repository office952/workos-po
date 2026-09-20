import { describe, expect, it } from "vitest";
import { presentQuoteSnapshot } from "./quoteAdapter";
import {
  compareFrozenProfileLines,
  frozenProfileMatches,
} from "../test/snapshotProof";

function snapshot(id: string, rate: number, cost: number) {
  return presentQuoteSnapshot({
    quoteSnapshot: {
      quoteSnapshotId: id,
      productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      productLabel: "Litere",
      inscription: "synthetic reference text",
      sourceReviewId: "crv1:x",
      eic: {
        completeness: "COMPLETE",
        currency: "EUR",
        total: cost,
        lines: [
          {
            resourceId: "aluminium_return_profile",
            label: "Profil aluminiu 0,6 mm",
            quantity: 12.5,
            unit: "m",
            rate,
            currency: "EUR",
            cost,
          },
        ],
      },
    },
  });
}

describe("quote adapter", () => {
  it("reads a frozen snapshot without changing its profile line", () => {
    const presented = snapshot("q-a", 3, 37.5);
    expect(presented?.quoteSnapshotId).toBe("q-a");
    expect(presented?.lines[0]).toMatchObject({ rate: 3, cost: 37.5 });
    expect(presented?.customerDisplayName).toBeNull();
    expect(presented?.requestId).toBeNull();
  });

  it("reads frozen customer identity and the request link from server transport", () => {
    const presented = presentQuoteSnapshot({
      quoteSnapshot: {
        quoteSnapshotId: "q-ctx",
        productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
        productLabel: "Litere",
        customer: { customerId: "cus-1", displayName: "Atelier Nord" },
        eic: { completeness: "COMPLETE", currency: "EUR", total: 1, lines: [] },
      },
      request: { requestId: "req-1", href: "/requests/req-1" },
    });
    expect(presented?.customerId).toBe("cus-1");
    expect(presented?.customerDisplayName).toBe("Atelier Nord");
    expect(presented?.requestId).toBe("req-1");
  });

  it("passes through customer and request facts when the snapshot already has them", () => {
    const presented = presentQuoteSnapshot({
      quoteSnapshot: {
        quoteSnapshotId: "q-ctx",
        productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
        productLabel: "Litere",
        customerId: "cus-1",
        customerDisplayName: "Atelier Nord",
        requestId: "req-1",
        eic: { completeness: "COMPLETE", currency: "EUR", total: 1, lines: [] },
      },
    });
    expect(presented?.customerId).toBe("cus-1");
    expect(presented?.customerDisplayName).toBe("Atelier Nord");
    expect(presented?.requestId).toBe("req-1");
  });

  it("compares historical snapshots without repricing A", () => {
    const first = snapshot("q-a", 3, 37.5);
    const second = snapshot("q-b", 3.2, 40);
    expect(first && second).toBeTruthy();
    if (!first || !second) {
      return;
    }
    expect(
      compareFrozenProfileLines(first, second, "aluminium_return_profile"),
    ).toEqual({
      snapshotAId: "q-a",
      snapshotBId: "q-b",
      rateA: 3,
      costA: 37.5,
      rateB: 3.2,
      costB: 40,
      historicalReprice: false,
    });
    expect(
      frozenProfileMatches(first, "aluminium_return_profile", {
        rate: 3,
        cost: 37.5,
        quantity: 12.5,
      }),
    ).toBe(true);
    expect(
      frozenProfileMatches(second, "aluminium_return_profile", {
        rate: 3.2,
        cost: 40,
        quantity: 12.5,
      }),
    ).toBe(true);
  });
});
