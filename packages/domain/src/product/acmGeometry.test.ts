import { describe, expect, it } from "vitest";
import {
  ACM_FRAME_CLEARANCE_STARTER_MM,
  ACM_UNFOLD_RETURN_SIDES,
  cassetteBlankMm,
  frameExternalSizeMm,
  rectanglePerimeterMm,
} from "./acmGeometry.js";

describe("ACM cassette geometry", () => {
  it("sizes the internal frame from panel outer, thickness and organization clearance", () => {
    expect(ACM_FRAME_CLEARANCE_STARTER_MM).toBe(2);
    expect(frameExternalSizeMm(1000, 3, 2)).toBe(992);
    expect(frameExternalSizeMm(500, 3, 2)).toBe(492);
    expect(frameExternalSizeMm(1000, 3, 6)).toBe(988);
    expect(frameExternalSizeMm(500, 3, 6)).toBe(488);
  });

  it("develops the rectangular blank from first return and optional second return", () => {
    expect(ACM_UNFOLD_RETURN_SIDES).toBe(2);
    expect(cassetteBlankMm(1000, 40)).toBe(1080);
    expect(cassetteBlankMm(500, 40)).toBe(580);
    expect(cassetteBlankMm(3000, 80, 25)).toBe(3210);
    expect(cassetteBlankMm(500, 80, 25)).toBe(710);
    expect((3210 * 710) / 1_000_000).toBeCloseTo(2.2791, 6);
    expect(rectanglePerimeterMm(992, 492)).toBe(2968);
  });
});
