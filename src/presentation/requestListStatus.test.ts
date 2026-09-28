import { describe, expect, it } from "vitest";
import { presentRequestRegistryStatus } from "./requestListStatus";

describe("presentRequestRegistryStatus", () => {
  it("replaces misleading Nouă when commercial progress already exists", () => {
    expect(
      presentRequestRegistryStatus({
        status: "NEW",
        statusLabel: "Nouă",
        contextLabel: "Ofertă creată",
      }),
    ).toEqual({ stateLabel: "Ofertă creată", supportLabel: "" });

    expect(
      presentRequestRegistryStatus({
        status: "NEW",
        statusLabel: "Nouă",
        contextLabel: "Comandă creată",
      }),
    ).toEqual({ stateLabel: "Comandă creată", supportLabel: "" });
  });

  it("keeps workflow status when there is no commercial progress", () => {
    expect(
      presentRequestRegistryStatus({
        status: "NEW",
        statusLabel: "Nouă",
        contextLabel: null,
      }),
    ).toEqual({ stateLabel: "Nouă", supportLabel: "" });
  });

  it("keeps both labels when workflow status is not Nouă", () => {
    expect(
      presentRequestRegistryStatus({
        status: "READY_FOR_QUOTE",
        statusLabel: "Gata de ofertă",
        contextLabel: "Ofertă creată",
      }),
    ).toEqual({ stateLabel: "Gata de ofertă", supportLabel: "Ofertă creată" });
  });
});
