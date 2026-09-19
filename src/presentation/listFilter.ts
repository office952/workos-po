export function matchesSearch(
  query: string,
  parts: ReadonlyArray<string | null | undefined>,
): boolean {
  const needle = query.trim().toLocaleLowerCase("ro");
  if (needle === "") {
    return true;
  }
  return parts.some((part) => (part ?? "").toLocaleLowerCase("ro").includes(needle));
}

export function uniqueLabels(labels: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of labels) {
    const value = label?.trim();
    if (!value || value === "—" || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}
