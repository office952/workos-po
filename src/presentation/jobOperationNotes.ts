import type { ExecutionTaskTransport } from "../api/types";

export function presentJobStartBlockReason(reason: string | null): string | null {
  switch (reason) {
    case null: return null;
    case "executor_unavailable": return "Executantul alocat nu mai este disponibil.";
    case "unavailable_person": return "Executantul alocat este temporar indisponibil.";
    case "ineligible_executor": return "Executantul alocat nu este eligibil pentru operație.";
    default: return "Pornirea necesită verificare.";
  }
}

function providerAttention(task: ExecutionTaskTransport): string | null {
  if (task.status === "COMPLETED") return null;
  switch (task.providerBindingState) {
    case "NONE": return task.status === "PLANNED" ? "Nicio resursă eligibilă configurată." : "Resursa necesară nu este alocată.";
    case "CHOICE_REQUIRED": return "Resursa necesită o alegere dintre variantele eligibile.";
    case "UNAVAILABLE": return task.providerBindingLabel ?? "Resursa alocată nu mai este disponibilă.";
    default: return null;
  }
}

export function jobTaskAttentionNotes(task: ExecutionTaskTransport): string[] {
  return [...new Set([
    presentJobStartBlockReason(task.startBlockReason),
    providerAttention(task),
    task.materialBlockLabel,
    task.externalBlockLabel,
    task.qualityBlockLabel,
  ].filter((line): line is string => Boolean(line)))];
}

export function jobTaskNotes(task: ExecutionTaskTransport): string[] {
  return [...new Set([
    ...(task.waitingFor.length ? [`Așteaptă: ${task.waitingFor.join(" · ")}`] : []),
    ...jobTaskAttentionNotes(task),
  ])];
}

export function presentJobProvider(task: ExecutionTaskTransport): string {
  return task.providerBindingState === "NOT_REQUIRED" ? "Nu este necesar" : task.externalProviderLabel ?? task.assignmentLabel;
}

export function presentRecordedExecutor(task: ExecutionTaskTransport): string {
  return task.executorLabel ?? task.startedByLabel ?? "Neînregistrat";
}
