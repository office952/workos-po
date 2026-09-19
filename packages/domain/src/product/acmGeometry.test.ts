import { describe, expect, it } from "vitest";
import {
  ACM_FRAME_CLEARANCE_MM,
  ACM_UNFOLD_RETURN_SIDES,
  cassetteBlankMm,
  frameExternalSizeMm,
  rectanglePerimeterMm,
} from "./acmGeometry.js";

describe("ACM cassette geometry", () => {
  it("sizes the internal frame from panel outer, thickness and 2 mm clearance", () => {
    expect(ACM_FRAME_CLEARANCE_MM).toBe(2);
    expect(frameExternalSizeMm(1000, 3)).toBe(992);
    expect(frameExternalSizeMm(500, 3)).toBe(492);
  });

  it("does not change the frame formula when fold count changes", () => {
    const oneFold = frameExternalSizeMm(1000, 3);
    const twoFold = frameExternalSizeMm(1000, 3);
    expect(oneFold).toBe(twoFold);
  });

  it("uses a bounded unfold default, not nesting", () => {
    expect(ACM_UNFOLD_RETURN_SIDES).toBe(2);
    expect(cassetteBlankMm(1000, 40)).toBe(1080);
    expect(cassetteBlankMm(500, 40)).toBe(580);
    expect(rectanglePerimeterMm(992, 492)).toBe(2968);
  });
});
