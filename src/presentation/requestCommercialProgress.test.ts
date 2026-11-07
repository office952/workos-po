import { describe, expect, it } from "vitest";
import type { BranchCommercialState, CommercialBranch } from "./requestCommercialBranches";
import { presentRequestCommercialProgress } from "./requestCommercialProgress";

function branch(index: number, state: BranchCommercialState): CommercialBranch {
  return {
    key: `quote:q-${index}`,
    indexLabel: String(index).padStart(2, "0"),
    title: `SFC-${index}`,
    state,
    stateLabel: state,
  } as CommercialBranch;
}

function states(...list: BranchCommercialState[]): CommercialBranch[] {
  return list.map((state, index) => branch(index + 1, state));
}

describe("request commercial progress (CJ1)", () => {
  it("groups branches by the server status, obligations first, and drops empty groups", () => {
    const view = presentRequestCommercialProgress({
      branches: states("awaiting", "ordered", "accepted", "decided", "ordered"),
    });
    expect(view.offered).toBe(5);
    expect(view.groups.map((group) => group.state)).toEqual(["accepted", "awaiting", "ordered", "decided"]);
    expect(view.groups.find((group) => group.state === "ordered")?.branches.map((item) => item.title)).toEqual([
      "SFC-2",
      "SFC-5",
    ]);
    expect(JSON.stringify(view)).not.toMatch(/câștigat|închis|finalizat/i);
  });

  it("does not count a branch without an offer as offered", () => {
    const view = presentRequestCommercialProgress({ branches: states("no-offer", "awaiting") });
    expect(view.offered).toBe(1);
    expect(view.groups.map((group) => group.label)).toEqual(["Fără decizie", "Fără ofertă"]);
  });
});
