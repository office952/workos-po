import { describe, expect, it } from "vitest";
import { assertUi20Contract, UI20_TRANSPORT_CONTRACT_ID } from "./contract";

describe("assertUi20Contract", () => {
  it("accepts the canonical contract identity", () => {
    const result = assertUi20Contract({
      status: "ok",
      service: "workos-final-api",
      apiContractId: UI20_TRANSPORT_CONTRACT_ID,
    });

    expect(result).toEqual({
      status: "compatible",
      contractId: UI20_TRANSPORT_CONTRACT_ID,
    });
  });

  it("fails closed when the identity is missing", () => {
    const result = assertUi20Contract({ status: "ok", service: "workos-final-api" });
    expect(result.status).toBe("incompatible");
    if (result.status === "incompatible") {
      expect(result.reason).not.toContain("/api/");
    }
  });

  it("fails closed when the identity is different", () => {
    const result = assertUi20Contract({ apiContractId: "other-contract" });
    expect(result.status).toBe("incompatible");
    if (result.status === "incompatible") {
      expect(result.received).toBe("other-contract");
    }
  });
});
