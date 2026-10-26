/**
 * N-020 · a version conflict on a form of the client page (Sedii, Date comerciale). The server
 * refuses a save made on an older revision (409 `stale_revision`) and sends its current version.
 * Nothing is merged or saved by itself: the reader compares the version they started from, their
 * draft and the current version, then resumes on the current version (their own changes kept,
 * every other field taken from it) or takes it as it is. A second conflict repeats the same steps
 * from the newest version; the draft is never lost.
 */
export type DraftConflictRow<F extends string> = {
  field: F;
  before: string;
  mine: string;
  current: string;
  mineChanged: boolean;
  currentChanged: boolean;
};

/** Only the fields where the draft and the current version differ, and someone changed them. */
export function draftConflictRows<F extends string>(fields: readonly F[], base: Record<F, string>, draft: Record<F, string>, current: Record<F, string>): Array<DraftConflictRow<F>> {
  return fields
    .filter((field) => draft[field] !== current[field] && (draft[field] !== base[field] || current[field] !== base[field]))
    .map((field) => ({
      field,
      before: base[field],
      mine: draft[field],
      current: current[field],
      mineChanged: draft[field] !== base[field],
      currentChanged: current[field] !== base[field],
    }));
}

/** Resume on the current version: the reader's changes stay; every other field is the current one. */
export function resumeDraftOnCurrent<F extends string>(
  fields: readonly F[],
  base: Record<F, string>,
  draft: Record<F, string>,
  current: Record<F, string>,
): { values: Record<F, string>; kept: F[]; taken: F[] } {
  const values = { ...current };
  const kept: F[] = [];
  const taken: F[] = [];
  for (const field of fields) {
    if (draft[field] !== base[field]) {
      values[field] = draft[field];
      kept.push(field);
    } else if (current[field] !== base[field]) taken.push(field);
  }
  return { values, kept, taken };
}
