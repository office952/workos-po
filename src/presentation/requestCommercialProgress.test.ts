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

describe("request commercial progress (W2 · D07)", () => {
  it("shows a mixed request as partly ordered, with the remaining work, never as complete", () => {
    const view = presentRequestCommercialProgress({
      branches: states("quoted", "ordered", "quoted", "quoted", "ordered", "quoted", "quoted", "quoted"),
      commercialProgress: "ORDER_CREATED",
      commercialProgressLabel: "Comandă creată",
    });
    expect(view.headline).toBe("2 din 8 oferte au comandă · 6 urmează acceptarea");
    expect(view.furthest).toEqual({ label: "Comandă creată", detail: "pe 2 ramuri" });
    expect(view.segments.map((segment) => segment.state)).toEqual(["quoted", "ordered", "quoted", "quoted", "ordered", "quoted", "quoted", "quoted"]);
    expect(view.groups.find((group) => group.state === "ordered")?.branches.map((item) => item.title)).toEqual(["SFC-2", "SFC-5"]);
    expect(view.groups.find((group) => group.state === "quoted")?.branches).toHaveLength(6);
    expect(JSON.stringify(view)).not.toMatch(/câștigat|închis|finalizat/i);
  });

  it("counts eight unaccepted offers as none accepted", () => {
    const view = presentRequestCommercialProgress({
      branches: states(...Array.from({ length: 8 }, () => "quoted" as const)),
      commercialProgress: "QUOTE_CREATED",
      commercialProgressLabel: "Ofertă creată",
    });
    expect(view.headline).toBe("8 oferte, niciuna acceptată");
    expect(view.furthest?.detail).toBe("pe 8 ramuri");
  });

  it("keeps several accepted offers apart from orders", () => {
    const view = presentRequestCommercialProgress({
      branches: states("accepted", "quoted", "accepted"),
      commercialProgress: "QUOTE_ACCEPTED",
      commercialProgressLabel: "Ofertă acceptată",
    });
    expect(view.headline).toBe("2 din 3 oferte acceptate · 1 urmează acceptarea");
    expect(view.furthest?.detail).toBe("pe 2 ramuri");
  });

  it("names accepted offers that still wait for an order beside ordered ones", () => {
    const view = presentRequestCommercialProgress({
      branches: states("ordered", "accepted", "quoted"),
      commercialProgress: "ORDER_CREATED",
      commercialProgressLabel: "Comandă creată",
    });
    expect(view.headline).toBe("1 din 3 oferte are comandă · 1 urmează comanda · 1 urmează acceptarea");
  });

  it("says plainly when there is no offer", () => {
    const view = presentRequestCommercialProgress({ branches: [], commercialProgress: null, commercialProgressLabel: null });
    expect(view.headline).toBe("Nicio ofertă încă");
    expect(view.furthest).toBeNull();
    expect(view.segments).toEqual([]);
  });

  it("names unclear branches instead of hiding them", () => {
    const view = presentRequestCommercialProgress({
      branches: states("ordered", "unclear"),
      commercialProgress: "ORDER_CREATED",
      commercialProgressLabel: "Comandă creată",
    });
    expect(view.headline).toBe("1 din 2 oferte are comandă · 1 cu stare neclară");
    expect(view.groups.map((group) => group.state)).toContain("unclear");
  });
});
