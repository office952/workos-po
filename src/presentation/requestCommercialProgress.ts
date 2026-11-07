import type { BranchCommercialState, CommercialBranch } from "./requestCommercialBranches";

/**
 * The request's branches grouped by the server's commercial status of each current offer.
 * Counting only: the headline and every status come from the server, never from a stage rank.
 */

export type ProgressGroup = {
  state: BranchCommercialState;
  label: string;
  branches: readonly CommercialBranch[];
};

export type RequestCommercialProgressView = {
  /** Branches with a current offer. */
  offered: number;
  groups: ProgressGroup[];
};

const GROUP_ORDER: readonly { state: BranchCommercialState; label: string }[] = [
  { state: "accepted", label: "Acceptate · fără comandă" },
  { state: "undecided", label: "Fără decizie comercială" },
  { state: "awaiting", label: "Fără decizie" },
  { state: "ordered", label: "Cu comandă" },
  { state: "decided", label: "Decise" },
  { state: "superseded", label: "Înlocuite" },
  { state: "unclear", label: "Stare neclară" },
  { state: "no-offer", label: "Fără ofertă" },
];

export function presentRequestCommercialProgress(input: {
  branches: readonly CommercialBranch[];
}): RequestCommercialProgressView {
  const branches = input.branches;
  return {
    offered: branches.filter((branch) => branch.state !== "no-offer").length,
    groups: GROUP_ORDER.map((group) => ({
      ...group,
      branches: branches.filter((branch) => branch.state === group.state),
    })).filter((group) => group.branches.length > 0),
  };
}
