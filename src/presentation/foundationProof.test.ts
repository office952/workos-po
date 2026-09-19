import { describe, expect, it } from "vitest";
import { FOUNDATION_PROOF_FIXTURE } from "../fixtures/foundationProof";
import { presentProofNextStep, selectProofObject } from "./foundationProof";

describe("selectProofObject", () => {
  it("returns the requested fixture object", () => {
    const object = selectProofObject(FOUNDATION_PROOF_FIXTURE, "CER-DEMO-0835");
    expect(object.readiness).toBe("blocked");
    expect(object.missing.length).toBeGreaterThan(0);
  });
});

describe("presentProofNextStep", () => {
  it("states that the primary action is unavailable when the contract is unsupported", () => {
    const object = selectProofObject(FOUNDATION_PROOF_FIXTURE, "CER-DEMO-0842");
    expect(presentProofNextStep(false, object)).toEqual({
      title: "Acțiunea este indisponibilă",
      body: "Acțiunea principală rămâne indisponibilă deoarece contractul API nu este suportat.",
    });
  });

  it("keeps fixture next-step copy for a ready object only after the contract is compatible", () => {
    const object = selectProofObject(FOUNDATION_PROOF_FIXTURE, "CER-DEMO-0842");
    expect(presentProofNextStep(true, object).body).toContain("obiect demonstrativ");
  });
});
