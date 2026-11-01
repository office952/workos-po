import { describe, expect, it } from "vitest";
import type { JobRecord, JobRecordFile, WorkHoursTask } from "../../../api/jobRecord";
import {
  consumptionLine,
  countWithDe,
  fileDocuments,
  fileFields,
  fileKind,
  memoryMatches,
  operationGroups,
  planPresence,
  planSentence,
  readMemoryTab,
  recordCountsLine,
  stageCounts,
  stageLegend,
  taskFileLines,
  taskFiles,
  taskWhenLine,
  withMemoryParam,
} from "./workMemoryModel";

const hours = { tasks: [{ taskId: "t1" }] } as JobRecord["hours"];

function task(seq: string, status: string, extra: Partial<WorkHoursTask> = {}): WorkHoursTask {
  return {
    taskId: `t${seq}`,
    processLabel: `Proces ${seq}`,
    scopeLabel: "Corp",
    seqLabel: seq,
    status,
    startedAt: null,
    completedAt: null,
    timeLabel: "Neînregistrat",
    complete: false,
    coverageLabel: "",
    statusLabel: status,
    completedQuantityLabel: null,
    varianceLabel: null,
    providerLabel: null,
    externalProviderLabel: null,
    actualConsumption: [],
    declaredDurationLabel: null,
    machineTimeLabel: null,
    people: [],
    sessions: [],
    ...extra,
  };
}

function file(id: string, extra: Partial<JobRecordFile> = {}): JobRecordFile {
  return {
    artifactId: id,
    originalFileName: "desen.pdf",
    mimeType: "application/pdf",
    sizeLabel: "4 KB",
    purpose: null,
    purposeLabel: "Fișier de lucru",
    note: null,
    preview: "NONE",
    supersedesArtifactId: null,
    authorLabel: null,
    uploadedAt: "2026-10-23T08:00:00.000Z",
    downloadHref: `/api/execution-artifacts/${id}/download`,
    usages: [],
    ...extra,
  };
}

describe("work memory · missing and zero stay apart", () => {
  it("a missing plan is not zero operations", () => {
    expect(planPresence(null)).toBe("missing");
    expect(planSentence("missing")).toBe("Plan de execuție neînregistrat");
  });

  it("an empty recorded plan is zero", () => {
    expect(planPresence({ ...hours!, tasks: [] })).toBe("empty");
    expect(planSentence("empty")).toBe("Plan fără operații înregistrate");
    expect(planPresence(hours)).toBe("recorded");
    expect(planSentence("recorded")).toBeNull();
  });

  it("does not turn an unrecorded consumption into zero", () => {
    expect(consumptionLine(task("01", "IN_PROGRESS"), "active")).toBe("Consum neînregistrat");
    const planned = task("02", "PLANNED", { plannedConsumption: [{ resourceLabel: "Debitare CNC față", quantity: 14.8, unit: "m" }] });
    expect(consumptionLine(planned, "planned")).toBe("Prevăzut: 14.8 m · Debitare CNC față");
    expect(consumptionLine({ ...planned, status: "IN_PROGRESS" }, "active")).toBe("Prevăzut: 14.8 m · Debitare CNC față · consum neînregistrat");
    expect(consumptionLine({ ...planned, actualConsumption: [{ resourceLabel: "Tablă", actualQuantity: 0, unit: "m" }] }, "done")).toBe(
      "Prevăzut: 14.8 m · Debitare CNC față · Consum: 0 m · Tablă",
    );
  });
});

describe("work memory · operations grouped by state, plan number kept", () => {
  const tasks = [task("01", "IN_PROGRESS"), task("02", "PLANNED"), task("03", "COMPLETED"), task("04", "OUTSIDE"), task("05", "PLANNED"), task("06", "IN_PROGRESS")];

  it("puts active first and finished last, keeping the plan order inside each group", () => {
    const groups = operationGroups(tasks);
    expect(groups.map((group) => [group.title, group.tasks.map((item) => item.seqLabel)])).toEqual([
      ["În lucru", ["01", "06"]],
      ["La furnizor extern", ["04"]],
      ["Urmează", ["02", "05"]],
      ["Finalizate", ["03"]],
    ]);
  });

  it("says zero finished operations instead of hiding the group, and keeps an unknown status under its own label", () => {
    const groups = operationGroups([task("01", "PLANNED"), task("02", "READY", { statusLabel: "Neîncepută" })]);
    expect(groups.map((group) => [group.title, group.tasks.length])).toEqual([
      ["Urmează", 1],
      ["Finalizate", 0],
      ["Neîncepută", 1],
    ]);
  });

  it("counts every operation once and names the total", () => {
    const counts = stageCounts(tasks);
    expect(counts).toMatchObject({ active: 2, outside: 1, planned: 2, done: 1, other: 0, total: 6 });
    expect(stageLegend(counts).map((entry) => entry.text)).toEqual(["1 finalizată", "2 în lucru", "1 la furnizor extern", "2 planificate", "din 6"]);
    expect(stageLegend(stageCounts([task("01", "PLANNED")])).map((entry) => entry.text)).toEqual(["0 finalizate", "0 în lucru", "1 planificată", "din 1"]);
  });

  it("names the start of an open operation and the end of a finished one, as recorded", () => {
    const open = task("01", "IN_PROGRESS", { startedAt: "2026-10-23T08:00:00.000Z", people: [{ personId: "p1", label: "Ion", timeLabel: "41 min", active: true }] });
    expect(taskWhenLine(open, "active")).toBe("Începută 23.10.2026 · Ion");
    expect(taskWhenLine(task("02", "IN_PROGRESS"), "active")).toBe("Început neînregistrat");
    const done = task("03", "COMPLETED", { completedAt: "2026-10-06T08:00:00.000Z", completedQuantityLabel: "Realizat: 14,8 m", varianceLabel: "Conform planului" });
    expect(taskWhenLine(done, "done")).toBe("Realizat: 14,8 m · Conform planului · finalizată 06.10.2026");
    expect(taskWhenLine(task("04", "PLANNED"), "planned")).toBeNull();
  });
});

describe("work memory · files, versions, association and use", () => {
  const v1 = file("a1", { usages: [{ taskId: "t01", taskLabel: "01 · Debitare", linkedAt: "2026-10-23T08:00:00.000Z", usedAt: null, usedByLabel: null }, { taskId: "t07", taskLabel: "07 · Formare", linkedAt: "2026-10-23T08:00:00.000Z", usedAt: "2026-10-23T09:00:00.000Z", usedByLabel: "Radu" }] });
  const v2 = file("a2", { supersedesArtifactId: "a1", purposeLabel: "Pregătit pentru execuție" });
  const other = file("b1", { originalFileName: "contur.dxf", usages: [{ taskId: "t01", taskLabel: "01 · Debitare", linkedAt: "2026-10-23T08:00:00.000Z", usedAt: null, usedByLabel: null }] });

  it("groups versions per document, newest first, numbered only along the recorded chain", () => {
    const documents = fileDocuments([v1, v2, other]);
    expect(documents.map((document) => [document.name, document.kind, document.versions.map((version) => [version.tag, version.title, version.kept])])).toEqual([
      ["desen.pdf", "PDF", [["v2", "Revizie 2 din 2 · Pregătit pentru execuție", false], ["v1", "Fișier inițial · Fișier de lucru", true]]],
      ["contur.dxf", "DXF", [["v1", "Fișier inițial · Fișier de lucru", false]]],
    ]);
  });

  it("does not presume a version number when the previous one is not in the record", () => {
    const orphan = file("c2", { supersedesArtifactId: "missing" });
    expect(fileDocuments([orphan])[0]!.versions.map((version) => [version.tag, version.title])).toEqual([["rev.", "Revizie înregistrată · versiunea anterioară nu este în acest dosar"]]);
    expect(fileKind("fără-extensie")).toBeNull();
  });

  it("keeps association apart from declared use on the operation", () => {
    expect(taskFiles("t01", [v1, v2, other])).toEqual([
      { name: "desen.pdf", tag: "v1", usedBy: null, used: false },
      { name: "contur.dxf", tag: null, usedBy: null, used: false },
    ]);
    expect(taskFileLines(taskFiles("t01", [v1, v2, other]), false)).toEqual(["desen.pdf v1, contur.dxf · asociate, utilizare neconfirmată"]);
    expect(taskFileLines(taskFiles("t07", [v1, v2, other]), false)).toEqual(["desen.pdf v1 · utilizare înregistrată de Radu"]);
    expect(taskFileLines(taskFiles("t01", [v1, v2, other]), true)).toEqual(["2 fișiere asociate"]);
    expect(taskFileLines([], false)).toEqual([]);
  });

  const assoc = (taskId: string, taskLabel: string) => ({ taskId, taskLabel, linkedAt: "2026-10-23T08:00:00.000Z", usedAt: null, usedByLabel: null });
  const used = (taskId: string, taskLabel: string, by: string) => ({ taskId, taskLabel, linkedAt: "2026-10-23T08:00:00.000Z", usedAt: "2026-10-23T11:00:00.000Z", usedByLabel: by });
  const base = file("p1", { usages: [assoc("t01", "01 · Debitare")] });
  const revA = file("p2", { supersedesArtifactId: "p1", purposeLabel: "Pregătit pentru execuție", uploadedAt: "2026-10-23T09:00:00.000Z", usages: [used("t07", "07 · Formare", "Radu")] });
  const revB = file("p3", { supersedesArtifactId: "p1", purposeLabel: "Corecție client", uploadedAt: "2026-10-23T10:00:00.000Z", usages: [assoc("t02", "02 · Montare")] });

  it("shows two revisions of one version in one document, each once, without a presumed v2 / v3 (UX-S1)", () => {
    const documents = fileDocuments([revB, base, revA]);
    expect(documents).toHaveLength(1);
    expect(documents[0]!.versions.map((version) => [version.file.artifactId, version.tag, version.title, version.kept])).toEqual([
      ["p3", "rev.", "Revizie paralelă a fișierului inițial · Corecție client", false],
      ["p2", "rev.", "Revizie paralelă a fișierului inițial · Pregătit pentru execuție", false],
      ["p1", "v1", "Fișier inițial · Fișier de lucru", true],
    ]);
    expect(documents[0]!.versions.map((version) => version.file.usages)).toEqual([revB.usages, revA.usages, base.usages]);
    expect(fileDocuments([base, revA, revB])).toEqual(documents);
  });

  it("keeps the operation's association and declared use on the exact parallel revision (UX-S1)", () => {
    const files = [base, revA, revB];
    expect(taskFiles("t07", files)).toEqual([{ name: "desen.pdf", tag: "rev.", usedBy: "Radu", used: true }]);
    expect(taskFiles("t02", files)).toEqual([{ name: "desen.pdf", tag: "rev.", usedBy: null, used: false }]);
    expect(taskFiles("t01", files)).toEqual([{ name: "desen.pdf", tag: "v1", usedBy: null, used: false }]);
    expect(taskFileLines(taskFiles("t07", files), false)).toEqual(["desen.pdf rev. · utilizare înregistrată de Radu"]);
  });

  it("keeps a confirmed three-version chain numbered v1 → v2 → v3", () => {
    const v3 = file("a3", { supersedesArtifactId: "a2", uploadedAt: "2026-10-23T09:00:00.000Z", usages: [assoc("t02", "02 · Montare")] });
    const documents = fileDocuments([v3, v2, v1]);
    expect(documents[0]!.versions.map((version) => [version.tag, version.title])).toEqual([
      ["v3", "Revizie 3 din 3 · Fișier de lucru"],
      ["v2", "Revizie 2 din 3 · Pregătit pentru execuție"],
      ["v1", "Fișier inițial · Fișier de lucru"],
    ]);
    expect(taskFiles("t02", [v1, v2, v3])).toEqual([{ name: "desen.pdf", tag: "v3", usedBy: null, used: false }]);
  });

  it("does not number an operation's file when its predecessor is not in the record", () => {
    const orphan = file("c2", { supersedesArtifactId: "missing", usages: [assoc("t01", "01 · Debitare")] });
    const later = file("c3", { supersedesArtifactId: "c2", uploadedAt: "2026-10-23T09:00:00.000Z" });
    expect(fileDocuments([orphan, later])[0]!.versions.map((version) => [version.tag, version.title])).toEqual([
      ["rev.", "Revizie ulterioară în acest dosar · Fișier de lucru"],
      ["rev.", "Revizie înregistrată · versiunea anterioară nu este în acest dosar"],
    ]);
    expect(taskFiles("t01", [orphan, later])).toEqual([{ name: "desen.pdf", tag: "rev.", usedBy: null, used: false }]);
  });
});

describe("work memory · counts, search and the tab in the address", () => {
  it("counts from the record and says „de” where Romanian needs it", () => {
    expect(recordCountsLine(12, 4, 5, 27)).toBe("12 operații · 4 fișiere (5 versiuni) · 27 evenimente");
    expect(recordCountsLine(null, 1, 1, 1)).toBe("1 fișier (1 versiune) · 1 eveniment");
    expect(countWithDe(27, "eveniment", "evenimente")).toBe("27 de evenimente");
    expect(countWithDe(5, "eveniment", "evenimente")).toBe("5 evenimente");
    expect(countWithDe(100, "eveniment", "evenimente")).toBe("100 de evenimente");
    expect(countWithDe(119, "eveniment", "evenimente")).toBe("119 evenimente");
  });

  it("every word must be found, without case or diacritics", () => {
    expect(memoryMatches("lipire litere", ["01", "Lipire", "Litere volumetrice"])).toBe(true);
    expect(memoryMatches("lipire factură", ["Lipire"])).toBe(false);
    expect(memoryMatches("", ["Lipire"])).toBe(true);
  });

  it("finds a file by the person who declared its use", () => {
    const used = file("u1", { usages: [{ taskId: "t07", taskLabel: "07 · Formare", linkedAt: "2026-10-23T08:00:00.000Z", usedAt: "2026-10-23T09:00:00.000Z", usedByLabel: "Radu Ene" }] });
    expect(memoryMatches("radu", fileFields(used))).toBe(true);
    expect(memoryMatches("radu", fileFields(file("u2")))).toBe(false);
  });

  it("keeps the tab in its own parameter, without touching the others", () => {
    const search = "?sectiune=lucrari&tip=WORKOS&an=2026&lucrare=job%3Aj2&gaseste=desen";
    expect(readMemoryTab(search)).toBe("operatii");
    expect(readMemoryTab("?fila=fisiere")).toBe("fisiere");
    expect(readMemoryTab("?fila=necunoscut")).toBe("operatii");
    const next = new URLSearchParams(withMemoryParam(search, "fila", "evenimente"));
    expect(Object.fromEntries(next)).toEqual({ sectiune: "lucrari", tip: "WORKOS", an: "2026", lucrare: "job:j2", gaseste: "desen", fila: "evenimente" });
    expect(withMemoryParam("?fila=fisiere", "fila", null)).toBe("");
  });
});
