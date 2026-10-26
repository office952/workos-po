/** One active filter as the operator chose it: "Tip: Factură", removable on its own. */
export type ResultChip = { key: string; label: string; value: string; onRemove: () => void };

/** The chip of one filter dimension when it is set, named by the option the operator chose. */
export function filterChip(key: string, label: string, options: ReadonlyArray<{ value: string; label: string }>, value: string, onRemove: () => void, missing = "indisponibil"): ResultChip | null {
  if (!value) return null;
  return { key, label, value: options.find((option) => option.value === value)?.label ?? missing, onRemove };
}

/** "1 document" / "Toate cele 9 documente": the whole list said plainly. */
export function wholeList(total: number, unit: readonly [string, string]): string {
  if (total === 1) return `1 ${unit[0]}`;
  return `Toate cele ${total} ${unit[1]}`;
}
