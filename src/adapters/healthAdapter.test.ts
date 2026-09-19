import { describe, expect, it } from "vitest";
import { presentHealth } from "./healthAdapter";

describe("presentHealth", () => {
  it("presents a compatible health payload", () => {
    const presented = presentHealth({
      status: "ok",
      service: "workos-final-api",
      apiContractId: "workos-ui-contract-v1",
    });

    expect(presented).toEqual({
      kind: "compatible",
      service: "workos-final-api",
      contractId: "workos-ui-contract-v1",
    });
  });

  it("does not continue when the contract is absent", () => {
    const presented = presentHealth({ status: "ok" });
    expect(presented.kind).toBe("incompatible");
  });
});
