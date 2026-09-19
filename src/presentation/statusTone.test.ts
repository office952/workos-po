import { describe, expect, it } from "vitest";
import { statusTone } from "./statusTone";

describe("statusTone", () => {
  it("maps semantic kinds without reading business labels", () => {
    expect(statusTone("workflow")).toBe("neutral");
    expect(statusTone("warning")).toBe("incomplete");
    expect(statusTone("danger")).toBe("blocked");
    expect(statusTone("success")).toBe("ready");
  });
});
