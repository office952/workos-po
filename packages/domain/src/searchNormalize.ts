/**
 * Deterministic operator search normalization for registry findability.
 * Projection-only — does not own business truth.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ro");
}

export function searchTextIncludes(
  haystack: string | null | undefined,
  needleNormalized: string,
): boolean {
  if (!needleNormalized) {
    return true;
  }
  if (!haystack) {
    return false;
  }
  return normalizeSearchText(haystack).includes(needleNormalized);
}

export function matchesSearchFields(
  fields: readonly (string | null | undefined)[],
  query: string,
): boolean {
  const needle = normalizeSearchText(query);
  if (!needle) {
    return true;
  }
  return fields.some((field) => searchTextIncludes(field, needle));
}
