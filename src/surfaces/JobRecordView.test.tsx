import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { JobRecord } from '../api/jobRecord';
import type { JobSheetSection } from '../routing/appRoute';
import { JobRecordView } from './JobRecordView';
import { jobRecordFixture } from '../test/jobRecordFixture';

function View({
  record,
  section,
  initialTask = null,
}: {
  record: JobRecord;
  section: JobSheetSection;
  initialTask?: string | null;
}) {
  const [taskId, setTaskId] = useState<string | null>(initialTask);
  return (
    <JobRecordView
      section={section}
      record={record}
      canWriteFiles={false}
      operationHref={(id) => `/lucrari/job-1?task=${id}&sectiune=operatii`}
      selectedTaskId={section === 'operatii' ? taskId : null}
      selectedLabel={null}
      invalidTask={false}
      planUnavailable={false}
      workspaceHref={null}
      onOpenTask={setTaskId}
      onCloseTask={() => setTaskId(null)}
      dossier={null}
      dates={null}
    />
  );
}

describe('file-first job record', () => {
  it('shows only the active section', () => {
    render(<View record={jobRecordFixture} section="situatie" />);
    expect(screen.getByRole('region', { name: 'Totalurile lucrării' })).toBeVisible();
    expect(screen.queryByRole('table', { name: 'Registrul operațiilor' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Fișierele lucrării' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Rezultatele lucrării' })).toBeNull();
  });

  it('shows file-use authors before any task selection and keeps association distinct from use', () => {
    render(<View record={jobRecordFixture} section="fisiere" />);
    const files = screen.getByRole('table', { name: 'Fișiere, utilizări și autorii înregistrărilor' });
    expect(within(files).getAllByText('Elena')).toHaveLength(2);
    expect(within(files).getByText(/Maria ·/)).toBeInTheDocument();
    expect(within(files).getByText('Utilizare înregistrată')).toBeInTheDocument();
    expect(within(files).getByText('Asociat · utilizare neconfirmată')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adaugă fișier' })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Operațiile lucrării' })).toBeNull();
  });

  it('keeps one operations register and opens results under the chosen row', async () => {
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    const user = userEvent.setup();
    render(<View record={jobRecordFixture} section="operatii" />);
    const register = screen.getByRole('table', { name: 'Registrul operațiilor' });
    expect(within(register).getByText('Durată declarată: 42 min')).toBeInTheDocument();
    expect(within(register).getAllByText('Utilaj: Fără rulări înregistrate').length).toBeGreaterThan(0);
    expect(within(register).getAllByText(/Început:/).length).toBeGreaterThan(0);
    expect(within(register).getAllByText(/Final:/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '01 · Lipire' }).closest('.job-record')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Rezultatele lucrării' })).toBeNull();
    expect(within(register).queryByText('Realizat: 4 buc')).toBeNull();
    await user.click(screen.getByRole('button', { name: '01 · Lipire' }));
    const detail = screen.getByRole('region', { name: 'Dosarul operației selectate' });
    const row = screen.getByRole('button', { name: '01 · Lipire' }).closest('tr');
    expect(row?.nextElementSibling).toContainElement(detail);
    expect(within(detail).getByText('Realizat: 4 buc')).toBeVisible();
    expect(within(detail).getByText('Conform planului')).toBeVisible();
    expect(within(detail).getByText('35 min')).toBeInTheDocument();
    expect(within(detail).getByText('40 min')).toBeInTheDocument();
    expect(within(detail).getByText('TOTAL OPERAȚIE')).toBeInTheDocument();
    const opened = screen.getByRole('button', { name: '01 · Lipire' });
    expect(opened).toHaveAttribute('aria-expanded', 'true');
    expect(opened).toHaveAttribute('aria-controls', detail.id);
    expect(scroll).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '02 · Control' }));
    expect(screen.getAllByRole('region', { name: 'Dosarul operației selectate' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: '01 · Lipire' })).toHaveAttribute('aria-expanded', 'false');
    const second = screen.getByRole('button', { name: '02 · Control' });
    expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(second.closest('tr')?.nextElementSibling).toContainElement(screen.getByRole('region', { name: 'Dosarul operației selectate' }));
    expect(within(screen.getByRole('region', { name: 'Dosarul operației selectate' })).queryByText('Realizat: 4 buc')).toBeNull();
  });

  it('prints every operation result from any section without exposing drafts', () => {
    const { rerender } = render(<View record={jobRecordFixture} section="situatie" />);
    const printed = () => document.querySelector('.job-record__print-sheet');
    expect(printed()).toHaveAttribute('hidden');
    expect(printed()?.textContent).toContain('01 · Lipire');
    expect(printed()?.textContent).toContain('Realizat: 4 buc');
    expect(printed()?.textContent).toContain('02 · Control');
    expect(printed()?.textContent).toContain('Durată declarată: 42 min');
    expect(printed()?.querySelector('button, .task-dossier')).toBeNull();
    rerender(<View record={jobRecordFixture} section="fisiere" />);
    expect(printed()?.textContent).toContain('Rezultatele operațiilor');
    expect(screen.queryByRole('table', { name: 'Registrul operațiilor' })).toBeNull();
  });

  it('returns focus to the row control when the detail closes', async () => {
    const user = userEvent.setup();
    render(<View record={jobRecordFixture} section="operatii" />);
    const open = screen.getByRole('button', { name: '01 · Lipire' });
    await user.click(open);
    await user.click(screen.getByRole('button', { name: 'Închide detaliul' }));
    expect(open).toHaveFocus();
    expect(open).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: 'Dosarul operației selectate' })).toBeNull();
    await user.click(open);
    expect(screen.getByRole('region', { name: 'Dosarul operației selectate' })).toBeVisible();
  });

  it('lists a person through their sessions without repeating operations they did not attend', () => {
    render(<View record={jobRecordFixture} section="oameni" />);
    const people = screen.getByRole('region', { name: 'Oameni și timp' });
    expect(within(people).getAllByRole('link', { name: '01 · Lipire' })).toHaveLength(2);
    // Nobody attended 02: no person lists it; it appears only once, as the job-level evidence gap.
    const persons = within(people).getAllByRole('article').filter(a => a.classList.contains('job-people__person'));
    expect(persons).toHaveLength(2);
    for (const person of persons) {
      expect(within(person).queryByText(/02 · Control|^Control$/)).toBeNull();
    }
    expect(within(people).getAllByRole('link', { name: '02 · Control' })).toHaveLength(1);
    expect(within(people).getByText(/De ce este parțială/)).toBeInTheDocument();
    expect(within(people).getByText(/Orele lipsă rămân neînregistrate/)).toBeInTheDocument();
  });

  it('groups history by day', () => {
    const record = { ...jobRecordFixture, timeline: [...jobRecordFixture.timeline, { ...jobRecordFixture.timeline[0]!, eventId: 'next-day', label: 'Control înregistrat', occurredAt: '2026-10-21T09:00:00Z' }] };
    render(<View record={record} section="istoric" />);
    const history = screen.getByRole('region', { name: 'Istoricul lucrării' });
    expect(within(history).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(within(history).getByText('A ieșit din operație')).toBeVisible();
    expect(within(history).getByText('Control înregistrat')).toBeVisible();
    const operationLinks = within(history).getAllByRole('link', { name: '01 · Lipire' });
    expect(operationLinks).toHaveLength(2);
    for (const link of operationLinks) expect(link).toHaveAttribute('href', '/lucrari/job-1?task=task-1&sectiune=operatii');
  });

  it('keeps quantity compliance separate from a quality-control result', async () => {
    const user = userEvent.setup();
    render(<View record={jobRecordFixture} section="operatii" />);
    await user.click(screen.getByRole('button', { name: '01 · Lipire' }));
    const detail = screen.getByRole('region', { name: 'Dosarul operației selectate' });
    const quantities = within(detail).getByRole('heading', { name: 'Cantități' }).parentElement!;
    const quality = within(detail).getByRole('heading', { name: 'Control' }).parentElement!;
    expect(within(quantities).getByText('Conform planului')).toBeVisible();
    expect(within(quality).queryByText('Conform planului')).toBeNull();
    expect(within(quality).getByText('Control neînregistrat')).toBeVisible();
  });

  it('closes a detail excluded by search and allows returning to its operation', async () => {
    const user = userEvent.setup();
    render(<View record={jobRecordFixture} section="operatii" />);
    await user.click(screen.getByRole('button', { name: '01 · Lipire' }));
    await user.type(screen.getByRole('searchbox', { name: 'Caută operație, componentă sau persoană' }), 'Control');
    expect(screen.queryByRole('region', { name: 'Dosarul operației selectate' })).toBeNull();
    expect(screen.queryByRole('button', { name: '01 · Lipire' })).toBeNull();
    expect(screen.getByRole('button', { name: '02 · Control' })).toBeVisible();
    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('button', { name: '01 · Lipire' }));
    expect(screen.getByRole('region', { name: 'Dosarul operației selectate' })).toBeVisible();
  });

  it('opens a specific revision without changing its uses and restores keyboard focus', async () => {
    const user = userEvent.setup();
    render(<View record={jobRecordFixture} section="fisiere" />);
    const open = screen.getAllByRole('button', { name: 'Utilizări și versiuni →' })[0]!;
    await user.click(open);
    const detail = await screen.findByRole('region', { name: 'Detalii fișier litere.dxf' });
    await waitFor(() => expect(detail).toHaveFocus());
    expect(within(detail).getByRole('link', { name: 'Descarcă această versiune' })).toHaveAttribute('href', '/api/execution-artifacts/file-old/download');
    expect(within(detail).getByRole('button', { name: /Versiune ulterioară/ })).toBeInTheDocument();
    await user.click(within(detail).getByRole('button', { name: 'Închide detaliul' }));
    expect(open).toHaveFocus();
  });

  it('closes a filtered-out file detail and does not reopen it when the search clears', async () => {
    const user = userEvent.setup();
    const record = { ...jobRecordFixture, files: jobRecordFixture.files.map((file, index) => ({ ...file, originalFileName: index ? 'control.txt' : 'debitare.txt' })) };
    render(<View record={record} section="fisiere" />);
    await user.click(screen.getAllByRole('button', { name: 'Utilizări și versiuni →' })[0]!);
    expect(screen.getByRole('region', { name: 'Detalii fișier debitare.txt' })).toBeVisible();
    const search = screen.getByRole('searchbox');
    await user.type(search, 'debit');
    expect(screen.getByRole('region', { name: 'Detalii fișier debitare.txt' })).toBeVisible();
    await user.clear(search);
    await user.type(search, 'control');
    expect(screen.queryByRole('region', { name: 'Detalii fișier debitare.txt' })).toBeNull();
    expect(search).toHaveFocus();
    await user.clear(search);
    expect(screen.queryByRole('region', { name: 'Detalii fișier debitare.txt' })).toBeNull();
  });

  it('keeps revision navigation usable when the selected revision does not match the search', async () => {
    const user = userEvent.setup();
    const record = { ...jobRecordFixture, files: jobRecordFixture.files.map((file, index) => ({ ...file, originalFileName: index ? 'revizie.txt' : 'original.txt' })) };
    render(<View record={record} section="fisiere" />);
    await user.type(screen.getByRole('searchbox'), 'original');
    await user.click(screen.getByRole('button', { name: 'Utilizări și versiuni →' }));
    await user.click(screen.getByRole('button', { name: /Versiune ulterioară/ }));
    const detail = screen.getByRole('region', { name: 'Detalii fișier revizie.txt' });
    expect(detail).toBeVisible();
    expect(screen.getByRole('searchbox')).toHaveValue('');
    await user.click(within(detail).getByRole('button', { name: 'Închide detaliul' }));
    expect(screen.getAllByRole('button', { name: 'Utilizări și versiuni →' })[1]).toHaveFocus();
  });
});
