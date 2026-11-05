import { describe, expect, it } from "vitest";
import { TransportError } from "../api/http";
import { classifyExecutionCompletionFailure } from "./executionCompletionError";

describe("execution completion failure classification", () => {
  it("keeps a missing transport distinct from a server refusal", () => {
    expect(classifyExecutionCompletionFailure(new TypeError("Failed to fetch"))).toEqual({
      kind: "network",
      message: "Finalizarea nu a putut fi trimisă. Verifică conexiunea și încearcă din nou.",
    });
    expect(
      classifyExecutionCompletionFailure(
        new TransportError("Cererea a eșuat.", 422, { error: "machine_run_active" }),
      ),
    ).toEqual({
      kind: "refusal",
      message: "Oprește rularea utilajului înainte de a închide sarcina.",
    });
    expect(
      classifyExecutionCompletionFailure(
        new TransportError("Cererea a eșuat.", 422, { error: "invalid_quantity" }),
      ).kind,
    ).toBe("refusal");
  });
});
