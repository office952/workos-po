/**
 * Constructive BACK compatibility. A support may recommend a profile.
 * It does not require FLAT on a panel or GROOVED on a metal frame.
 */
export const BACK_SUPPORT_KINDS = ["METAL_FRAME", "PANEL"] as const;
export type BackSupportKind = (typeof BACK_SUPPORT_KINDS)[number];

export const BACK_PROFILES = ["GROOVED", "FLAT"] as const;
export type BackProfile = (typeof BACK_PROFILES)[number];

export type BackCompatibilityResult =
  | { status: "COMPATIBLE"; support: BackSupportKind | null; profile: BackProfile }
  | { status: "UNSUPPORTED_INPUT"; reason: "unknown_support_or_profile" };

function isBackSupportKind(value: unknown): value is BackSupportKind {
  return value === "METAL_FRAME" || value === "PANEL";
}

function isBackProfile(value: unknown): value is BackProfile {
  return value === "GROOVED" || value === "FLAT";
}

/** Workshop recommendation only. Never a manufacturing or schema constraint. */
export function recommendBackProfile(support: unknown): BackProfile | null {
  if (support === "METAL_FRAME") {
    return "GROOVED";
  }
  if (support === "PANEL") {
    return "FLAT";
  }
  return null;
}

export function evaluateBackCompatibility(
  support: unknown,
  profile: unknown,
): BackCompatibilityResult {
  if (!isBackProfile(profile)) {
    return { status: "UNSUPPORTED_INPUT", reason: "unknown_support_or_profile" };
  }
  if (support !== undefined && support !== null && !isBackSupportKind(support)) {
    return { status: "UNSUPPORTED_INPUT", reason: "unknown_support_or_profile" };
  }
  return {
    status: "COMPATIBLE",
    support: isBackSupportKind(support) ? support : null,
    profile,
  };
}
