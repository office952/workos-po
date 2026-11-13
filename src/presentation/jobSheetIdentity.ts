import type { JobListItemTransport } from "../api/types";

export function presentJobSheetTitle(job: JobListItemTransport): string {
  if (job.kind === "ASSEMBLY") {
    return job.productLabel || job.inscription || "Lucrare";
  }
  return job.inscription || job.productLabel || "Lucrare";
}

export function presentJobSheetSecondary(job: JobListItemTransport): string | null {
  const title = presentJobSheetTitle(job);
  const inscription = job.inscription.trim();
  const product = job.productLabel.trim();
  if (job.kind === "ASSEMBLY") {
    return inscription && inscription !== title ? inscription : null;
  }
  return product && product !== title ? product : null;
}

export function jobSheetFinished(job: JobListItemTransport): boolean {
  return job.stage === "EXECUTION_COMPLETED";
}

/** Stage shown on the job sheet header and wherever the job is summarized. */
export function presentJobSheetStage(job: JobListItemTransport): string {
  return jobSheetFinished(job) ? "Producție finalizată" : job.stageLabel;
}

export const JOB_PRODUCTION_COMPLETED_LEAD =
  "Producția este finalizată. Compară planificat cu realizat. Livrarea și montajul nu sunt confirmate de această stare.";

export function presentJobSheetLead(job: JobListItemTransport): string {
  if (job.stage === "EXECUTION_COMPLETED") {
    return JOB_PRODUCTION_COMPLETED_LEAD;
  }
  switch (job.nextAction) {
    case "RELEASE_TO_PRODUCTION":
      return "Comanda este confirmată. Trimite în producție pentru a pregăti operațiile și a face lucrarea disponibilă în Atelier.";
    case "CREATE_EXECUTION_PLAN":
      return "Pregătirea producției este incompletă. Trimite în producție pentru a continua cu operațiile aceleiași lucrări.";
    case "OPEN_EXECUTION":
      return "Lucrarea este disponibilă în Atelier. Lucrul începe când un operator eligibil pornește o operație.";
    case "CONTINUE_EXECUTION":
      return job.nextActionLabel
        ? `Lucrul a început. ${job.nextActionLabel}.`
        : "Lucrul a început. Continuă operațiile rămase în Atelier.";
    default:
      break;
  }
  if (job.nextActionLabel) {
    return `${job.stageLabel}. ${job.nextActionLabel}.`;
  }
  return job.stageLabel;
}

/** Who may send an unreleased job onward. The check is the existing owner gate, not a new permission. */
export function presentReleaseHold(input: {
  canRelease: boolean;
  sessionKnown: boolean;
  finished: boolean;
  planId: string | null;
}): string | null {
  if (!input.sessionKnown || input.canRelease || input.finished || input.planId) {
    return null;
  }
  return "Trimiterea în producție o face proprietarul organizației. Poți consulta fișa; lucrarea ajunge în Atelier după această pregătire.";
}
