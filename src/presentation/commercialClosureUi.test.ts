import { describe, expect, it } from "vitest";
import type { RequestLinkedOfferTransport } from "../api/types";
import {
  coversUnresolved,
  groupsFromDraft,
  offerDecisionLock,
  type CommercialDecisionDraft,
} from "./commercialClosureUi";

function offer(partial: Partial<RequestLinkedOfferTransport> & { quoteSnapshotId: string }): RequestLinkedOfferTransport {
  return {
    kind: "PRODUCT",
    kindLabel: "Produs",
    productCode: "P",
    productLabel: "Litere",
    inscription: null,
    reference: partial.quoteSnapshotId,
    stageLabel: "Creată",
    superseded: false,
    attentionLabel: null,
    orderSnapshotId: null,
    ...partial,
  };
}

describe("commercial closure presentation", () => {
  it("locks ordered and accepted offers and keeps unresolved selectable", () => {
    expect(offerDecisionLock(offer({ quoteSnapshotId: "q1", decisionRequired: true }))).toEqual({
      selectable: true,
      required: true,
    });
    expect(offerDecisionLock(offer({ quoteSnapshotId: "q2", stage: "QUOTE_ACCEPTED" }))).toMatchObject({
      selectable: false,
    });
    expect(offerDecisionLock(offer({ quoteSnapshotId: "q3", orderSnapshotId: "ord-1" }))).toMatchObject({
      selectable: false,
    });
  });

  it("groups homogeneous decisions and requires every unresolved id", () => {
    const draft: CommercialDecisionDraft = {
      selected: { a: "NOT_PURSUED", b: "NOT_PURSUED", c: "DECLINED_BY_CUSTOMER" },
      reasons: { NOT_PURSUED: "Nu mai urmărim", DECLINED_BY_CUSTOMER: "Clientul a refuzat" },
      closeReason: "",
    };
    expect(groupsFromDraft(draft)).toEqual([
      { disposition: "NOT_PURSUED", reason: "Nu mai urmărim", quoteSnapshotIds: ["a", "b"] },
      { disposition: "DECLINED_BY_CUSTOMER", reason: "Clientul a refuzat", quoteSnapshotIds: ["c"] },
    ]);
    expect(coversUnresolved(draft, ["a", "b", "c"])).toBe(true);
    expect(coversUnresolved(draft, ["a", "d"])).toBe(false);
  });
});
