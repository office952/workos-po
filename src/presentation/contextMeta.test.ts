import { describe, expect, it } from "vitest";
import { presentContextMeta } from "./contextMeta";

describe("presentContextMeta", () => {
  it("joins only the facts that exist", () => {
    expect(presentContextMeta(["Atelier Nord", "Litere vitrină", null])).toBe(
      "Atelier Nord · Litere vitrină",
    );
    expect(presentContextMeta([undefined, "  "])).toBeUndefined();
  });
});
