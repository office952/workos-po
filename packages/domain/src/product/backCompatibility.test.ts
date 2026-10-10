import { describe, expect, it } from "vitest";
import { evaluateBackCompatibility } from "./backCompatibility.js";

describe("constructive BACK compatibility", () => {
  it("allows a grooved BACK on a metal frame", () => {
    expect(evaluateBackCompatibility("METAL_FRAME", "GROOVED")).toEqual({
      status: "COMPATIBLE", support: "METAL_FRAME", profile: "GROOVED",
    });
  });

  it("allows a flat BACK on a panel", () => {
    expect(evaluateBackCompatibility("PANEL", "FLAT")).toEqual({
      status: "COMPATIBLE", support: "PANEL", profile: "FLAT",
    });
  });

  it("rejects contradictory mounting profiles", () => {
    expect(evaluateBackCompatibility("METAL_FRAME", "FLAT")).toEqual({
      status: "INCOMPATIBLE", reason: "frame_requires_grooved",
    });
    expect(evaluateBackCompatibility("PANEL", "GROOVED")).toEqual({
      status: "INCOMPATIBLE", reason: "panel_requires_flat",
    });
  });

  it("rejects unknown or absent values instead of guessing", () => {
    expect(evaluateBackCompatibility(undefined, "FLAT")).toEqual({
      status: "UNSUPPORTED_INPUT", reason: "unknown_support_or_profile",
    });
    expect(evaluateBackCompatibility("SUPPLIED_WALL", "FLAT").status).toBe("UNSUPPORTED_INPUT");
    expect(evaluateBackCompatibility("METAL_FRAME", "AUTO").status).toBe("UNSUPPORTED_INPUT");
  });
});
