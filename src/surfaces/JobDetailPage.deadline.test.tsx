import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetResourceCache } from '../data/resourceCache';
import { navigate } from '../routing/navigate';
import { jobRecordFixture } from '../test/jobRecordFixture';
import { JobDetailPage } from './JobDetailPage';
import { presentDeadlineDay } from './jobRecord/deadlineDay';

vi.mock('../session/CloudSessionContext', () => ({ useCloudSession: () => ({ ready: true, unavailable: false, mode: 'single_plane', user: null, organization: null }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); resetResourceCache(); window.history.replaceState({}, '', '/'); });

type Kind = 'PRODUCT' | 'ASSEMBLY';
function label(date: string | null) { return date ? date.split('-').reverse().join('.') : 'Fără termen'; }

/**
 * A synthetic server that keeps the saved deadline: the planning PATCH answers from `planning`
 * in order and, when it succeeds, later GETs read the new value (as after a refresh).
 */
function serve(options: { kind?: Kind; targetDate?: string | null; finished?: boolean; planning?: number[] } = {}) {
  const saved = { targetDate: options.targetDate ?? null, priority: 'STANDARD' };
  const planning = [...(options.planning ?? [])];
  const patches: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/planning') && init?.method === 'PATCH') {
      const patch = JSON.parse(String(init.body)) as { priority: string; targetDate: string | null };
      patches.push(patch);
      const status = planning.shift() ?? 200;
      if (status < 300) Object.assign(saved, patch);
      return Promise.resolve({ ok: status < 300, status, json: async () => (status < 300 ? { job: { jobId: 'job-1' } } : {}) });
    }
    let body: unknown = {};
    if (url.endsWith('/jobs/job-1/record')) body = { record: jobRecordFixture };
    else if (url.includes('material-preparation')) body = { preparation: { jobId: 'job-1', planId: null, lines: [] } };
    else if (url.endsWith('/jobs/job-1')) {
      const kind = options.kind ?? 'ASSEMBLY';
      body = { job: { jobId: 'job-1', kind, productCode: kind === 'ASSEMBLY' ? 'assembly' : 'acm-panel', productLabel: kind === 'ASSEMBLY' ? 'Panou și litere' : 'Panou ACM', inscription: 'NORD', customerDisplayName: 'Client sintetic', stage: options.finished ? 'EXECUTION_COMPLETED' : 'RELEASED', stageLabel: 'Eliberată', priority: saved.priority, targetDate: saved.targetDate, targetDateLabel: label(saved.targetDate), planningEditable: !options.finished, nextAction: 'CREATE_EXECUTION_PLAN', orderSnapshotId: 'order', releaseSnapshotId: 'release' }, execution: { planId: null } };
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }));
  return patches;
}

async function openPanel(kind: Kind = 'ASSEMBLY') {
  window.history.replaceState({}, '', '/lucrari/job-1?sectiune=date');
  render(<JobDetailPage jobId="job-1" section="date"/>);
  // A product job is titled by its inscription, an assembly by its label.
  await screen.findByRole('heading', { name: kind === 'ASSEMBLY' ? 'Panou și litere' : 'NORD' });
  const panel = await screen.findByRole('region', { name: 'Prioritatea și termenul' });
  return { panel, field: within(panel).getByLabelText('Termen') as HTMLInputElement };
}

/** What the browser reports after a day is chosen in its calendar. */
function choose(field: HTMLInputElement, day: string) { fireEvent.change(field, { target: { value: day } }); }

/** A date control holding a half-typed date reports an empty value with `badInput`. */
function typePartially(field: HTMLInputElement) {
  Object.defineProperty(field, 'validity', { configurable: true, get: () => ({ badInput: true }) });
  fireEvent.change(field, { target: { value: '' } });
  Object.defineProperty(field, 'validity', { configurable: true, get: () => ({ badInput: false }) });
}

describe('job deadline · calendar control (N-022)', () => {
  it('is a native date control; without a deadline it says so and offers nothing to remove', async () => {
    serve();
    const { panel, field } = await openPanel();
    expect(field.type).toBe('date');
    expect(field.value).toBe('');
    expect(field).toHaveAccessibleDescription('Lucrarea nu are termen. Alege o zi din calendar.');
    expect(within(panel).getByRole('button', { name: 'Fără termen' })).toBeDisabled();
    expect(within(panel).getByRole('button', { name: 'Salvează' })).toBeDisabled();
    expect(within(panel).queryByText('Modificări nesalvate')).toBeNull();
  });

  it.each<Kind>(['PRODUCT', 'ASSEMBLY'])('shows the saved deadline of a %s job and names the chosen day', async (kind) => {
    serve({ kind, targetDate: '2026-11-30' });
    const { field } = await openPanel(kind);
    expect(field.value).toBe('2026-11-30');
    expect(field).toHaveAccessibleDescription(`Termen ales: ${presentDeadlineDay('2026-11-30')}.`);
    expect(presentDeadlineDay('2026-11-30')).toMatch(/30 noiembrie 2026/);
    expect(screen.getByText('Termen: 30.11.2026')).toBeInTheDocument();
  });

  it('choosing a day only changes the draft; saving sends the calendar day as YYYY-MM-DD', async () => {
    const patches = serve({ kind: 'PRODUCT' });
    const { panel, field } = await openPanel('PRODUCT');
    choose(field, '2026-12-15');
    expect(field.value).toBe('2026-12-15');
    expect(within(panel).getByText('Modificări nesalvate')).toBeInTheDocument();
    expect(field).toHaveAccessibleDescription(`Termen ales: ${presentDeadlineDay('2026-12-15')}.`);
    expect(patches).toEqual([]);
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(await within(panel).findByText('Prioritatea și termenul au fost salvate.')).toBeInTheDocument();
    expect(patches).toEqual([{ priority: 'STANDARD', targetDate: '2026-12-15' }]);
  });

  it('changes an existing deadline, and the saved value survives a refresh', async () => {
    const patches = serve({ targetDate: '2026-11-30' });
    const { panel, field } = await openPanel();
    choose(field, '2027-01-08');
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    await waitFor(() => expect(screen.getByText('Termen: 08.01.2027')).toBeInTheDocument());
    expect(within(panel).queryByText('Modificări nesalvate')).toBeNull();
    expect(patches).toEqual([{ priority: 'STANDARD', targetDate: '2027-01-08' }]);
    cleanup(); resetResourceCache();
    const reopened = await openPanel();
    expect(reopened.field.value).toBe('2027-01-08');
  });

  it('"Fără termen" removes the deadline only on save, as null', async () => {
    const patches = serve({ targetDate: '2026-11-30' });
    const { panel, field } = await openPanel();
    await userEvent.click(within(panel).getByRole('button', { name: 'Fără termen' }));
    expect(field.value).toBe('');
    expect(field).toHaveAccessibleDescription('Lucrarea nu are termen. Alege o zi din calendar.');
    expect(within(panel).getByText('Modificări nesalvate')).toBeInTheDocument();
    expect(patches).toEqual([]);
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    await waitFor(() => expect(screen.getByText('Termen: Fără termen')).toBeInTheDocument());
    expect(patches).toEqual([{ priority: 'STANDARD', targetDate: null }]);
  });

  it('"Renunță la modificări" brings back the saved deadline', async () => {
    serve({ targetDate: '2026-11-30' });
    const { panel, field } = await openPanel();
    choose(field, '2027-02-01');
    await userEvent.click(within(panel).getByRole('button', { name: 'Renunță la modificări' }));
    expect(field.value).toBe('2026-11-30');
    expect(within(panel).queryByText('Modificări nesalvate')).toBeNull();
  });

  it('a failed save keeps the chosen day and the retry sends it again', async () => {
    const patches = serve({ targetDate: '2026-11-30', planning: [500, 200] });
    const { panel, field } = await openPanel();
    choose(field, '2026-12-01');
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(await within(panel).findByText('Prioritatea și termenul nu au putut fi salvate.')).toBeInTheDocument();
    expect(field.value).toBe('2026-12-01');
    expect(screen.getByText('Termen: 30.11.2026')).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole('button', { name: 'Reîncearcă salvarea' }));
    expect(await within(panel).findByText('Prioritatea și termenul au fost salvate.')).toBeInTheDocument();
    expect(patches).toEqual([{ priority: 'STANDARD', targetDate: '2026-12-01' }, { priority: 'STANDARD', targetDate: '2026-12-01' }]);
  });

  it('a day chosen and not saved holds navigation behind the unsaved-changes question', async () => {
    serve({ targetDate: '2026-11-30' });
    const { field } = await openPanel();
    choose(field, '2026-12-20');
    navigate('/lucrari');
    expect(await screen.findByRole('heading', { name: 'Ai modificări nesalvate' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/lucrari/job-1');
    await userEvent.click(screen.getByRole('button', { name: 'Rămân pe pagină' }));
    expect(field.value).toBe('2026-12-20');
  });

  it('a half-typed date never drops the saved deadline: it cannot be saved and says why', async () => {
    const patches = serve({ targetDate: '2026-11-30' });
    const { panel, field } = await openPanel();
    typePartially(field);
    expect(field).toHaveAccessibleDescription(/Data din câmp este incompletă/);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(within(panel).getByRole('button', { name: 'Salvează' })).toBeDisabled();
    expect(within(panel).getByText('Modificări nesalvate')).toBeInTheDocument();
    fireEvent.submit(field.closest('form')!);
    navigate('/lucrari');
    await userEvent.click(await screen.findByRole('button', { name: 'Salvează și continuă' }));
    expect(await within(screen.getByRole('dialog')).findByText('Salvarea a eșuat')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/lucrari/job-1');
    expect(patches).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Rămân pe pagină' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Renunță la modificări' }));
    expect(field.value).toBe('2026-11-30');
    expect(field).toHaveAccessibleDescription(`Termen ales: ${presentDeadlineDay('2026-11-30')}.`);
  });

  it('a half-typed date in an empty field (no change event) is still reported, and "Fără termen" wipes it', async () => {
    const patches = serve();
    const { panel, field } = await openPanel();
    // The browser keeps the value at "" while some segments hold digits: only the key is seen.
    Object.defineProperty(field, 'validity', { configurable: true, get: () => ({ badInput: true }) });
    fireEvent.keyUp(field, { key: '3' });
    expect(field).toHaveAccessibleDescription(/Data din câmp este incompletă/);
    expect(within(panel).getByText('Modificări nesalvate')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Salvează' })).toBeDisabled();
    let cleared = false;
    Object.defineProperty(field, 'value', { configurable: true, get: () => '', set: () => { cleared = true; } });
    Object.defineProperty(field, 'validity', { configurable: true, get: () => ({ badInput: !cleared }) });
    await userEvent.click(within(panel).getByRole('button', { name: 'Fără termen' }));
    expect(cleared).toBe(true);
    expect(field).toHaveAccessibleDescription('Lucrarea nu are termen. Alege o zi din calendar.');
    expect(within(panel).queryByText('Modificări nesalvate')).toBeNull();
    expect(patches).toEqual([]);
  });

  it('the "Calendar" button opens the browser calendar where the browser offers one', async () => {
    const showPicker = vi.fn();
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', { configurable: true, writable: true, value: showPicker });
    try {
      serve();
      const { panel, field } = await openPanel();
      await userEvent.click(within(panel).getByRole('button', { name: 'Calendar' }));
      expect(showPicker).toHaveBeenCalledTimes(1);
      expect(field).toHaveFocus();
    } finally {
      delete (HTMLInputElement.prototype as { showPicker?: unknown }).showPicker;
    }
  });

  it('a finished job shows its deadline and gains no editor', async () => {
    const patches = serve({ targetDate: '2026-11-30', finished: true });
    window.history.replaceState({}, '', '/lucrari/job-1?sectiune=date');
    render(<JobDetailPage jobId="job-1" section="date"/>);
    expect(await screen.findByText('Termen: 30.11.2026')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Prioritatea și termenul' })).toBeNull();
    expect(screen.queryByLabelText('Termen')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fără termen' })).toBeNull();
    expect(patches).toEqual([]);
  });
});

describe('presentDeadlineDay', () => {
  it('names only real calendar days, with no time-zone shift', () => {
    expect(presentDeadlineDay('2026-01-01')).toMatch(/1 ianuarie 2026/);
    expect(presentDeadlineDay('2026-02-30')).toBeNull();
    expect(presentDeadlineDay('30.11.2026')).toBeNull();
    expect(presentDeadlineDay('')).toBeNull();
  });
});
