import { describe, expect, it } from "vitest";
import { resolveSignLighting, SIGN_RGB_PRESETS } from "./SignLightDemo";

describe("SignLightDemo lighting curves", () => {
  it("keeps all emission off at zero energy", () => {
    expect(resolveSignLighting(0, "combined", true)).toMatchObject({
      faceFill: 0,
      faceGlowTight: 0,
      faceGlowNear: 0,
      coreFill: 0,
      coreGlow: 0,
      haloTight: 0,
      haloNear: 0,
      haloMid: 0,
      haloFar: 0,
    });
  });

  it("keeps the 75 percent halo contour strong without saturating the curve early", () => {
    const reference = resolveSignLighting(75, "halo", true);

    expect(reference.haloTight).toBeCloseTo(0.82, 6);
    expect(reference.haloNear).toBeCloseTo(0.62, 6);
    expect(reference.haloMid).toBeCloseTo(0.28, 6);
    expect(reference.haloFar).toBeCloseTo(0.065, 6);
  });

  it("makes 100 visibly more energetic than 85, and 85 more energetic than 72", () => {
    const at72 = resolveSignLighting(72, "combined", true);
    const at85 = resolveSignLighting(85, "combined", true);
    const at100 = resolveSignLighting(100, "combined", true);

    for (const key of ["faceGlowTight", "faceGlowNear", "coreGlow", "haloTight", "haloNear", "haloMid", "haloFar"] as const) {
      expect(at85[key]).toBeGreaterThan(at72[key]);
      expect(at100[key]).toBeGreaterThan(at85[key]);
    }

    expect(at100.haloTight).toBeCloseTo(0.98, 6);
    expect(at100.haloNear).toBeCloseTo(0.86, 6);
    expect(at100.haloMid).toBeCloseTo(0.48, 6);
    expect(at100.haloFar).toBeCloseTo(0.14, 6);
  });

  it("preserves the accepted 75 percent face/core reference while leaving peak headroom in glow", () => {
    const face = resolveSignLighting(75, "face", true);
    const peak = resolveSignLighting(100, "face", true);

    expect(face.faceFill).toBe(1);
    expect(face.faceGlowTight).toBeCloseTo(0.3750684559, 6);
    expect(face.faceGlowNear).toBeCloseTo(0.1295126379, 6);
    expect(face.coreFill).toBeCloseTo(0.3751134872, 6);
    expect(face.coreGlow).toBeCloseTo(0.2044193596, 6);
    expect(peak.faceGlowTight).toBeGreaterThan(face.faceGlowTight);
    expect(peak.faceGlowNear).toBeGreaterThan(face.faceGlowNear);
    expect(peak.coreGlow).toBeGreaterThan(face.coreGlow);
  });

  it("keeps HALO faces off and FATA rear halo off", () => {
    const halo = resolveSignLighting(75, "halo", true);
    const face = resolveSignLighting(75, "face", true);

    expect(halo.faceFill).toBe(0);
    expect(halo.faceGlowTight).toBe(0);
    expect(halo.coreFill).toBe(0);
    expect(face.haloTight).toBe(0);
    expect(face.haloNear).toBe(0);
    expect(face.haloMid).toBe(0);
    expect(face.haloFar).toBe(0);
  });

  it("removes all optical emission when power is off", () => {
    const off = resolveSignLighting(100, "combined", false);
    expect(off.faceFill).toBe(0);
    expect(off.faceGlowTight).toBe(0);
    expect(off.faceGlowNear).toBe(0);
    expect(off.coreFill).toBe(0);
    expect(off.coreGlow).toBe(0);
    expect(off.haloTight).toBe(0);
    expect(off.haloNear).toBe(0);
    expect(off.haloMid).toBe(0);
    expect(off.haloFar).toBe(0);
    expect(off.cableLive).toBe(0);
  });

  it("clamps intensity outside the 0 to 100 range", () => {
    expect(resolveSignLighting(-20, "halo", true).haloTight).toBe(0);
    expect(resolveSignLighting(140, "halo", true).haloTight).toBeCloseTo(0.98, 6);
  });

  it("exposes eight distinct RGB lighting presets", () => {
    expect(SIGN_RGB_PRESETS.map((preset) => preset.id)).toEqual([
      "red",
      "orange",
      "yellow",
      "green",
      "cyan",
      "blue",
      "violet",
      "magenta",
    ]);
    const unique = new Set(SIGN_RGB_PRESETS.map((preset) => preset.rgb));
    expect(unique.size).toBe(8);
  });
});
