import type { BranchCommercialState, CommercialBranch } from "./requestCommercialBranches";

/**
 * The whole request at once: how many branches reached which commercial state, read from each
 * branch's current offer. The most advanced step is the server's commercialProgress; this only
 * counts the branches that share it, so one accepted offer never reads as a closed request.
 */

export type ProgressSegment = {
  key: string;
  state: BranchCommercialState;
  label: string;
};

export type ProgressGroup = {
  state: BranchCommercialState;
  label: string;
  branches: readonly CommercialBranch[];
};

export type RequestCommercialProgressView = {
  /** Branches with a current offer. */
  offered: number;
  ordered: number;
  accepted: number;
  quoted: number;
  withoutOffer: number;
  unclear: number;
  headline: string;
  segments: ProgressSegment[];
  furthest: { label: string; detail: string | null } | null;
  groups: ProgressGroup[];
};

const GROUP_ORDER: readonly { state: BranchCommercialState; label: string }[] = [
  { state: "ordered", label: "Cu comandă" },
  { state: "accepted", label: "Acceptate, fără comandă" },
  { state: "quoted", label: "Urmează acceptarea" },
  { state: "unclear", label: "Stare neclară" },
  { state: "no-offer", label: "Fără ofertă" },
];

function count(branches: readonly CommercialBranch[], state: BranchCommercialState): number {
  return branches.filter((branch) => branch.state === state).length;
}

function offers(value: number): string {
  return value === 1 ? "ofertă" : "oferte";
}

function branchesWord(value: number): string {
  return value === 1 ? "1 ramură" : `${value} ramuri`;
}

function headline(view: Omit<RequestCommercialProgressView, "headline" | "segments" | "furthest" | "groups">): string {
  const { offered, ordered, accepted, quoted, withoutOffer, unclear } = view;
  if (offered === 0 && withoutOffer === 0) return "Nicio ofertă încă";
  const parts: string[] = [];
  if (offered === 0) {
    parts.push("Nicio ofertă încă");
  } else if (ordered > 0) {
    parts.push(`${ordered} din ${offered} ${offers(offered)} ${ordered === 1 ? "are" : "au"} comandă`);
  } else if (accepted > 0) {
    parts.push(`${accepted} din ${offered} ${offers(offered)} ${accepted === 1 ? "acceptată" : "acceptate"}`);
  } else {
    parts.push(offered === 1 ? "1 ofertă, neacceptată" : `${offered} oferte, niciuna acceptată`);
  }
  if (ordered > 0 && accepted > 0) parts.push(`${accepted} urmează comanda`);
  if (quoted > 0 && (ordered > 0 || accepted > 0)) parts.push(`${quoted} urmează acceptarea`);
  if (unclear > 0) parts.push(`${unclear} cu stare neclară`);
  if (withoutOffer > 0) parts.push(`${branchesWord(withoutOffer)} fără ofertă`);
  return parts.join(" · ");
}

function furthestCount(progress: string | null, view: { ordered: number; accepted: number; quoted: number }): number | null {
  switch (progress) {
    case "ORDER_CREATED":
      return view.ordered;
    case "QUOTE_ACCEPTED":
      return view.accepted;
    case "QUOTE_CREATED":
      return view.quoted;
    default:
      return null;
  }
}

export function presentRequestCommercialProgress(input: {
  branches: readonly CommercialBranch[];
  commercialProgress: string | null;
  commercialProgressLabel: string | null;
}): RequestCommercialProgressView {
  const branches = input.branches;
  const counts = {
    ordered: count(branches, "ordered"),
    accepted: count(branches, "accepted"),
    quoted: count(branches, "quoted"),
    unclear: count(branches, "unclear"),
    withoutOffer: count(branches, "no-offer"),
  };
  const offered = branches.length - counts.withoutOffer;
  const base = { offered, ...counts };
  const label = input.commercialProgressLabel?.trim() || null;
  const sharing = furthestCount(input.commercialProgress, counts);
  return {
    ...base,
    headline: headline(base),
    segments: branches.map((branch) => ({
      key: branch.key,
      state: branch.state,
      label: `${branch.indexLabel} ${branch.title}: ${branch.stateLabel}`,
    })),
    furthest: label ? { label, detail: sharing && sharing > 0 ? `pe ${branchesWord(sharing)}` : null } : null,
    groups: GROUP_ORDER.map((group) => ({
      ...group,
      branches: branches.filter((branch) => branch.state === group.state),
    })).filter((group) => group.branches.length > 0 || group.state === "ordered" || group.state === "accepted" || group.state === "quoted"),
  };
}
