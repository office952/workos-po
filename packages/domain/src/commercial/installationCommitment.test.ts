import { describe, expect, it } from "vitest";
import {
  commitmentAfterHolderLeft,
  commitmentAfterMemberLeft,
  commonInstallationAllowed,
  consolidatedCustomerObligationNet,
  duplicatedInstallationDocumentNet,
  groupedOrderSnapshotIds,
  holderInstallationMayStart,
  shouldSkipSiteInstallationOperation,
  type InstallationCommitmentState,
} from "./installationCommitment.js";

const group: InstallationCommitmentState = {
  requestId: "crq:1",
  holderOrderSnapshotId: "ord:1",
  holderQuoteSnapshotId: "qts:1",
  memberOrderSnapshotIds: ["ord:2"],
  memberQuoteSnapshotIds: ["qts:2"],
  netPrice: 200,
  decidedByLabel: "owner@test",
  decidedAt: "2026-11-22T12:00:00.000Z",
};

describe("shared installation overlay", () => {
  it("counts the shared installation once in the consolidated obligation, without hiding document copies", () => {
    // Product 1,000 + install 200; product 800 + install 200. Documents 1,200 + 1,000 = 2,200.
    expect(duplicatedInstallationDocumentNet(2, 200)).toBe(200);
    expect(consolidatedCustomerObligationNet([1200, 1000], 200)).toBe(2000);
    expect(consolidatedCustomerObligationNet([1200], 200)).toBe(1200);
  });

  it("skips the physical installation operation only on member orders", () => {
    expect(shouldSkipSiteInstallationOperation("ord:2", group)).toBe(true);
    expect(shouldSkipSiteInstallationOperation("ord:1", group)).toBe(false);
    expect(shouldSkipSiteInstallationOperation("ord:1", null)).toBe(false);
  });

  it("refuses COMMON after the holder installation has started", () => {
    expect(commonInstallationAllowed(false)).toBe(true);
    expect(commonInstallationAllowed(true)).toBe(false);
  });

  it("lets holder installation start only when every member job is packed", () => {
    expect(holderInstallationMayStart([true])).toBe(true);
    expect(holderInstallationMayStart([true, false])).toBe(false);
    expect(holderInstallationMayStart([])).toBe(true);
  });

  it("keeps the holder when a member leaves, and reassigns when the holder leaves", () => {
    const afterMember = commitmentAfterMemberLeft(group, "ord:2", "qts:2");
    expect(afterMember).toBeNull();
    const twoMembers: InstallationCommitmentState = {
      ...group,
      memberOrderSnapshotIds: ["ord:2", "ord:3"],
      memberQuoteSnapshotIds: ["qts:2", "qts:3"],
    };
    expect(commitmentAfterMemberLeft(twoMembers, "ord:2", "qts:2")).toMatchObject({
      holderOrderSnapshotId: "ord:1",
      memberOrderSnapshotIds: ["ord:3"],
    });
    expect(commitmentAfterHolderLeft(twoMembers)).toMatchObject({
      holderOrderSnapshotId: "ord:2",
      holderQuoteSnapshotId: "qts:2",
      memberOrderSnapshotIds: ["ord:3"],
    });
    expect(groupedOrderSnapshotIds(group)).toEqual(["ord:1", "ord:2"]);
  });
});
