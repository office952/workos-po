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

    expect(reference.haloTight).toBeCloseTo(0.9831462502, 6);
    expect(reference.haloNear).toBeCloseTo(0.7525049448, 6);
    expect(reference.haloMid).toBeCloseTo(0.294754923, 6);
    expect(reference.haloFar).toBeCloseTo(0.0698283836, 6);
    expect(peak.haloTight - reference.haloTight).toBeLessThan(0.03);
    expect(peak.haloFar - reference.haloFar).toBeLessThan(0.02);
    expect(peak.haloNear - reference.haloNear).toBeGreaterThan(
      peak.haloFar - reference.haloFar,
    );
  });

  it("matches the Lighting Lab 2 warm 75 face/core benchmark", () => {
    const face = resolveSignLighting(75, "face", true);

    expect(face.faceFill).toBe(1);
    expect(face.faceGlowTight).toBeCloseTo(0.3750684559, 6);
    expect(face.faceGlowNear).toBeCloseTo(0.1295126379, 6);
    expect(face.coreFill).toBeCloseTo(0.3751134872, 6);
    expect(face.coreGlow).toBeCloseTo(0.2044193596, 6);
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
