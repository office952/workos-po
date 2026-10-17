import type { JobMaterialPreparationTransport } from "../api/jobMaterials";
import type { ResourceStatus } from "../data/resourceCache";

export function presentMaterialPreparationSummary(snapshot: {
  status: ResourceStatus;
  data: JobMaterialPreparationTransport | undefined;
}): string[] {
  if (!snapshot.data && (snapshot.status === "idle" || snapshot.status === "loading")) {
    return ["Se citește necesarul de materiale. Disponibilitatea nu este încă cunoscută."];
  }
  if (!snapshot.data) {
    return ["Necesarul de materiale nu a putut fi citit. Nu se declară că totul este disponibil."];
  }
  const lines: string[] = [];
  if (snapshot.status === "error") {
    lines.push("Actualizarea necesarului a eșuat. Ultima citire rămâne afișată.");
  }
  if (snapshot.data.planId === null) {
    lines.push("Necesarul de execuție va apărea după crearea planului.");
    return lines;
  }
  for (const line of snapshot.data.lines) {
    if (line.latestCheck?.status === "MISSING") {
      lines.push(`${line.label}: material insuficient. Nu este un blocaj nou de pornire.`);
    }
    if (line.openRequest?.requiresReview) {
      lines.push(`${line.label}: solicitare de aprovizionare de revizuit.`);
    } else if (line.openRequest) {
      lines.push(`${line.label}: solicitare de aprovizionare deschisă.`);
    }
  }
  return lines;
}
