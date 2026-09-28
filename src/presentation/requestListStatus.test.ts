import { describe, expect, it } from "vitest";
import { presentRequestRegistryStatus } from "./requestListStatus";

describe("presentRequestRegistryStatus", () => {
  it("keeps canonical Request state separate from commercial progress", () => {
    expect(
      presentRequestRegistryStatus({
        statusLabel: "Nouă",
        contextLabel: "Ofertă creată",
      }),
    ).toEqual({ stateLabel: "Nouă", commercialProgressLabel: "Ofertă creată" });

    expect(
      presentRequestRegistryStatus({
        statusLabel: "Nouă",
        contextLabel: "Comandă creată",
      }),
    ).toEqual({ stateLabel: "Nouă", commercialProgressLabel: "Comandă creată" });
  });

  it("keeps workflow status when there is no commercial progress", () => {
    expect(
      presentRequestRegistryStatus({
        statusLabel: "Nouă",
        contextLabel: null,
      }),
    ).toEqual({ stateLabel: "Nouă", commercialProgressLabel: "—" });
  });

  it("keeps both labels when workflow status is not Nouă", () => {
    expect(
      presentRequestRegistryStatus({
        statusLabel: "Gata de ofertă",
        contextLabel: "Ofertă creată",
      }),
    ).toEqual({ stateLabel: "Gata de ofertă", commercialProgressLabel: "Ofertă creată" });
  });
});
