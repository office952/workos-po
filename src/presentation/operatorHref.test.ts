import { describe, expect, it } from "vitest";
import { quoteHrefFromEngineHref, quoteHrefFromSnapshotIdentity } from "./operatorHref";

describe("operator quote href mapping", () => {
  it("maps an engine quote href to the operator quote route", () => {
    expect(
      quoteHrefFromEngineHref(
        "/quotes/qts%3APRD-LETTERS-FRONTLIT-PLEXI-AL06%3A756d969c17783ec8374ef76c21e6b455a2bf0d2ae900230b1f6d9ce8e780bf55",
      ),
    ).toBe(
      "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/qts%3APRD-LETTERS-FRONTLIT-PLEXI-AL06%3A756d969c17783ec8374ef76c21e6b455a2bf0d2ae900230b1f6d9ce8e780bf55",
    );
  });

  it("prefers an explicit product code on the snapshot identity", () => {
    expect(quoteHrefFromSnapshotIdentity("q-1", "PRD-ACM-CASSETTE-NONE")).toBe(
      "/quotes/PRD-ACM-CASSETTE-NONE/q-1",
    );
  });
});
