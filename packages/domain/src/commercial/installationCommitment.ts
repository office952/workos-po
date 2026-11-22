/**
 * Commercial Continuity V2 · shared-installation overlay (Design B).
 *
 * Quotes and V2 orders stay hashed copies of their lines, including SITE_INSTALLATION.
 * This overlay does not rewrite those documents and does not introduce Order V3.
 *
 * 1. Each order total is the frozen copy of that quote (product + installation line if present).
 * 2. Consolidated customer obligation for a COMMON group is
 *    sum(document nets) − (groupSize − 1) × sharedInstallationNet
 *    (products + one installation). Example: 1,200 + 1,000 − 200 = 2,000, not 2,200.
 * 3. Installation is represented once commercially by this commitment; each order still shows
 *    its document line so the duplicated line is never concealed.
 * 4. The holder order's job owns the physical INSTALL_AT_SITE operation.
 * 5. Member jobs become ready through their own pack; holder installation is not startable
 *    until every remaining member job is packed.
 * 6. A member that leaves: the commitment stays on the holder; the member is removed.
 * 7. The holder that leaves: the commitment moves to the oldest remaining member (append-only).
 *    If none remain, the commitment ends.
 * 8. Once holder installation has started, COMMON is refused; only SEPARATE is offered.
 * 9. SEPARATE + reason keeps two real installations.
 * 10. Historical V2 orders without a commitment are unchanged.
 */

export const INSTALLATION_COMMITMENT_EVENT_KINDS = [
  "CREATED",
  "MEMBER_JOINED",
  "MEMBER_LEFT",
  "HOLDER_REASSIGNED",
  "ENDED",
] as const;
export type InstallationCommitmentEventKind = (typeof INSTALLATION_COMMITMENT_EVENT_KINDS)[number];

export type InstallationCommitmentState = {
  requestId: string;
  holderOrderSnapshotId: string;
  holderQuoteSnapshotId: string;
  memberOrderSnapshotIds: readonly string[];
  memberQuoteSnapshotIds: readonly string[];
  netPrice: number;
  decidedByLabel: string;
  decidedAt: string;
};

export function groupedOrderSnapshotIds(state: InstallationCommitmentState): readonly string[] {
  return [state.holderOrderSnapshotId, ...state.memberOrderSnapshotIds];
}

/** Extra copies of the shared installation that sit in the grouped order documents. */
export function duplicatedInstallationDocumentNet(groupSize: number, sharedInstallationNet: number): number {
  if (groupSize < 2 || sharedInstallationNet <= 0) return 0;
  return (groupSize - 1) * sharedInstallationNet;
}

/**
 * Customer-owed net for the grouped orders. Document sums stay visible separately;
 * this value is the obligation after counting the shared installation once.
 */
export function consolidatedCustomerObligationNet(
  groupedDocumentNets: readonly number[],
  sharedInstallationNet: number,
): number {
  const documentSum = groupedDocumentNets.reduce((sum, value) => sum + value, 0);
  return documentSum - duplicatedInstallationDocumentNet(groupedDocumentNets.length, sharedInstallationNet);
}

export function shouldSkipSiteInstallationOperation(
  orderSnapshotId: string,
  commitment: InstallationCommitmentState | null,
): boolean {
  if (!commitment) return false;
  return commitment.memberOrderSnapshotIds.includes(orderSnapshotId);
}

export function commonInstallationAllowed(holderInstallationStarted: boolean): boolean {
  return !holderInstallationStarted;
}

export function holderInstallationMayStart(memberPackComplete: readonly boolean[]): boolean {
  return memberPackComplete.every(Boolean);
}

export function commitmentAfterMemberLeft(
  state: InstallationCommitmentState,
  leavingOrderSnapshotId: string,
  leavingQuoteSnapshotId: string,
): InstallationCommitmentState | null {
  if (leavingOrderSnapshotId === state.holderOrderSnapshotId) {
    return commitmentAfterHolderLeft(state);
  }
  const memberOrderSnapshotIds = state.memberOrderSnapshotIds.filter((id) => id !== leavingOrderSnapshotId);
  const memberQuoteSnapshotIds = state.memberQuoteSnapshotIds.filter((id) => id !== leavingQuoteSnapshotId);
  if (memberOrderSnapshotIds.length === 0) return null;
  return { ...state, memberOrderSnapshotIds, memberQuoteSnapshotIds };
}

export function commitmentAfterHolderLeft(state: InstallationCommitmentState): InstallationCommitmentState | null {
  const [nextHolderOrder, ...restOrders] = state.memberOrderSnapshotIds;
  const [nextHolderQuote, ...restQuotes] = state.memberQuoteSnapshotIds;
  if (!nextHolderOrder || !nextHolderQuote) return null;
  return {
    ...state,
    holderOrderSnapshotId: nextHolderOrder,
    holderQuoteSnapshotId: nextHolderQuote,
    memberOrderSnapshotIds: restOrders,
    memberQuoteSnapshotIds: restQuotes,
  };
}
