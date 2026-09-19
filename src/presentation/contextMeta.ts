export function presentContextMeta(
  parts: Array<string | null | undefined>,
): string | undefined {
  const visible = parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0);
  return visible.length > 0 ? visible.join(" · ") : undefined;
}
