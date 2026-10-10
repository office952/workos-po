/**
 * Constructive BACK compatibility contract, independent from sales/installation
 * services. Pure domain rule consumed by manufacturing planning and compiler gates.
 */
export const BACK_SUPPORT_KINDS = ["METAL_FRAME", "PANEL"] as const;
export type BackSupportKind = (typeof BACK_SUPPORT_KINDS)[number];

export const BACK_PROFILES = ["GROOVED", "FLAT"] as const;
export type BackProfile = (typeof BACK_PROFILES)[number];

export type BackCompatibilityResult =
  | { status: "COMPATIBLE"; support: BackSupportKind; profile: BackProfile }
  | { status: "INCOMPATIBLE"; reason: "frame_requires_grooved" | "panel_requires_flat" }
  | { status: "UNSUPPORTED_INPUT"; reason: "unknown_support_or_profile" };

function isBackSupportKind(value: unknown): value is BackSupportKind {
  return value === "METAL_FRAME" || value === "PANEL";
}

function isBackProfile(value: unknown): value is BackProfile {
  return value === "GROOVED" || value === "FLAT";
}

export function evaluateBackCompatibility(
  support: unknown,
  profile: unknown,
): BackCompatibilityResult {
  if (!isBackSupportKind(support) || !isBackProfile(profile)) {
    return { status: "UNSUPPORTED_INPUT", reason: "unknown_support_or_profile" };
  }
  if (support === "METAL_FRAME" && profile !== "GROOVED") {
    return { status: "INCOMPATIBLE", reason: "frame_requires_grooved" };
  }
  if (support === "PANEL" && profile !== "FLAT") {
    return { status: "INCOMPATIBLE", reason: "panel_requires_flat" };
  }
  return { status: "COMPATIBLE", support, profile };
}
