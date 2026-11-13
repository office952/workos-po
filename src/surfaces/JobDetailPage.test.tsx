import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetResourceCache } from '../data/resourceCache';
import { jobRecordFixture } from '../test/jobRecordFixture';
import { JobDetailPage } from './JobDetailPage';
const cloud = vi.hoisted(() => ({ ready: true, unavailable: false, mode: 'single_plane' as string, user: null as { email?: string } | null, organization: null as { organizationId?: string; membershipRole?: string } | null }));
vi.mock('../session/CloudSessionContext', () => ({ useCloudSession: () => cloud }));
afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); cloud.mode = 'single_plane'; cloud.organization = null; cloud.ready = true; cloud.unavailable = false; });
const openIssue = {
  entryId: 'iss-1',
  taskId: 'task-1',
  taskLabel: '01 · Lipire · Litere',
  body: 'Vibrație anormală CNC. Am oprit lucrul.',
  reasonCode: 'MACHINE',
  reasonLabel: 'Utilaj',
  status: 'OPEN',
  statusLabel: 'Deschisă',
  authorLabel: 'Florin CNC',
  createdAt: '2026-11-07T09:00:00.000Z',
  acknowledgedAt: null,
  acknowledgedByLabel: null,
  resolvedAt: null,
  resolvedByLabel: null,
  canAcknowledge: true,
  canResolve: true,
  history: [{ kind: 'ISSUE_REPORTED', label: 'Problemă semnalată', actorLabel: 'Florin CNC', occurredAt: '2026-11-07T09:00:00.000Z' }],
};

function fixture(options: { finished?: boolean; planned?: boolean; invalidRecord?: boolean; operator?: boolean; unreleased?: boolean; releasedWithoutPlan?: boolean; issue?: boolean } = {}) {
  const fetch = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = {};
    const unreleased = options.unreleased === true;
    const missingPlan = unreleased || options.releasedWithoutPlan === true;
    if (url.endsWith('/jobs/job-1/record')) body = options.invalidRecord ? {} : { record: { ...jobRecordFixture, issues: options.issue ? [openIssue] : [] } };
    else if (url.endsWith('/jobs/job-1')) body = { job: { jobId: 'job-1', kind: options.unreleased ? 'PRODUCT' : 'ASSEMBLY', productCode: options.unreleased ? 'PRD-LETTERS' : 'assembly', productLabel: options.unreleased ? 'Litere volumetrice' : 'Panou și litere', inscription: 'NORD', customerDisplayName: 'Client sintetic', stage: options.finished ? 'EXECUTION_COMPLETED' : unreleased ? 'ORDER_CREATED' : options.releasedWithoutPlan ? 'RELEASED' : 'IN_EXECUTION', stageLabel: unreleased ? 'Comandă creată' : options.releasedWithoutPlan ? 'Eliberată pentru producție' : 'În lucru', progressLabel: options.finished ? '2 / 2' : '0 / 2', nextAction: unreleased ? 'RELEASE_TO_PRODUCTION' : options.releasedWithoutPlan ? 'CREATE_EXECUTION_PLAN' : 'CONTINUE_EXECUTION', nextActionLabel: unreleased || options.releasedWithoutPlan ? 'Trimite în producție' : 'Urmărește producția', needsAttention: missingPlan || Boolean(options.issue), attentionLabel: options.issue ? 'Problemă semnalată' : unreleased ? 'Comanda așteaptă trimiterea în producție' : options.releasedWithoutPlan ? 'Pregătirea producției este incompletă' : null, orderSnapshotId: 'order', releaseSnapshotId: unreleased ? null : 'release', planId: missingPlan ? null : 'plan-1' }, execution: { planId: missingPlan || options.planned === false ? null : 'plan-1' } };
    else if (url.includes('/execution-plans/plan-1')) body = { executionPlan: { plan: { planId: 'plan-1', productLabel: 'Panou și litere', inscription: 'NORD' }, progress: { completed: 0, total: 2 }, tasks: jobRecordFixture.hours!.tasks.map(t => ({ ...t, waitingFor: [], eligibleProviders: [] })) } };
    else if (url.includes('/operator-session') && options.operator) body = { operator: { personId: 'ion', displayName: 'Ion' } };
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
    expect(screen.getByRole('navigation', { name: 'Secțiunile lucrării' }).querySelectorAll('a')).toHaveLength(6);
    expect(await screen.findByRole('heading', { name: 'Situația lucrării' })).toBeVisible();
    expect(screen.queryByRole('table', { name: 'Fișiere, utilizări și autorii înregistrărilor' })).toBeNull();
    expect(screen.queryByRole('table', { name: 'Registrul operațiilor' })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/dossier'))).toBe(false);
    expect(fetch.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  });
  it('preserves the finished record and separates production completion from delivery', async () => {
    fixture({ finished: true }); render(<JobDetailPage jobId="job-1" section="operatii"/>);
    expect(await screen.findByText(/Livrarea și montajul nu sunt confirmate de această stare/)).toBeVisible();
    expect(within(await screen.findByRole('table', { name: 'Registrul operațiilor' })).getByText('Durată declarată: 42 min')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Exportă orele CSV' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Deschide în Atelier' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Deschide operația în Atelier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trimite în producție' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Semnalează necesar de aprovizionare' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Tipărește fișa' })).toBeEnabled();
    expect(screen.getByText('Producția este finalizată. Compară planificat cu realizat. Livrarea și montajul nu sunt confirmate de această stare.')).toBeVisible();
    expect(screen.getByRole('list', { name: 'Parcursul lucrării' })).toBeVisible();
    expect(screen.queryByText(/Nicio operație începută/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Rezultatele lucrării' })).toBeNull();
  });
  it('keeps an unresolved issue visible after production completion', async () => {
    fixture({ finished: true, issue: true });
    render(<JobDetailPage jobId="job-1"/>);
    expect(await screen.findByText(/De rezolvat: Problemă semnalată/)).toBeVisible();
    expect(await screen.findByRole('region', { name: 'Probleme semnalate' })).toBeVisible();
    expect(screen.getByText('Vibrație anormală CNC. Am oprit lucrul.')).toBeVisible();
    expect(screen.getByText('Deschisă')).toBeVisible();
    expect(screen.getByText(/Livrarea și montajul nu sunt confirmate de această stare/)).toBeVisible();
  });
  it('never replaces an invalid explicit task with another operation', async () => {
    fixture(); render(<JobDetailPage jobId="job-1" taskId="missing"/>);
    expect(await screen.findByText('Operația nu există în această lucrare')).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Dosarul operației selectate' })).toBeNull();
    expect(screen.queryByRole('button', { name: '01 · Lipire' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Fișierele lucrării' })).toBeNull();
  });
  it('opens only the explicitly requested task in the bench, with its own Atelier destination', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    fixture(); render(<JobDetailPage jobId="job-1" taskId="task-1" section="operatii"/>);
    const detail = await screen.findByRole('region', { name: 'Dosarul operației selectate' });
    expect(within(screen.getByRole('navigation', { name: 'Comutator operații' })).getByText(/^Operația 01 din 2/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Operațiile lucrării' })).toContainElement(detail);
    // With an operation open, the header's job-level Atelier entry gives way to the operation's own.
    expect(screen.queryByRole('link', { name: 'Deschide lucrarea în Atelier' })).toBeNull();
    const atelier = new URL(screen.getByRole('link', { name: 'Deschide operația 01 în Atelier' }).getAttribute('href')!, 'https://workos.local');
    expect(atelier.pathname).toBe('/atelier');
    expect(Object.fromEntries(atelier.searchParams)).toEqual({ job: 'job-1', plan: 'plan-1', task: 'task-1', return: '/lucrari/job-1?task=task-1&sectiune=operatii' });
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { name: '01 · Lipire' }));
    expect(scroll).not.toHaveBeenCalled();
  });
  it('preserves an unsaved dossier and focus when the whole-job report arrives later', async () => {
    const original = fixture({ operator: true });
    let finish!: (response: unknown) => void;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo, init?: RequestInit) => String(input).endsWith('/jobs/job-1/record')
      ? new Promise(resolve => { finish = resolve; }) : original(input, init)));
    const user = userEvent.setup(); render(<JobDetailPage jobId="job-1" taskId="task-1"/>);
    await screen.findByRole('region', { name: 'Dosarul operației selectate' });
    await user.click(await screen.findByRole('button', { name: 'Adaugă observație' }));
    const note = screen.getByLabelText('Observație'); await user.type(note, 'Ciornă nesalvată');
    expect(screen.queryByText('Planul de execuție nu există încă.')).toBeNull();
    await act(async () => { finish({ ok: true, status: 200, json: async () => ({ record: jobRecordFixture }) }); });
    await screen.findByRole('navigation', { name: 'Comutator operații' });
    expect(screen.queryByRole('region', { name: 'Fișierele lucrării' })).toBeNull();
    expect(screen.getByLabelText('Observație')).toBe(note);
    expect(note).toHaveValue('Ciornă nesalvată'); expect(note).toHaveFocus();
    expect(screen.getByRole('region', { name: 'Operațiile lucrării' })).toContainElement(screen.getByRole('region', { name: 'Dosarul operației selectate' }));
  });
  it('reports invalid record responses as unavailable and provides retry instead of perpetual loading', async () => {
    const fetch = fixture({ invalidRecord: true }); const user = userEvent.setup(); render(<JobDetailPage jobId="job-1"/>);
    expect(await screen.findByText('Dosarul nu a putut fi actualizat')).toBeVisible();
    const before = fetch.mock.calls.length; await user.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    await waitFor(() => expect(fetch.mock.calls.length).toBeGreaterThan(before));
  });
  it('offers one production action to the owner and explains the hold to a member', async () => {
    fixture({ unreleased: true });
    const { rerender } = render(<JobDetailPage jobId="job-1"/>);
    expect(await screen.findByRole('button', { name: 'Trimite în producție' })).toBeEnabled();
    expect(screen.getByText(/Comanda este confirmată. Trimite în producție/)).toBeVisible();
    expect(screen.getByRole('list', { name: 'Parcursul lucrării' }).textContent).toContain('Pregătire producție');
    expect(screen.queryByRole('link', { name: 'Deschide lucrarea în Atelier' })).toBeNull();
    cloud.mode = 'organization';
    cloud.organization = { organizationId: 'org-1', membershipRole: 'member' };
    rerender(<JobDetailPage jobId="job-1"/>);
    expect(screen.queryByRole('button', { name: 'Trimite în producție' })).toBeNull();
    expect(screen.getByText(/proprietarul organizației/)).toBeVisible();
  });
  it('shows an incomplete plan as recoverable, without claiming the workshop has started', async () => {
    fixture({ releasedWithoutPlan: true });
    render(<JobDetailPage jobId="job-1"/>);
    expect(await screen.findByRole('button', { name: 'Trimite în producție' })).toBeEnabled();
    expect(screen.getAllByText(/Pregătirea producției este incompletă/).length).toBeGreaterThan(0);
    const journey = screen.getByRole('list', { name: 'Parcursul lucrării' });
    expect(within(journey).getByText('Incomplet')).toBeVisible();
    expect(within(journey).getByText('Atelier').closest('li')).toHaveTextContent('Urmează');
    expect(within(journey).getByText('Producție finalizată').closest('li')).toHaveTextContent('Indisponibil');
  });
});
