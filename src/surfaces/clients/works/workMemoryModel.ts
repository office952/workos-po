import type { JobRecord, JobRecordFile, WorkHoursTask } from "../../../api/jobRecord";
import { versionRelation, versionTag, versionTrees } from "../../jobRecord/fileVersions";
import { formatDay } from "../dossier/dossierModel";
import { countLabel } from "../dossier/historyModel";

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

export function fileFields(file: JobRecordFile): (string | null)[] {
  return [file.originalFileName, file.purposeLabel, file.note, file.authorLabel, ...file.usages.flatMap((usage) => [usage.taskLabel, usage.usedByLabel])];
}

export function eventFields(event: JobRecord["timeline"][number]): (string | null)[] {
  return [event.label, event.actorLabel, event.taskLabel, event.detail, formatDay(event.occurredAt)];
}

/**
 * The group of an operation, from the execution status the server records. A status this screen
 * does not know keeps its own server label instead of being folded into another group.
 */
export type TaskStage = "active" | "outside" | "planned" | "done" | "other";

export function taskStage(status: string): TaskStage {
  switch (status) {
    case "IN_PROGRESS":
      return "active";
    case "OUTSIDE":
      return "outside";
    case "PLANNED":
      return "planned";
    case "COMPLETED":
      return "done";
    default:
      return "other";
  }
}

const STAGE_TITLE: Record<Exclude<TaskStage, "other">, string> = {
  active: "În lucru",
  outside: "La furnizor extern",
  planned: "Urmează",
  done: "Finalizate",
};
const STAGE_ORDER: readonly Exclude<TaskStage, "other">[] = ["active", "outside", "planned", "done"];

export type OperationGroup = { key: string; stage: TaskStage; title: string; tasks: WorkHoursTask[] };

/**
 * Operations grouped by state (active first, finished last); inside a group they keep the plan
 * order, and each keeps its plan number. „Finalizate” is always present so zero is said, not hidden.
 */
export function operationGroups(tasks: readonly WorkHoursTask[]): OperationGroup[] {
  const known = STAGE_ORDER.map((stage) => ({ key: stage, stage, title: STAGE_TITLE[stage], tasks: tasks.filter((task) => taskStage(task.status) === stage) }));
  const otherLabels = [...new Set(tasks.filter((task) => taskStage(task.status) === "other").map((task) => task.statusLabel))];
  const other = otherLabels.map((label) => ({ key: `other:${label}`, stage: "other" as const, title: label, tasks: tasks.filter((task) => taskStage(task.status) === "other" && task.statusLabel === label) }));
  return [...known.filter((group) => group.tasks.length > 0 || group.stage === "done"), ...other.filter((group) => group.tasks.length > 0)];
}

export type StageCounts = Record<TaskStage, number> & { total: number };

export function stageCounts(tasks: readonly WorkHoursTask[]): StageCounts {
  const counts: StageCounts = { active: 0, outside: 0, planned: 0, done: 0, other: 0, total: tasks.length };
  for (const task of tasks) counts[taskStage(task.status)] += 1;
  return counts;
}

/** „0 finalizate · 2 în lucru · 10 planificate · din 12”: a stage outside the usual three is named only when present. */
export function stageLegend(counts: StageCounts): { stage: TaskStage | "total"; text: string }[] {
  return [
    { stage: "done" as const, text: countLabel(counts.done, "finalizată", "finalizate") },
    { stage: "active" as const, text: `${counts.active} în lucru` },
    ...(counts.outside ? [{ stage: "outside" as const, text: `${counts.outside} la furnizor extern` }] : []),
    { stage: "planned" as const, text: countLabel(counts.planned, "planificată", "planificate") },
    ...(counts.other ? [{ stage: "other" as const, text: `${counts.other} în altă stare` }] : []),
    { stage: "total" as const, text: `din ${counts.total}` },
  ];
}

function rows<T>(list: readonly T[], line: (row: T) => string): string {
  return list.map(line).join(" · ");
}

/** What the plan foresaw, then what was consumed: never zero where nothing was recorded. */
export function consumptionLine(task: WorkHoursTask, stage: TaskStage): string | null {
  const planned = task.plannedConsumption ?? [];
  const actual = task.actualConsumption;
  const plan = planned.length ? `Prevăzut: ${rows(planned, (row) => `${row.quantity} ${row.unit} · ${row.resourceLabel}`)}` : null;
  if (stage === "planned") return plan;
  const used = actual.length ? `Consum: ${rows(actual, (row) => `${row.actualQuantity} ${row.unit} · ${row.resourceLabel}`)}` : null;
  if (!plan && !used) return "Consum neînregistrat";
  return [plan, used ?? "consum neînregistrat"].filter(Boolean).join(" · ");
}

/** Who and when, as recorded: the start of an open operation, the end of a finished one. */
export function taskWhenLine(task: WorkHoursTask, stage: TaskStage): string | null {
  const people = task.people.map((person) => person.label).join(", ");
  if (stage === "planned") return null;
  if (stage === "done") return [task.completedQuantityLabel, task.varianceLabel, task.completedAt ? `finalizată ${formatDay(task.completedAt)}` : null, people].filter(Boolean).join(" · ") || null;
  const started = task.startedAt ? `Începută ${formatDay(task.startedAt)}` : "Început neînregistrat";
  return [stage === "outside" ? task.externalProviderLabel : null, started, people || null].filter(Boolean).join(" · ");
}

export type TaskFile = { name: string; tag: string | null; usedBy: string | null; used: boolean };

/** The files the record associates with one operation, each with the same version mark as the Fișiere part when the file has several. */
export function taskFiles(taskId: string, files: readonly JobRecordFile[]): TaskFile[] {
  const tags = new Map<string, string | null>();
  for (const document of fileDocuments(files)) {
    for (const version of document.versions) tags.set(version.file.artifactId, document.versions.length > 1 ? version.tag : null);
  }
  return files.flatMap((file) =>
    file.usages
      .filter((usage) => usage.taskId === taskId)
      .map((usage) => ({ name: file.originalFileName, tag: tags.get(file.artifactId) ?? null, usedBy: usage.usedByLabel, used: Boolean(usage.usedAt) })),
  );
}

/** „desen.pdf v1 · utilizare înregistrată de Radu” · „contur.dxf · asociat, utilizare neconfirmată”. */
export function taskFileLines(list: readonly TaskFile[], compact: boolean): string[] {
  if (!list.length) return [];
  if (compact) return [countLabel(list.length, "fișier asociat", "fișiere asociate")];
  const name = (file: TaskFile) => (file.tag ? `${file.name} ${file.tag}` : file.name);
  const used = list.filter((file) => file.used);
  const associated = list.filter((file) => !file.used);
  const people = [...new Set(used.map((file) => file.usedBy).filter(Boolean))].join(", ");
  return [
    used.length ? `${used.map(name).join(", ")} · utilizare înregistrată${people ? ` de ${people}` : ""}` : null,
    associated.length ? `${associated.map(name).join(", ")} · ${associated.length === 1 ? "asociat" : "asociate"}, utilizare neconfirmată` : null,
  ].filter((line): line is string => line !== null);
}

export type FileVersion = { file: JobRecordFile; tag: string; title: string; kept: boolean };
export type FileDocument = { key: string; name: string; kind: string | null; versions: FileVersion[] };

/** The extension the file was recorded with: a type tag, not a claim about its content. */
export function fileKind(name: string): string | null {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name);
  return match ? match[1]!.toLocaleUpperCase("ro") : null;
}

/**
 * Files grouped per document along the server's `supersedes` links, the newest version first. A
 * number appears only along a confirmed chain from the initial file; a revision whose predecessor
 * is not here, and parallel revisions of one version, are named by what they revise instead.
 */
export function fileDocuments(files: readonly JobRecordFile[]): FileDocument[] {
  return versionTrees(files).map((tree) => {
    const root = tree.nodes[0]!.file;
    const versions = tree.nodes.map((node, index) => {
      const purpose = node.file.purposeLabel ? ` · ${node.file.purposeLabel}` : "";
      const title =
        index === 0
          ? tree.origin === "initial"
            ? `Fișier inițial${purpose}`
            : versionRelation(tree, node, formatDay)
          : !tree.linear
            ? `${versionRelation(tree, node, formatDay)}${purpose}`
            : tree.origin === "initial"
              ? `Revizie ${index + 1} din ${tree.nodes.length}${purpose}`
              : `Revizie ulterioară în acest dosar${purpose}`;
      return { file: node.file, tag: versionTag(node), title, kept: node.superseded };
    });
    const name = tree.linear ? tree.nodes[tree.nodes.length - 1]!.file.originalFileName : root.originalFileName;
    return { key: root.artifactId, name, kind: fileKind(root.originalFileName), versions: versions.reverse() };
  });
}

export function versionMeta(version: FileVersion): string {
  const { file } = version;
  return [file.sizeLabel, formatDay(file.uploadedAt), file.authorLabel ?? "autor neînregistrat", version.kept ? "versiune păstrată" : null].filter(Boolean).join(" · ");
}

/** „12 operații · 4 fișiere (5 versiuni) · 27 evenimente”, counted from the record the server returned. */
export function recordCountsLine(tasks: number | null, documents: number, versions: number, events: number): string {
  return [
    tasks === null ? null : countLabel(tasks, "operație", "operații"),
    `${countLabel(documents, "fișier", "fișiere")} (${countLabel(versions, "versiune", "versiuni")})`,
    countLabel(events, "eveniment", "evenimente"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Romanian puts „de” between a number ending past 19 and its noun: „27 de evenimente”, „5 evenimente”. */
export function countWithDe(count: number, one: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  const rest = count % 100;
  return rest === 0 || rest >= 20 ? `${count} de ${many}` : `${count} ${many}`;
}

/**
 * The visible part of the dossier on phone and tablet (Operații, Fișiere, Evenimente): presentation
 * only, kept in its own address parameter so refresh and Back/Forward reopen it without touching
 * `sectiune`, `lucrare`, `gaseste` or the client list filters.
 */
export const MEMORY_TAB_PARAM = "fila";
export const MEMORY_TABS = [
  { value: "operatii", label: "Operații" },
  { value: "fisiere", label: "Fișiere" },
  { value: "evenimente", label: "Evenimente" },
] as const;
export type MemoryTab = (typeof MEMORY_TABS)[number]["value"];

export function readMemoryTab(search: string): MemoryTab {
  const value = new URLSearchParams(search).get(MEMORY_TAB_PARAM);
  return MEMORY_TABS.find((tab) => tab.value === value)?.value ?? "operatii";
}

export function withMemoryParam(search: string, name: string, value: string | null): string {
  const params = new URLSearchParams(search);
  if (value) params.set(name, value);
  else params.delete(name);
  const next = params.toString();
  return next ? `?${next}` : "";
}
