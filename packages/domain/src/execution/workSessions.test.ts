import { describe, expect, it } from 'vitest';
import type { ExecutionPlanRecord, ExecutionTask } from './plan.js';
import { intervalUnionMilliseconds, projectWorkHours, type WorkSession } from './workSessions.js';

const date = (s: string) => '2026-10-20T' + s + ':00.000Z';
const session = (id: string, personId: string, start: string, end: string | null): WorkSession => ({ sessionId: id, taskId: 'task', personId,
  personLabel: personId, startedAt: date(start), endedAt: end ? date(end) : null, endKind: end ? 'LEFT' : null });
function record(sessions: WorkSession[], startedAt = date('13:30')): ExecutionPlanRecord {
  return { plan: {} as ExecutionPlanRecord['plan'], tasks: [{ taskId: 'task', seqLabel: '01', processLabel: 'Lipire', scopeLabel: 'Litere',
    executionPlanId: 'plan', sourceOperationId: 'source', processId: 'process', scope: 'PRODUCT', seq: 1, dependsOnTaskIds: [], requiredCapabilityId: 'ASSEMBLY', requiredCapabilityLabel: 'Ansamblare', providerRequirement: 'NOT_REQUIRED', executionMode: 'INTERNAL', quantities: [], resourceDemands: [], assignedProvider: null, assignedExecutor: null, plannedEffortMinutes: null, completion: null, actualConsumption: [], createdAt: date('13:00'), status: 'COMPLETED', startedAt, completedAt: date('14:40'), actualDurationMinutes: 99, machineRuns: [], workSessions: sessions } satisfies ExecutionTask] };
}
describe('recorded labor hours', () => {
  it('adds individual contributions but unions recorded activity; groups reconcile', () => {
    const sessions = [session('1', 'Maria', '13:30', '14:05'), session('2', 'Ion', '13:50', '14:10'), session('3', 'Ion', '14:20', '14:40')];
    expect(intervalUnionMilliseconds(sessions, date('15:00'))).toBe(60 * 60000);
    const hours = projectWorkHours(record(sessions), date('15:00'));
    expect(hours.totalLabel).toBe('1 h 15 min'); expect(hours.activeTimeLabel).toBe('1 h'); expect(hours.elapsedLabel).toBe('1 h 10 min');
    expect(hours.people.reduce((n, p) => n + p.milliseconds, 0)).toBe(hours.milliseconds);
    expect(hours.tasks.reduce((n, t) => n + (t.milliseconds ?? 0), 0)).toBe(hours.milliseconds);
    expect(hours.tasks[0]?.declaredDurationLabel).toBe('1 h 39 min'); expect(hours.complete).toBe(true);
  });
  it('never turns a legacy declared duration or late join into measured, complete hours', () => {
    const legacy = projectWorkHours(record([]), date('15:00'));
    expect(legacy.totalLabel).toBe('Neînregistrat'); expect(legacy.complete).toBe(false);
    const late = projectWorkHours(record([session('1', 'Ion', '14:20', '14:40')]), date('15:00'));
    expect(late.totalLabel).toBe('20 min'); expect(late.complete).toBe(false);
  });
  it('keeps open intervals provisional and preserves seconds until the aggregate display', () => {
    const r = record([session('1', 'Maria', '13:30', null)]); r.tasks = r.tasks.map(t => ({ ...t, status: 'IN_PROGRESS', completedAt: null }));
    const hours = projectWorkHours(r, date('13:35'));
    expect(hours.totalLabel).toBe('5 min'); expect(hours.complete).toBe(false); expect(hours.people[0]?.active).toBe(true);
    expect(hours.tasks[0]?.sessions[0]?.endedAt).toBeNull();
  });
  it('aggregates seconds before rounding, including repeated entries', () => {
    const base = Date.parse(date('13:30'));
    const sessions = [0, 20, 40].map((seconds, i) => ({ ...session(String(i), 'Ion', '13:30', '13:31'), startedAt: new Date(base + seconds * 1000).toISOString(), endedAt: new Date(base + (seconds + 20) * 1000).toISOString() }));
    const h = projectWorkHours(record(sessions), date('15:00'));
    expect(h.milliseconds).toBe(60000); expect(h.totalLabel).toBe('1 min');
  });

  it('projects active sessions and a canonical untracked start separately, so both stay visible', () => {
    const r = record([session('1', 'Ion', '13:50', null)]);
    r.tasks = r.tasks.map(t => ({ ...t, status: 'IN_PROGRESS', completedAt: null }));
    const h = projectWorkHours(r, date('14:20'));
    const t = h.tasks[0]!;
    expect(t.activeSessionCount).toBe(1); expect(t.provisional).toBe(true);
    expect(t.undocumented).toBe(true); expect(t.evidenceGap).toBe('UNTRACKED_START');
    expect(t.evidenceGapLabel).toMatch(/pornită fără sesiune individuală/);
    expect(t.coverageLabel).toBe('Provizoriu · sesiune activă · parțial nedocumentat');
    expect(h.activeSessionCount).toBe(1); expect(h.provisionalTaskCount).toBe(1); expect(h.undocumentedTaskCount).toBe(1);
    expect(h.coverageLabel).toBe('Ore provizorii · sesiuni active · evidență parțială');
    // The gap names no person and adds no time: totals stay the sum of recorded sessions.
    expect(JSON.stringify(t.evidenceGapLabel)).not.toMatch(/Ion/); expect(h.milliseconds).toBe(30 * 60000);
  });

  it('never infers missing work from pauses: a tracked, interrupted, unfinished operation stays in progress', () => {
    const r = record([session('1', 'Maria', '13:30', '14:00'), session('2', 'Ion', '15:10', '15:40')]);
    r.tasks = r.tasks.map(t => ({ ...t, status: 'IN_PROGRESS', completedAt: null }));
    const h = projectWorkHours(r, date('16:00'));
    const t = h.tasks[0]!;
    expect(t.undocumented).toBe(false); expect(t.evidenceGap).toBeNull(); expect(t.provisional).toBe(false);
    expect(t.coverageLabel).toBe('În lucru · fără sesiuni active');
    expect(h.idleTaskCount).toBe(1); expect(h.undocumentedTaskCount).toBe(0); expect(h.complete).toBe(false);
    expect(h.coverageLabel).toBe('Evidența orelor: fără lipsuri · lucrare în curs');
    expect(h.milliseconds).toBe(60 * 60000);
  });

  it('keeps legacy work without sessions undocumented and an unstarted operation neutral', () => {
    const legacy = projectWorkHours(record([]), date('15:00')).tasks[0]!;
    expect(legacy.evidenceGap).toBe('NO_INDIVIDUAL_SESSIONS'); expect(legacy.coverageLabel).toBe('Parțial · timp nedocumentat');
    const r = record([]); r.tasks = r.tasks.map(t => ({ ...t, status: 'PLANNED', startedAt: null, completedAt: null }));
    const planned = projectWorkHours(r, date('15:00'));
    expect(planned.tasks[0]!.undocumented).toBe(false); expect(planned.tasks[0]!.coverageLabel).toBe('Neîncepută');
    expect(planned.coverageLabel).toBe('Evidența orelor: lucrare neîncepută');
  });

  it('marks external-only labor as not applicable while retaining handoff-to-return elapsed time', () => {
    const r = record([]);
    r.tasks = r.tasks.map(t => ({ ...t, executionMode: 'EXTERNAL', startedAt: null, handedOffAt: date('13:40') }));
    const h = projectWorkHours(r, date('15:00'));
    expect(h.totalLabel).toBe('Nu se aplică'); expect(h.coverageLabel).toBe('Nu se aplică · producție externă');
    expect(h.elapsedLabel).toBe('1 h'); expect(h.tasks[0]?.timeLabel).toBe('Nu se aplică');
  });

});
