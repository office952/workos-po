import type { CustomerDossierModel, DossierDocument, RepresentativeChoice, WorkRepresentative } from "../../../adapters/customerDossierAdapter";
import { linkTargetsOf } from "../documents/linkTargets";

/**
 * N-021 · Fotografia reprezentativă a lucrării, as presentation over the server's dossier. A photo
 * can represent only a work it is linked to explicitly (a job or a historical work); a photo of a
 * request or a site is not a work's own. The server decides eligibility and checks the revision;
 * this file only names the works and their current choice for the menu and the dialog.
 */

export type RepresentativeTarget = {
  workKind: "JOB" | "HISTORICAL_WORK";
  workId: string;
  key: string;
  /** "Lucrare" / "Lucrare istorică". */
  kindWord: string;
  label: string;
  /** What tells two similar works apart: references, then the site or year, from the dossier. */
  detail: string | null;
  choice: RepresentativeChoice;
  /** This photo is the work's valid choice now. */
  isThisPhoto: boolean;
};

const AUTOMATIC: RepresentativeChoice = { revision: 0, status: "AUTOMATIC", documentId: null, invalidatedReason: null };

export function representativeKey(workKind: string, workId: string): string {
  return `${workKind}:${workId}`;
}

export function choiceOf(dossier: Pick<CustomerDossierModel, "representativePhotos">, workKind: string, workId: string): WorkRepresentative | null {
  return dossier.representativePhotos.find((item) => item.workKind === workKind && item.workId === workId) ?? null;
}

/** The works this photo is linked to, in the order of its links, each with its current choice. */
export function representativeTargets(photo: DossierDocument, dossier: CustomerDossierModel): RepresentativeTarget[] {
  if (photo.kind !== "PHOTO") return [];
  const targets = linkTargetsOf(dossier);
  return photo.links.flatMap((link): RepresentativeTarget[] => {
    if (link.kind !== "JOB" && link.kind !== "HISTORICAL_WORK") return [];
    const target = targets.find((item) => item.kind === link.kind && item.subjectId === link.subjectId);
    const stored = choiceOf(dossier, link.kind, link.subjectId);
    const choice = stored ?? AUTOMATIC;
    return [
      {
        workKind: link.kind,
        workId: link.subjectId,
        key: representativeKey(link.kind, link.subjectId),
        kindWord: link.kind === "JOB" ? "Lucrare" : "Lucrare istorică",
        label: target?.label ?? link.label,
        detail: [stored?.reference, target?.detail].filter(Boolean).join(" · ") || null,
        choice,
        isThisPhoto: choice.status === "MANUAL" && choice.documentId === photo.documentId,
      },
    ];
  });
}

/** The works this photo represents now (a valid manual choice), for the discreet mark on the tile. */
export function representedWorks(photo: DossierDocument, dossier: CustomerDossierModel): RepresentativeTarget[] {
  return representativeTargets(photo, dossier).filter((target) => target.isThisPhoto);
}

/** The current choice of a work, in words, as the dialog shows it next to the work. */
export function choiceLine(target: RepresentativeTarget): string {
  if (target.isThisPhoto) return "Această fotografie este reprezentativă acum";
  switch (target.choice.status) {
    case "MANUAL":
      return "Altă fotografie este aleasă acum";
    case "INVALIDATED":
      return invalidationText(target.choice.invalidatedReason);
    case "UNAVAILABLE":
      return "Fotografia aleasă nu mai este disponibilă · se folosește alegerea automată";
    default:
      return "Alegere automată (după montaj, altfel simulare, altfel înainte)";
  }
}

/** Why a choice was set aside: said once, next to the automatic image that replaced it. */
export function invalidationText(reason: RepresentativeChoice["invalidatedReason"]): string {
  return reason === "NOT_A_PHOTO"
    ? "Fotografia aleasă nu mai este o fotografie · se folosește alegerea automată"
    : "Fotografia aleasă a fost dezlegată de lucrare · se folosește alegerea automată";
}
