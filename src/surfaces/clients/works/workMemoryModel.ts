import type { JobRecord, JobRecordFile, WorkHoursTask } from "../../../api/jobRecord";
import { fileVersions } from "../../jobRecord/fileVersions";

/**
 * R-005 · presentation of an already recorded job. Nothing here decides price, eligibility,
 * a missing fact, or a new event. A null plan is missing; an empty recorded list is zero.
 */

export type PlanPresence = "missing" | "empty" | "recorded";

export function planPresence(hours: JobRecord["hours"] | undefined): PlanPresence {
  if (!hours) return "missing";
  return hours.tasks.length === 0 ? "empty" : "recorded";
}

export function planSentence(presence: PlanPresence): string | null {
  if (presence === "missing") return "Plan de execuție neînregistrat";
  if (presence === "empty") return "Plan fără operații înregistrate";
  return null;
}

export function hoursSentence(hours: JobRecord["hours"] | undefined): string {
  if (!hours) return "Ore neînregistrate";
  return `${hours.coverageLabel} · ${hours.totalLabel}`;
}

/** Same fold as registry search: case and diacritics do not hide a recorded word. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("ro");
}

export function memoryWords(query: string): string[] {
  const folded = fold(query);
  if (!folded) return [];
  return [...new Set(folded.split(" ").filter(Boolean))].slice(0, 8);
}

export function memoryMatches(query: string, fields: readonly (string | null | undefined)[]): boolean {
  const words = memoryWords(query);
  if (!words.length) return true;
  const haystack = fold(fields.filter((field): field is string => Boolean(field)).join("\n"));
  return words.every((word) => haystack.includes(word));
}

export function taskFields(task: WorkHoursTask): string[] {
  return [
    task.seqLabel,
    task.processLabel,
    task.scopeLabel,
    task.statusLabel,
    task.timeLabel,
    task.coverageLabel,
    task.qualityLabel,
    task.completedQuantityLabel,
    task.varianceLabel,
    task.providerLabel,
    task.externalProviderLabel,
    task.declaredDurationLabel,
    task.machineTimeLabel,
    ...task.people.map((person) => person.label),
    ...task.actualConsumption.map((row) => `${row.resourceLabel} ${row.actualQuantity} ${row.unit}`),
    ...(task.plannedConsumption ?? []).map((row) => `${row.resourceLabel} ${row.quantity} ${row.unit}`),
  ].filter((field): field is string => Boolean(field));
}

export function quantityLine(label: string, quantity: number, unit: string): string {
  return `${label}: ${quantity} ${unit}`;
}

type VersionFile = Pick<JobRecordFile, "artifactId" | "originalFileName" | "supersedesArtifactId">;

/**
 * Revision context follows the server's supersedes links. A number appears only when that
 * chain is present in the record. Association is not recorded use.
 */
export function fileRevisionSentence(file: VersionFile, files: readonly VersionFile[]): string {
  if (file.supersedesArtifactId && !files.some((item) => item.artifactId === file.supersedesArtifactId)) {
    return "Revizie înregistrată · versiunea anterioară nu este în acest dosar";
  }
  const chain = fileVersions(files, file.artifactId);
  const index = chain.findIndex((item) => item.artifactId === file.artifactId);
  if (!file.supersedesArtifactId || chain.length < 2 || index < 1) return "Fișier inițial";
  return `Revizie ${index + 1} din ${chain.length} · versiunea anterioară rămâne păstrată`;
}

export function usageSentence(usedAt: string | null): string {
  return usedAt ? "Utilizare înregistrată" : "Asociat · utilizare neconfirmată";
}
