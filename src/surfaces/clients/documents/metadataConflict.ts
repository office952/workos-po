import type { DossierDocument } from "../../../adapters/customerDossierAdapter";

/**
 * N-020 etapa 5 · a metadata conflict (756:460 → 756:840 → 773:185). The server refuses a save made
 * on an older revision (409 `stale_revision`) and says nothing more: the current version is read
 * again from the dossier. Nothing is merged or saved automatically — the reader compares, then
 * resumes on the current version (their changes kept, the rest taken from it) or takes it as is.
 * A second conflict repeats the same steps from the newest version; the draft is never lost.
 */

export const METADATA_FIELDS = ["title", "kind", "photoStage", "documentNumber", "documentDate", "description"] as const;
export type MetadataField = (typeof METADATA_FIELDS)[number];
export type MetadataValues = Record<MetadataField, string>;

export const FIELD_LABELS: Record<MetadataField, string> = {
  title: "Titlu",
  kind: "Tip",
  photoStage: "Etapă",
  documentNumber: "Număr",
  documentDate: "Data documentului",
  description: "Descriere",
};

export function valuesOf(document: DossierDocument): MetadataValues {
  return {
    title: document.title,
    kind: document.kind,
    photoStage: document.photoStage ?? "",
    documentNumber: document.documentNumber ?? "",
    documentDate: document.documentDate ?? "",
    description: document.description ?? "",
  };
}

export type ConflictRow = { field: MetadataField; mine: string; current: string; both: boolean };

/**
 * The fields where the draft and the current version differ. `both`: the reader changed it and so
 * did someone else since the reader's base — the reader's text is kept on resume, to be checked.
 */
export function conflictRows(base: MetadataValues, draft: MetadataValues, current: MetadataValues): ConflictRow[] {
  return METADATA_FIELDS.filter((field) => draft[field] !== current[field] && (draft[field] !== base[field] || current[field] !== base[field])).map((field) => ({
    field,
    mine: draft[field],
    current: current[field],
    both: draft[field] !== base[field] && current[field] !== base[field],
  }));
}

/** Resume on the current version: what the reader changed stays, every other field is the current one. */
export function resumeOnCurrent(base: MetadataValues, draft: MetadataValues, current: MetadataValues): { values: MetadataValues; flagged: MetadataField[] } {
  const values = { ...current };
  const flagged: MetadataField[] = [];
  for (const field of METADATA_FIELDS) {
    if (draft[field] !== base[field]) {
      values[field] = draft[field];
      if (current[field] !== base[field] && current[field] !== draft[field]) flagged.push(field);
    }
  }
  return { values, flagged };
}

/** The PATCH body of a save: every field, with the revision the draft is based on. */
export function patchOf(values: MetadataValues, revision: number): Record<string, unknown> {
  return {
    title: values.title,
    kind: values.kind,
    photoStage: values.kind === "PHOTO" ? values.photoStage || null : null,
    documentNumber: values.documentNumber || null,
    documentDate: values.documentDate || null,
    description: values.description || null,
    expectedRevision: revision,
  };
}
