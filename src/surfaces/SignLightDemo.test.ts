import { describe, expect, it } from "vitest";
import { resolveSignLighting } from "./SignLightDemo";

describe("SignLightDemo lighting curves", () => {
  it("keeps all emission off at zero energy", () => {
    expect(resolveSignLighting(0, "combined", true)).toMatchObject({
      faceFill: 0,
      coreFill: 0,
      haloTight: 0,
      haloNear: 0,
      haloMid: 0,
      haloFar: 0,
    });
  });

  it("uses the 75 percent Lighting Lab benchmark without widening the far halo at peak", () => {
    const reference = resolveSignLighting(75, "halo", true);
    const peak = resolveSignLighting(100, "halo", true);

    expect(reference.haloTight).toBeGreaterThan(0.95);
    expect(reference.haloNear).toBeGreaterThan(0.7);
    expect(reference.haloFar).toBeLessThan(0.08);
    expect(peak.haloTight - reference.haloTight).toBeLessThan(0.03);
    expect(peak.haloFar - reference.haloFar).toBeLessThan(0.02);
    expect(peak.haloNear - reference.haloNear).toBeGreaterThan(
      peak.haloFar - reference.haloFar,
    );
  });

  it("keeps HALO faces off and FATA rear halo off", () => {
    const halo = resolveSignLighting(75, "halo", true);
    const face = resolveSignLighting(75, "face", true);

    expect(halo.faceFill).toBe(0);
    expect(halo.coreFill).toBe(0);
    expect(face.haloTight).toBe(0);
    expect(face.haloNear).toBe(0);
  });

  it("removes all light emission when power is off", () => {
    const off = resolveSignLighting(100, "combined", false);
    expect(off.faceFill).toBe(0);
    expect(off.coreFill).toBe(0);
    expect(off.haloTight).toBe(0);
    expect(off.haloNear).toBe(0);
    expect(off.haloMid).toBe(0);
    expect(off.haloFar).toBe(0);
    expect(off.cableLive).toBe(0);
  });
});
