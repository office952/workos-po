import type { CatalogPresetSelection } from "../../api/catalogCapabilities";

export function applyPresetSelections(
  drafts: Record<string, string>,
  selections: readonly CatalogPresetSelection[],
): Record<string, string> {
  const next = { ...drafts };
  for (const selection of selections) {
    next[selection.fieldId] = selection.value;
  }
  return next;
}
