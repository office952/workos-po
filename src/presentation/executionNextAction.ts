import type { ExecutionTaskTransport } from "../api/types";

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
  if (
    task.requiresProvider &&
    task.assignmentLabel === "Nealocat" &&
    task.eligibleProviders.length === 0 &&
    task.status !== "COMPLETED"
  ) {
    return "Utilaj lipsește";
  }
  if (task.canAssignProvider) {
    return "Alocare utilaj necesară";
  }
  if (task.canComplete) {
    return "Poate fi închisă";
  }
  if (task.canClaimStart) {
    return identified === false ? "Identifică operatorul" : "Poate fi pornită";
  }
  return presentOperatorRelation(task);
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
      return "Utilaj lipsește";
    case "waiting_dependencies":
      return "Așteaptă dependențe";
    case "reserved_other":
      return "Rezervată altui operator";
    case "owned":
      return "În lucru de tine";
    case "owned_by_other":
      return "În lucru la alt operator";
    case "idle":
    case null:
      return task.statusLabel;
    default:
      return task.statusLabel;
  }
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
