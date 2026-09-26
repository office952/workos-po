import type { ExecutionTaskTransport } from "../api/types";
import { readTransportErrorCode, TransportError } from "../api/http";

export function hasViewerExecutionAction(task: ExecutionTaskTransport): boolean {
  return task.canComplete || task.canClaimStart || task.canAssignProvider;
}

export function presentExecutionNextAction(
  task: ExecutionTaskTransport,
  identified: boolean | null,
): string {
  if (task.waitingFor.length > 0) {
    return `Așteaptă: ${task.waitingFor.join(", ")}`;
  }
  const providerAction = presentUnassignedProviderAction(task);
  if (providerAction) {
    return providerAction;
  }
  if (task.canAssignProvider) {
    return "Alocare utilaj / zonă necesară";
  }
  if (task.materialBlockLabel) {
    return task.materialBlockLabel;
  }
  if (task.canComplete) {
    return "Poate fi închisă";
  }
  if (task.canClaimStart) {
    return identified === false ? "Identifică operatorul" : "Poate fi pornită";
  }
  return presentOperatorRelation(task);
}

function presentUnassignedProviderAction(task: ExecutionTaskTransport): string | null {
  if (
    !task.requiresProvider ||
    task.assignmentLabel !== "Nealocat" ||
    task.status === "COMPLETED"
  ) {
    return null;
  }
  if (task.eligibleProviders.length === 0) {
    return "Lipsește utilajul / zona necesară";
  }
  if (task.canAssignProvider) {
    return "Alocare utilaj / zonă necesară";
  }
  return "Așteaptă alocarea utilajului / zonei";
}

function presentOperatorRelation(task: ExecutionTaskTransport): string {
  switch (task.operatorRelation) {
    case "identify_required":
      return "Identifică operatorul";
    case "can_claim":
      return "Poate fi pornită";
    case "not_eligible":
      return "Necesită operator calificat";
    case "unavailable":
      return "Operator indisponibil";
    case "missing_provider":
      return task.eligibleProviders.length > 0
        ? "Așteaptă alocarea utilajului / zonei"
        : "Lipsește utilajul / zona necesară";
    case "waiting_dependencies":
      return "Așteaptă dependențe";
    case "reserved_other":
      return "Rezervată altui operator";
    case "owned":
      return "În lucru de tine";
    case "owned_by_other":
      return "În lucru la alt operator";
    case "blocked_material":
      return task.materialBlockLabel ?? "Materialul nu este confirmat disponibil.";
    case "idle":
    case null:
      return task.statusLabel;
    default:
      return task.statusLabel;
  }
}

export function presentExecutionStartError(error: unknown): string {
  if (!(error instanceof TransportError)) {
    return "Pornirea a eșuat.";
  }
  const code = readTransportErrorCode(error.body);
  if (code === "material_not_ready") {
    return "Materialul nu este confirmat disponibil. Sarcina nu poate porni.";
  }
  return "Sarcina nu poate fi începută. Verifică identificarea și eligibilitatea.";
}

export function presentCurrentTaskRole(
  task: ExecutionTaskTransport,
  actionable: ExecutionTaskTransport | null,
): string {
  if (actionable && actionable.taskId === task.taskId && hasViewerExecutionAction(task)) {
    return "Următoarea sarcină acționabilă";
  }
  return "Sarcina selectată din plan";
}
