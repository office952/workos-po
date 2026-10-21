import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jobRecordFixture } from '../../test/jobRecordFixture';
import type { JobRecord, WorkHoursTask } from '../../api/jobRecord';
import { JobRecordPeople } from './JobRecordPeople';
import { WorkSessionTimeline } from './WorkSessionTimeline';

function fixture() { return structuredClone(jobRecordFixture); }
function show(record: JobRecord, productionFinished = false) {
  return render(<JobRecordPeople record={record} productionFinished={productionFinished} operationHref={id => `/lucrari/job-1?sectiune=operatii&task=${id}`}/>);
}
function openSession(task: WorkHoursTask, personId = 'ion') {
  task.status = 'IN_PROGRESS';
  task.statusLabel = 'În lucru';
  task.complete = false;
  task.coverageLabel = 'Provizoriu · sesiune activă';
  const session = task.sessions.find(s => s.personId === personId)!;
  session.endedAt = null;
  session.endKind = null;
}

describe('people evidence in the existing job sheet', () => {
  it('keeps legacy hours unknown and does not infer production completion from no active sessions', () => {
    const record = fixture();
    record.hours!.people = [];
    record.hours!.totalLabel = 'Neînregistrat';
    record.hours!.tasks = record.hours!.tasks.map(task => ({ ...task, sessions: [], people: [], status: 'IN_PROGRESS' }));
    show(record);
    expect(screen.getByText('Nimeni nu lucrează acum.')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Lucrează acum' })).toBeNull();
    expect(screen.getAllByText('Neînregistrat').length).toBeGreaterThan(0);
    expect(screen.getByText('Participanții nu au fost documentați prin sesiuni.')).toBeVisible();
    expect(screen.queryByText(/lucrarea finalizată/)).toBeNull();
  });

  it('uses explicit job completion while preserving incomplete evidence', () => {
    show(fixture(), true);
    expect(screen.getByText('Nu există sesiuni active în evidența lucrării finalizate.')).toBeVisible();
    expect(screen.getByText('Evidența orelor: parțială')).toBeVisible();
    expect(screen.queryByText(/Lucrarea rămâne în curs/)).toBeNull();
    expect(screen.getAllByRole('table')).toHaveLength(2);
  });

  it('derives current workers from open sessions, even when operation state or summary flags differ', () => {
    const record = fixture();
    openSession(record.hours!.tasks[0]!, 'ion');
    // Summary flags remain false: open personal evidence is what the live panel displays.
    show(record);
    const live = screen.getByRole('region', { name: 'Lucrează acum' });
    expect(within(live).getByText('Ion')).toBeVisible();
    expect(within(live).queryByText('Maria')).toBeNull();
    expect(within(live).getByRole('link', { name: '01 · Lipire' })).toHaveAttribute('href', '/lucrari/job-1?sectiune=operatii&task=task-1');
    expect(screen.getByText('Include sesiuni active · total provizoriu')).toBeVisible();
    expect(screen.queryByText('Nimeni nu lucrează acum.')).toBeNull();
  });

  it('shows simultaneous coworkers and keeps eligibility/completion actions outside this record', () => {
    const record = fixture();
    openSession(record.hours!.tasks[0]!, 'ion');
    openSession(record.hours!.tasks[0]!, 'maria');
    show(record);
    const live = screen.getByRole('region', { name: 'Lucrează acum' });
    expect(within(live).getByText('Împreună cu Ion')).toBeVisible();
    expect(within(live).getByText('Împreună cu Maria')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Pornește|Finalizează|Intră în operație/ })).toBeNull();
  });

  it('uses server labels for operation and personal contributions, with stable keyboard focus', async () => {
    const record = fixture();
    const hours = record.hours!;
    hours.totalLabel = 'TOTAL SERVER';
    hours.people[0]!.timeLabel = 'TOTAL MARIA SERVER';
    hours.tasks[0]!.people[0]!.timeLabel = 'MARIA OPERAȚIE SERVER';
    hours.tasks[0]!.timeLabel = 'TOTAL OPERAȚIE SERVER';
    hours.tasks[1]!.people = [{ ...hours.people[0]!, timeLabel: 'ALTA OPERAȚIE SERVER' }];
    hours.tasks[1]!.sessions = [{ ...hours.tasks[0]!.sessions[0]!, sessionId: 'maria-second' }];
    const user = userEvent.setup();
    show(record);
    const select = screen.getByRole('combobox', { name: 'Operație' });
    select.focus();
    await user.selectOptions(select, 'task-1');
    expect(select).toHaveFocus();
    const person = screen.getByRole('article', { name: 'Maria' });
    expect(within(person).getAllByText('MARIA OPERAȚIE SERVER').length).toBeGreaterThan(0);
    expect(within(person).getByText('TOTAL MARIA SERVER')).toBeVisible();
    expect(screen.getByText('TOTAL SERVER')).toBeVisible();
    expect(screen.getByText('TOTAL OPERAȚIE SERVER')).toBeVisible();
    expect(within(person).getByRole('table')).toHaveAccessibleName(/la operația 01/);
    const chips = within(person).getByRole('group', { name: 'Operațiile persoanei Maria' });
    const chip = within(chips).getByRole('button', { name: /02 Control/ });
    chip.focus();
    await user.keyboard('{Enter}');
    expect(chip).toHaveFocus();
    expect(select).toHaveValue('task-2');
    expect(screen.getByRole('status')).toHaveTextContent('Afișate 1 din 2 persoane · operația 02');
  });

  it('keeps the active session among three visible rows and restores all rows on keyboard expansion', async () => {
    const record = fixture();
    const task = record.hours!.tasks[0]!;
    task.people = [task.people[0]!];
    record.hours!.people = [record.hours!.people[0]!];
    task.sessions = Array.from({ length: 5 }, (_, i) => ({ ...task.sessions[0]!, sessionId: `s-${i}`,
      startedAt: `2026-10-${10 + i}T08:00:00Z`, endedAt: i ? `2026-10-${10 + i}T09:00:00Z` : null, endKind: i ? 'LEFT' : null }));
    const user = userEvent.setup();
    show(record);
    const table = screen.getByRole('table', { name: /Sesiunile persoanei Maria/ });
    expect(within(table).getAllByRole('row')).toHaveLength(4); // header + three sessions
    expect(within(table).getByText('Activă acum')).toBeVisible();
    const expand = screen.getByRole('button', { name: 'Vezi toate cele 5 sesiuni' });
    expand.focus();
    await user.keyboard(' ');
    expect(expand).toHaveFocus();
    expect(expand).toHaveAttribute('aria-expanded', 'true');
    expect(expand).toHaveAttribute('aria-controls', table.id);
    expect(within(table).getAllByRole('row')).toHaveLength(6);
    await user.keyboard('{Enter}');
    expect(expand).toHaveFocus();
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('Activă acum')).toBeVisible();
  });

  it('keeps filter controls focusable when no people match and when refreshed evidence arrives', async () => {
    const record = fixture();
    const user = userEvent.setup();
    const view = show(record);
    const active = screen.getByRole('button', { name: 'Lucrează acum · 0' });
    active.focus();
    await user.keyboard('{Enter}');
    expect(active).toHaveFocus();
    expect(screen.getByText('Nicio persoană nu corespunde filtrelor.')).toBeVisible();
    const next = structuredClone(record);
    openSession(next.hours!.tasks[0]!);
    view.rerender(<JobRecordPeople record={next} productionFinished={false} operationHref={id => `/op/${id}`}/>);
    expect(screen.getByRole('button', { name: 'Lucrează acum · 1' })).toBe(active);
    expect(active).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Afișate 1 din 2 persoane');
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('renders a night session on two calendar days with no hidden focusable controls', () => {
    const task = fixture().hours!.tasks[0]!;
    const session = { ...task.sessions[0]!, startedAt: '2026-10-20T21:30:00', endedAt: '2026-10-21T01:10:00', timeLabel: '3 h 40 min' };
    const { container } = render(<WorkSessionTimeline sessions={[{ task, session }]} asOf="2026-10-21T02:00:00" selectedTask=""/>);
    expect(container.querySelectorAll('.job-people__axis-lane')).toHaveLength(2);
    expect(container.querySelectorAll('.job-people__axis-segment')).toHaveLength(2);
    expect(container.querySelector('[aria-hidden="true"] button, [aria-hidden="true"] a, [aria-hidden="true"] [tabindex]')).toBeNull();
    const segments = container.querySelectorAll<HTMLElement>('.job-people__axis-segment');
    expect(parseFloat(segments[0]!.style.left)).toBeCloseTo(89.58, 2);
    expect(segments[1]!.style.left).toBe('0%');
  });

  it('handles invalid timestamps without hiding the readable session evidence', () => {
    const record = fixture();
    record.hours!.tasks[0]!.sessions[0]!.startedAt = 'dată neînregistrată';
    show(record);
    expect(screen.getByText('dată neînregistrată')).toBeVisible();
    expect(screen.getAllByRole('table')).toHaveLength(2);
  });
});
