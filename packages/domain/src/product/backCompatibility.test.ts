import { describe, expect, it } from "vitest";
import { evaluateBackCompatibility, recommendBackProfile } from "./backCompatibility.js";

describe("constructive BACK compatibility", () => {
  it("allows either profile on a metal frame or a panel", () => {
    expect(evaluateBackCompatibility("METAL_FRAME", "GROOVED")).toEqual({
      status: "COMPATIBLE", support: "METAL_FRAME", profile: "GROOVED",
    });
    expect(evaluateBackCompatibility("METAL_FRAME", "FLAT")).toEqual({
      status: "COMPATIBLE", support: "METAL_FRAME", profile: "FLAT",
    });
    expect(evaluateBackCompatibility("PANEL", "FLAT")).toEqual({
      status: "COMPATIBLE", support: "PANEL", profile: "FLAT",
    });
    expect(evaluateBackCompatibility("PANEL", "GROOVED")).toEqual({
      status: "COMPATIBLE", support: "PANEL", profile: "GROOVED",
    });
  });

  it("allows a profile without a support", () => {
    expect(evaluateBackCompatibility(undefined, "FLAT")).toEqual({
      status: "COMPATIBLE", support: null, profile: "FLAT",
    });
    expect(evaluateBackCompatibility(null, "GROOVED")).toEqual({
      status: "COMPATIBLE", support: null, profile: "GROOVED",
    });
  });

  it("keeps support recommendations separate from compatibility", () => {
    expect(recommendBackProfile("METAL_FRAME")).toBe("GROOVED");
    expect(recommendBackProfile("PANEL")).toBe("FLAT");
    expect(recommendBackProfile(undefined)).toBeNull();
    expect(evaluateBackCompatibility("METAL_FRAME", "FLAT").status).toBe("COMPATIBLE");
    expect(evaluateBackCompatibility("PANEL", "GROOVED").status).toBe("COMPATIBLE");
  });

  it("rejects unknown or absent profiles instead of guessing", () => {
    expect(evaluateBackCompatibility(undefined, undefined)).toEqual({
      status: "UNSUPPORTED_INPUT", reason: "unknown_support_or_profile",
    });
    expect(evaluateBackCompatibility("SUPPLIED_WALL", "FLAT").status).toBe("UNSUPPORTED_INPUT");
    expect(evaluateBackCompatibility("METAL_FRAME", "AUTO").status).toBe("UNSUPPORTED_INPUT");
  });
});
