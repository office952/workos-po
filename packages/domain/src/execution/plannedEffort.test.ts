import { describe, expect, it } from "vitest";
import { parsePlannedEffortMinutes, plannedEffortIsUnknown } from "./plannedEffort.js";

describe("parsePlannedEffortMinutes", () => {
  it("accepts null as UNKNOWN", () => {
    expect(parsePlannedEffortMinutes(null)).toEqual({
      ok: true,
      plannedEffortMinutes: null,
    });
  });

  it("accepts a positive integer", () => {
    expect(parsePlannedEffortMinutes(45)).toEqual({
      ok: true,
      plannedEffortMinutes: 45,
    });
  });

  it("rejects zero, negative, fraction, and non-numbers", () => {
    expect(parsePlannedEffortMinutes(0).ok).toBe(false);
    expect(parsePlannedEffortMinutes(-12).ok).toBe(false);
    expect(parsePlannedEffortMinutes(1.5).ok).toBe(false);
    expect(parsePlannedEffortMinutes(Number.NaN).ok).toBe(false);
    expect(parsePlannedEffortMinutes(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(parsePlannedEffortMinutes("45").ok).toBe(false);
    expect(parsePlannedEffortMinutes(undefined).ok).toBe(false);
  });

  it("does not treat UNKNOWN as zero", () => {
    expect(plannedEffortIsUnknown(null)).toBe(true);
    expect(plannedEffortIsUnknown(0)).toBe(false);
    expect(plannedEffortIsUnknown(45)).toBe(false);
  });
});
