/**
 * Maps residual English owner wording in operator-facing explanatory copy.
 * Does not rename transport fields, enums, or Product Truth identifiers.
 */
export function presentOperatorFacingCopy(value: string): string {
  return value
    .replace(/\bownerul\b/gi, (match) =>
      match[0] === match[0]?.toUpperCase() ? "Proprietarul" : "proprietarul",
    )
    .replace(/\bowner\b/gi, (match) =>
      match[0] === match[0]?.toUpperCase() ? "Proprietar" : "proprietar",
    );
}

export function presentOperatorFacingCopyOrNull(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  return presentOperatorFacingCopy(value);
}
