import { describe, expect, it } from "vitest";
import { conflictRows, patchOf, resumeOnCurrent, type MetadataValues } from "./metadataConflict";

const base: MetadataValues = { title: "Factură autocolant vitrine", kind: "INVOICE", photoStage: "", documentNumber: "F-ALC-2025-1187", documentDate: "2025-11-20", description: "Factură autocolant vitrine showroom." };

describe("metadata conflict (756:460 → 756:840 → 773:185)", () => {
  // The reader changed the title and the description; someone else changed the description and the number.
  const draft = { ...base, title: "Factură autocolant vitrine — campania de iarnă", description: "Factura pentru autocolantul de pe vitrine, noiembrie 2025." };
  const current = { ...base, documentNumber: "F-ALC-2025-1188", description: "Factură autocolant vitrine showroom (corectată)." };

  it("lists only the fields that differ, and flags those both sides changed", () => {
    expect(conflictRows(base, draft, current)).toEqual([
      { field: "title", mine: draft.title, current: base.title, both: false },
      { field: "documentNumber", mine: base.documentNumber, current: current.documentNumber, both: false },
      { field: "description", mine: draft.description, current: current.description, both: true },
    ]);
  });

  it("resumes on the current version: the reader's changes kept, the rest taken from it, nothing saved", () => {
    const resumed = resumeOnCurrent(base, draft, current);
    expect(resumed.values).toEqual({ ...current, title: draft.title, description: draft.description });
    expect(resumed.flagged).toEqual(["description"]);
  });

  it("repeats from the newest version on a second conflict, without losing the draft", () => {
    const first = resumeOnCurrent(base, draft, current);
    const newer = { ...current, title: "Factură vitrine (a treia versiune)" };
    // The base is now the version the reader resumed on; the draft is what they had in the form.
    const second = resumeOnCurrent(current, first.values, newer);
    expect(second.values.title).toBe(draft.title);
    expect(second.values.description).toBe(draft.description);
    expect(second.flagged).toEqual(["title"]);
  });

  it("saves every field with the revision the draft is based on", () => {
    expect(patchOf(draft, 3)).toEqual({ title: draft.title, kind: "INVOICE", photoStage: null, documentNumber: "F-ALC-2025-1187", documentDate: "2025-11-20", description: draft.description, expectedRevision: 3 });
  });
});
