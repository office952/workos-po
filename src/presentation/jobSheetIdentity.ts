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

export function presentJobSheetLead(job: JobListItemTransport): string {
  switch (job.nextAction) {
    case "RELEASE_TO_PRODUCTION":
      return "Comanda există, fără plan de execuție. Eliberează producția ca lucrarea să poată intra în atelier.";
    case "CREATE_EXECUTION_PLAN":
      return "Producția este eliberată. Următorul pas este planul de execuție.";
    case "OPEN_EXECUTION":
      return job.nextActionLabel
        ? `Planul există. ${job.nextActionLabel}.`
        : "Planul există. Deschide execuția.";
    case "CONTINUE_EXECUTION":
      return job.nextActionLabel
        ? `Execuția este deschisă. ${job.nextActionLabel}.`
        : "Execuția este deschisă. Continuă lucrul pe sarcinile rămase.";
    default:
      break;
  }
  if (job.stage === "EXECUTION_COMPLETED") {
    return "Lucrarea este executată. Compară planificat cu realizat.";
  }
  if (job.nextActionLabel) {
    return `${job.stageLabel}. ${job.nextActionLabel}.`;
  }
  return job.stageLabel;
}
