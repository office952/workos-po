import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetResourceCache } from '../data/resourceCache';
import { jobRecordFixture } from '../test/jobRecordFixture';
import { JobDetailPage } from './JobDetailPage';
vi.mock('../session/CloudSessionContext', () => ({ useCloudSession: () => ({ ready: true, unavailable: false, mode: 'single_plane', user: null, organization: null }) }));
afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); });
function fixture(options: { finished?: boolean; planned?: boolean; invalidRecord?: boolean } = {}) {
  const fetch = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = {};
    if (url.endsWith('/jobs/job-1/record')) body = options.invalidRecord ? {} : { record: jobRecordFixture };
    else if (url.endsWith('/jobs/job-1')) body = { job: { jobId: 'job-1', kind: 'ASSEMBLY', productCode: 'assembly', productLabel: 'Panou și litere', inscription: 'NORD', customerDisplayName: 'Client sintetic', stage: options.finished ? 'EXECUTION_COMPLETED' : 'IN_EXECUTION', stageLabel: 'În lucru', progressLabel: options.finished ? '2 / 2' : '0 / 2', nextAction: 'CONTINUE_EXECUTION', orderSnapshotId: 'order', releaseSnapshotId: 'release' }, execution: { planId: options.planned === false ? null : 'plan-1' } };
    else if (url.includes('/execution-plans/plan-1')) body = { executionPlan: { plan: { planId: 'plan-1', productLabel: 'Panou și litere', inscription: 'NORD' }, progress: { completed: 0, total: 2 }, tasks: jobRecordFixture.hours!.tasks.map(t => ({ ...t, waitingFor: [], eligibleProviders: [] })) } };
    else if (url.includes('material-preparation')) body = { preparation: { jobId: 'job-1', planId: null, lines: [] } };
    else if (url.endsWith('/dossier')) body = { dossier: { taskId: url.includes('task-1') ? 'task-1' : 'task-2', files: [], planFiles: [], instructions: [], observations: [], issues: [], history: [] } };
    void init;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }); vi.stubGlobal('fetch', fetch); return fetch;
}
describe('job record page', () => {
  it('makes files, hours, people and chronology visible without selecting or fetching a task dossier', async () => {
    const fetch = fixture(); render(<JobDetailPage jobId="job-1"/>);
    expect(await screen.findByRole('heading', { name: 'Panou și litere' })).toBeInTheDocument();
    expect(await screen.findByRole('table', { name: 'Fișiere, utilizări și autorii înregistrărilor' })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Orele lucrării' })).toBeVisible();
    expect(screen.getByText('A ieșit din operație')).toBeVisible();
    expect(screen.getByRole('navigation', { name: 'Repere în fișa lucrării' }).querySelectorAll('a')).toHaveLength(4);
    expect(screen.queryByRole('tab')).toBeNull();
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/dossier'))).toBe(false);
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });
  it('preserves the finished record and separates production completion from delivery', async () => {
    fixture({ finished: true }); render(<JobDetailPage jobId="job-1"/>);
    expect(await screen.findByText(/Producția este finalizată. Livrarea și montajul/)).toBeVisible();
    expect(await screen.findByText('Durată declarată: 42 min')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Deschide în Atelier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trimite în producție' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tipărește fișa' })).toBeEnabled();
    expect(screen.queryByText(/Nicio operație începută/)).toBeNull();
  });
  it('never replaces an invalid explicit task with another operation', async () => {
    fixture(); render(<JobDetailPage jobId="job-1" taskId="missing"/>);
    expect(await screen.findByText('Operația nu există în această lucrare')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Dosarul operației selectate' })).toBeNull();
    expect(await screen.findByRole('region', { name: 'Fișierele lucrării' })).toBeVisible();
  });
  it('opens only the explicitly requested task while retaining the visible whole-job record', async () => {
    fixture(); render(<JobDetailPage jobId="job-1" taskId="task-1"/>);
    expect(await screen.findByRole('region', { name: 'Dosarul operației selectate' })).toBeVisible();
    await waitFor(() => expect(screen.getByRole('heading', { name: '01 · Lipire' })).toHaveFocus());
    expect(screen.getByRole('link', { name: 'Deschide operația în Atelier' })).toHaveAttribute('href', '/atelier?job=job-1&plan=plan-1&task=task-1');
    expect(await screen.findByText('A ieșit din operație')).toBeVisible();
  });
  it('reports invalid record responses as unavailable and provides retry instead of perpetual loading', async () => {
    const fetch = fixture({ invalidRecord: true }); const user = userEvent.setup(); render(<JobDetailPage jobId="job-1"/>);
    expect(await screen.findByText('Dosarul nu a putut fi actualizat')).toBeVisible();
    const before = fetch.mock.calls.length; await user.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(before));
  });
});
