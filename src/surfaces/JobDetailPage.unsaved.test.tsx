import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetResourceCache } from '../data/resourceCache';
import { navigate } from '../routing/navigate';
import { jobRecordFixture } from '../test/jobRecordFixture';
import { JobDetailPage } from './JobDetailPage';

vi.mock('../session/CloudSessionContext', () => ({ useCloudSession: () => ({ ready: true, unavailable: false, mode: 'single_plane', user: null, organization: null }) }));
afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); window.history.replaceState({}, '', '/'); });

/** The planning PATCH answers from `planning` in order; GETs answer the synthetic job. */
function serve(planning: number[]) {
  const patches: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/planning') && init?.method === 'PATCH') {
      patches.push(JSON.parse(String(init.body)));
      const status = planning.shift() ?? 200;
      return Promise.resolve({ ok: status < 300, status, json: async () => (status < 300 ? { job: { jobId: 'job-1' } } : {}) });
    }
    let body: unknown = {};
    if (url.endsWith('/jobs/job-1/record')) body = { record: jobRecordFixture };
    else if (url.endsWith('/jobs/job-1')) body = { job: { jobId: 'job-1', kind: 'ASSEMBLY', productCode: 'assembly', productLabel: 'Panou și litere', inscription: 'NORD', customerDisplayName: 'Client sintetic', stage: 'RELEASED', stageLabel: 'Eliberată', priority: 'STANDARD', targetDate: null, planningEditable: true, nextAction: 'CREATE_EXECUTION_PLAN', orderSnapshotId: 'order', releaseSnapshotId: 'release' }, execution: { planId: null } };
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }));
  return patches;
}

async function editDeadline() {
  window.history.replaceState({}, '', '/lucrari/job-1?sectiune=date');
  render(<JobDetailPage jobId="job-1" section="date"/>);
  await screen.findByRole('heading', { name: 'Panou și litere' });
  const panel = await screen.findByRole('region', { name: 'Prioritatea și termenul' });
  expect(within(panel).queryByText('Modificări nesalvate')).toBeNull();
  const field = within(panel).getByLabelText('Termen');
  await userEvent.type(field, '2026-11-30');
  expect(within(panel).getByText('Modificări nesalvate')).toBeInTheDocument();
  return field as HTMLInputElement;
}

describe('job planning · unsaved changes (N-018)', () => {
  it('holds navigation; staying keeps the values', async () => {
    serve([]);
    const field = await editDeadline();
    navigate('/lucrari');
    expect(await screen.findByRole('heading', { name: 'Ai modificări nesalvate' })).toBeInTheDocument();
    expect(screen.getByText(/Prioritatea și termenul nu sunt salvate. Dacă pleci spre Lucrări/)).toBeInTheDocument();
    expect(window.location.pathname).toBe('/lucrari/job-1');
    await userEvent.click(screen.getByRole('button', { name: 'Rămân pe pagină' }));
    expect(screen.queryByRole('heading', { name: 'Ai modificări nesalvate' })).toBeNull();
    expect(field.value).toBe('2026-11-30');
    expect(window.location.pathname).toBe('/lucrari/job-1');
  });

  it('continues only after a successful save; a failed save keeps the values and offers a retry', async () => {
    const patches = serve([500, 200]);
    const field = await editDeadline();
    navigate('/lucrari');
    await userEvent.click(await screen.findByRole('button', { name: 'Salvează și continuă' }));
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('Salvarea a eșuat')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/lucrari/job-1');
    expect(field.value).toBe('2026-11-30');
    await userEvent.click(screen.getByRole('button', { name: 'Reîncearcă și continuă' }));
    await waitFor(() => expect(window.location.pathname).toBe('/lucrari'));
    expect(patches).toEqual([
      { priority: 'STANDARD', targetDate: '2026-11-30' },
      { priority: 'STANDARD', targetDate: '2026-11-30' },
    ]);
  });

  it('leaves without saving when asked', async () => {
    serve([]);
    await editDeadline();
    navigate('/lucrari');
    await userEvent.click(await screen.findByRole('button', { name: 'Pleacă fără salvare' }));
    expect(window.location.pathname).toBe('/lucrari');
  });
});

describe('job planning · panel in Date lucrare (N-018)', () => {
  it('names the unsaved state, retries a failed save in place and discards on request without asking again', async () => {
    const patches = serve([500, 200]);
    const field = await editDeadline();
    const panel = screen.getByRole('region', { name: 'Prioritatea și termenul' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Salvează' }));
    expect(await within(panel).findByText('Prioritatea și termenul nu au putut fi salvate.')).toBeInTheDocument();
    expect(field.value).toBe('2026-11-30');
    await userEvent.click(within(panel).getByRole('button', { name: 'Reîncearcă salvarea' }));
    expect(await within(panel).findByText('Prioritatea și termenul au fost salvate.')).toBeInTheDocument();
    expect(patches).toHaveLength(2);
  });

  it('"Renunță la modificări" restores the saved values and releases the guard', async () => {
    serve([]);
    const field = await editDeadline();
    const panel = screen.getByRole('region', { name: 'Prioritatea și termenul' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Renunță la modificări' }));
    expect(field.value).toBe('');
    expect(within(panel).queryByText('Modificări nesalvate')).toBeNull();
    navigate('/lucrari');
    expect(window.location.pathname).toBe('/lucrari');
    expect(screen.queryByRole('heading', { name: 'Ai modificări nesalvate' })).toBeNull();
  });
});
