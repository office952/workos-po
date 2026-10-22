import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { workTimeLabel } from "@workos-final/domain";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  expectedTotals, physicalViolations, PEOPLE, seedPeopleEtalon, STATE_ORDER, STATES, stateAsOf, type PersonKey,
} from "./people-etalon/scenario.js";

type Json = Record<string, any>;

/** Fixed anchor keeps the suite deterministic; materialization may pass its own day. */
const TEST_ANCHOR = "2026-10-21";
const roots: string[] = [];

afterEach(() => {
  vi.useRealTimers();
  resetCloudLoginAttemptGuard();
  for (const dir of roots.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows may keep a closed SQLite handle briefly. */ }
  }
});

/**
 * WORKOS_PEOPLE_ETALON_ROOT materializes the etalon into a new, separate synthetic root for
 * browser review. It refuses any existing non-empty folder so reference roots are never touched.
 */
function targetRoot(): { root: string; keep: boolean } {
  const requested = process.env.WORKOS_PEOPLE_ETALON_ROOT?.trim();
  if (!requested) {
    const root = mkdtempSync(join(tmpdir(), "workos-people-etalon-"));
    roots.push(root);
    return { root, keep: false };
  }
  const root = resolve(requested);
  if (existsSync(root) && readdirSync(root).length > 0) throw new Error(`people_etalon_root_not_empty:${root}`);
  mkdirSync(root, { recursive: true });
  return { root, keep: true };
}

describe("people etalon — four reproducible job states", () => {
  it("records realistic participation through canonical routes and reconciles every projection with raw intervals", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { root, keep } = targetRoot();
    const anchor = keep ? process.env.WORKOS_PEOPLE_ETALON_ANCHOR?.trim() || TEST_ANCHOR : TEST_ANCHOR;
    for (const state of STATE_ORDER) expect(physicalViolations(state, anchor), state).toEqual([]);

    const seeded = await seedPeopleEtalon({ cloudRoot: root, anchor, clock: iso => vi.setSystemTime(new Date(iso)) });
    const report: Json[] = [];
    try {
      for (const job of seeded.jobs) {
        const { state } = job;
        vi.setSystemTime(new Date(stateAsOf(state, anchor)));
        const record = await seeded.readRecord(job.jobId);
        const hours = record.hours as Json;
        const taskCount = Object.keys(job.taskIds).length;
        const expected = expectedTotals(state, anchor, taskCount);

        // Raw sessions persisted exactly as the history produced them.
        const persisted = (hours.tasks as Json[]).flatMap(t => (t.sessions as Json[]).map(s => ({
          seq: t.seqLabel, person: s.personLabel, startedAt: s.startedAt, endedAt: s.endedAt, endKind: s.endKind })));
        const raw = expected.sessions.map(s => ({ seq: s.seq, person: PEOPLE[s.person].name, startedAt: s.startedAt, endedAt: s.endedAt, endKind: s.endKind }));
        const order = (a: Json, b: Json) => (a.startedAt + a.person).localeCompare(b.startedAt + b.person);
        expect(persisted.sort(order), state).toEqual(raw.sort(order));

        // Work = sum of personal sessions; activity = union; calendar and machine time per contract.
        expect(hours.milliseconds, state).toBe(expected.totalMs);
        expect(hours.activeTimeLabel, state).toBe(workTimeLabel(expected.activeMs));
        expect(hours.elapsedLabel, state).toBe(workTimeLabel(expected.elapsedMs));
        expect(hours.machineTimeLabel, state).toBe(workTimeLabel(expected.machineMs));
        for (const person of expected.people) {
          const projected = (hours.people as Json[]).find(p => p.label === person.name)!;
          expect(projected.milliseconds, `${state}:${person.name}`).toBe(person.milliseconds);
          expect(projected.active, `${state}:${person.name}`).toBe(person.active.length > 0);
        }
        for (const task of hours.tasks as Json[]) {
          expect(task.milliseconds ?? 0, `${state}:${task.seqLabel}`).toBe(expected.bySeq.get(task.seqLabel) ?? 0);
        }
        expect(hours.milliseconds).toBe((hours.people as Json[]).reduce((n, p) => n + p.milliseconds, 0));

        const active = expected.people.filter(p => p.active.length);
        const tasks = hours.tasks as Json[];
        const bySeq = (seq: string) => tasks.find(t => t.seqLabel === seq)!;
        // Separate evidence signals: open sessions, canonical gaps, and operations left in progress.
        expect(hours.activeSessionCount, state).toBe(expected.sessions.filter(s => !s.endedAt).length);
        expect(hours.undocumentedTaskCount, state).toBe(tasks.filter(t => t.undocumented).length);
        for (const t of tasks) {
          expect(t.provisional, `${state}:${t.seqLabel}`).toBe((t.sessions as Json[]).some(s => !s.endedAt));
          if (t.undocumented) expect(t.evidenceGapLabel, `${state}:${t.seqLabel}`).not.toMatch(/Andrei|Elena|Mihai|Ioana|Radu|Cristina/);
        }
        if (state === "A") {
          expect(active.map(p => p.key).sort()).toEqual(["cristina", "elena", "radu"]);
          expect(hours.completedAt).toBeNull();
          // Same operation: live sessions and an earlier start without individual evidence, both kept.
          const assembly = bySeq("09");
          expect(assembly.provisional).toBe(true);
          expect(assembly.activeSessionCount).toBe(3);
          expect(assembly.undocumented).toBe(true);
          expect(assembly.evidenceGap).toBe("UNTRACKED_START");
          expect(assembly.coverageLabel).toBe("Provizoriu · sesiune activă · parțial nedocumentat");
          expect(hours.undocumentedTaskCount).toBe(1);
          expect(hours.coverageLabel).toBe("Ore provizorii · sesiuni active · evidență parțială");
        }
        if (state === "B") {
          expect(active).toEqual([]);
          expect(hours.completedAt).toBeNull(); // nobody active does not mean finished
          // Tracked from its start, interrupted and unfinished: in progress, never "undocumented".
          const assembly = bySeq("09");
          expect(assembly.status).toBe("IN_PROGRESS");
          expect(assembly.undocumented).toBe(false);
          expect(assembly.evidenceGap).toBeNull();
          expect(assembly.coverageLabel).toBe("În lucru · fără sesiuni active");
          expect(tasks.filter(t => t.status === "PLANNED").every(t => !t.undocumented && t.coverageLabel === "Neîncepută")).toBe(true);
          expect(hours.idleTaskCount).toBe(1);
          expect(hours.undocumentedTaskCount).toBe(0);
          expect(hours.coverageLabel).toBe("Evidența orelor: fără lipsuri · lucrare în curs");
        }
        if (state === "C") {
          expect(expected.finished).toBe(true);
          expect(hours.complete).toBe(true);
          expect(hours.undocumentedTaskCount).toBe(0);
          expect(hours.activeSessionCount).toBe(0);
          expect(hours.coverageLabel).toBe("Evidența orelor: completă");
        }
        if (state === "D") {
          expect(expected.finished).toBe(true);
          expect(hours.complete).toBe(false);
          expect(hours.coverageLabel).toBe("Evidența orelor: parțială");
          const montaj = bySeq("15");
          expect(montaj.coverageLabel).toBe("Parțial · timp nedocumentat");
          expect(montaj.evidenceGap).toBe("UNTRACKED_START");
          expect(montaj.provisional).toBe(false);
          expect(hours.undocumentedTaskCount).toBe(1);
          expect(hours.completeTasks).toBe(taskCount - 1);
        }

        // Files: revision chain, authorship and recorded use.
        const files = record.files as Json[];
        const v2 = files.find(f => f.originalFileName === "litere-fata-v2.dxf")!;
        expect(v2.supersedesArtifactId).toBe(files.find(f => f.originalFileName === "litere-fata-v1.dxf")!.artifactId);
        expect((v2.usages as Json[]).filter(u => u.usedByLabel).map(u => u.usedByLabel).sort()).toEqual(["Andrei Pop", "Cristina Vlad"]);
        const timeline = record.timeline as Json[];
        expect(timeline.some(e => e.kind === "ISSUE_REPORTED" && e.actorLabel === "Radu Ionescu")).toBe(true);
        expect(timeline.some(e => e.kind === "WORK_LEFT" && e.actorLabel === "Elena Dinu")).toBe(true);
        const untracked = { A: "09", D: "15" } as Record<string, string>;
        if (untracked[state]) expect(timeline.find(e => e.eventId === "start:" + job.taskIds[untracked[state]!])?.detail).toBe("Început fără sesiune individuală înregistrată");
        else expect(timeline.some(e => e.eventId.startsWith("start:"))).toBe(false);

        report.push({
          state, title: job.title, jobId: job.jobId, asOf: expected.asOf,
          expected: { workMs: expected.totalMs, activeMs: expected.activeMs, elapsedMs: expected.elapsedMs, machineMs: expected.machineMs,
            people: expected.people.map(p => ({ name: p.name, sessions: p.sessions, milliseconds: p.milliseconds, active: p.active })) },
          engine: { totalLabel: hours.totalLabel, milliseconds: hours.milliseconds, activeTimeLabel: hours.activeTimeLabel,
            elapsedLabel: hours.elapsedLabel, machineTimeLabel: hours.machineTimeLabel, coverageLabel: hours.coverageLabel,
            activeSessionCount: hours.activeSessionCount, undocumentedTaskCount: hours.undocumentedTaskCount, idleTaskCount: hours.idleTaskCount,
            gaps: (hours.tasks as Json[]).filter(t => t.undocumented).map(t => ({ seq: t.seqLabel, gap: t.evidenceGap, provisional: t.provisional })),
            people: (hours.people as Json[]).map(p => ({ label: p.label, milliseconds: p.milliseconds, timeLabel: p.timeLabel, active: p.active })) },
        });
      }
    } finally {
      seeded.close();
    }
    expect(report.map(r => r.state)).toEqual(STATE_ORDER);
    if (keep) {
      writeFileSync(join(root, "people-etalon-report.json"), JSON.stringify({
        classification: "SYNTHETIC_PEOPLE_ETALON", realData: false, anchor,
        states: Object.fromEntries(STATE_ORDER.map(s => [s, STATES[s].title])),
        people: (Object.keys(PEOPLE) as PersonKey[]).map(k => ({ name: PEOPLE[k].name, skills: PEOPLE[k].skills })),
        jobs: report,
      }, null, 2));
    }
  }, 180_000);
});
