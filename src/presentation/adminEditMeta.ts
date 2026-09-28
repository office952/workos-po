/**
 * Admin write meta waits until the page model is settled.
 * Avoids a transient "wrong role" flash while session/data are still loading.
 * Does not weaken authorization once settled.
 */
export function presentAdminEditMeta(input: {
  settled: boolean;
  canEdit: boolean;
  whenEditable: string;
  whenReadOnly: string;
}): string | undefined {
  if (!input.settled) {
    return undefined;
  }
  return input.canEdit ? input.whenEditable : input.whenReadOnly;
}
