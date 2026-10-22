import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { JobRecordView } from './JobRecordView';
import { jobRecordFixture } from '../test/jobRecordFixture';

describe('file-first job record', () => {
  it('shows file-use authors and history before any task selection; keeps declared duration separate', () => {
    render(<JobRecordView record={jobRecordFixture} canWriteFiles={false} operationHref={id => '/lucrari/job-1?task=' + id}/>);
    const files = screen.getByRole('table', { name: 'Fișiere, utilizări și autorii înregistrărilor' });
    expect(within(files).getAllByText('Elena')).toHaveLength(2);
    expect(within(files).getByText(/Maria ·/)).toBeInTheDocument();
    expect(within(files).getByText('Utilizare înregistrată')).toBeInTheDocument();
    expect(within(files).getByText('Asociat · utilizare neconfirmată')).toBeInTheDocument();
    expect(screen.getByText('Durată declarată: 42 min')).toBeInTheDocument();
    expect(screen.getByText('A ieșit din operație')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Adaugă fișier' })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
  });
  it('keeps hours, results, people and every dated event in visible sections', () => {
    const record = { ...jobRecordFixture, timeline: [...jobRecordFixture.timeline, { ...jobRecordFixture.timeline[0]!, eventId: 'next-day', label: 'Control înregistrat', occurredAt: '2026-10-21T09:00:00Z' }] };
    render(<JobRecordView record={record} canWriteFiles={false} operationHref={id => '#' + id}/>);
    const hours = screen.getByRole('region', { name: 'Orele lucrării' });
    const results = screen.getByRole('region', { name: 'Rezultatele lucrării' });
    expect(within(hours).queryByText('Realizat: 4 buc')).toBeNull();
    expect(within(results).getByText('Realizat: 4 buc')).toBeVisible();
    expect(within(results).getByText('Conform planului')).toBeVisible();
    const people = screen.getByRole('region', { name: 'Oameni și timp' });
    const history = screen.getByRole('region', { name: 'Cronologia lucrării' });
    expect(people.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(history).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    expect(within(history).getByText('A ieșit din operație')).toBeVisible();
    expect(within(history).getByText('Control înregistrat')).toBeVisible();
    expect(document.querySelector('details')).toBeNull();
  });
  it('opens a specific revision without changing its uses and restores keyboard focus', async () => {
    const user = userEvent.setup(); render(<JobRecordView record={jobRecordFixture} canWriteFiles={false} operationHref={id => '#' + id}/>);
    const open = screen.getAllByRole('button', { name: 'Utilizări și versiuni →' })[0]!;
    await user.click(open);
    const detail = await screen.findByRole('region', { name: 'Detalii fișier litere.dxf' });
    await waitFor(() => expect(detail).toHaveFocus());
    expect(within(detail).getByRole('link', { name: 'Descarcă această versiune' })).toHaveAttribute('href', '/api/execution-artifacts/file-old/download');
    expect(within(detail).getByRole('button', { name: /Versiune ulterioară/ })).toBeInTheDocument();
    await user.click(within(detail).getByRole('button', { name: 'Închide detaliul' })); expect(open).toHaveFocus();
  });
  it('opens actual sessions with a total, preserving partial job coverage and focus', async () => {
    const user = userEvent.setup(); render(<JobRecordView record={jobRecordFixture} canWriteFiles={false} operationHref={id => '#' + id}/>);
    const open = screen.getByRole('button', { name: 'Vezi sesiunile' }); await user.click(open);
    const detail = await screen.findByRole('region', { name: 'Sesiuni de lucru' });
    expect(within(detail).getByText('35 min')).toBeInTheDocument(); expect(within(detail).getByText('40 min')).toBeInTheDocument();
    expect(within(detail).getByText('TOTAL OPERAȚIE')).toBeInTheDocument();
    expect(screen.getByText(/Evidența orelor: parțială · 1 \/ 2/)).toBeInTheDocument();
    await user.click(within(detail).getByRole('button', { name: 'Închide sesiunile' })); expect(open).toHaveFocus();
  });
  it('closes a filtered-out file detail and does not reopen it when the search clears', async () => {
    const user = userEvent.setup();
    const record = { ...jobRecordFixture, files: jobRecordFixture.files.map((f, i) => ({ ...f, originalFileName: i ? 'control.txt' : 'debitare.txt' })) };
    render(<JobRecordView record={record} canWriteFiles={false} operationHref={id => '#' + id}/>);
    await user.click(screen.getAllByRole('button', { name: 'Utilizări și versiuni →' })[0]!);
    expect(screen.getByRole('region', { name: 'Detalii fișier debitare.txt' })).toBeVisible();
    const search = screen.getByRole('searchbox');
    await user.type(search, 'debit');
    expect(screen.getByRole('region', { name: 'Detalii fișier debitare.txt' })).toBeVisible();
    await user.clear(search); await user.type(search, 'control');
    expect(screen.queryByRole('region', { name: 'Detalii fișier debitare.txt' })).toBeNull();
    expect(search).toHaveFocus();
    await user.clear(search);
    expect(screen.queryByRole('region', { name: 'Detalii fișier debitare.txt' })).toBeNull();
  });
  it('keeps revision navigation usable when the selected revision does not match the search', async () => {
    const user = userEvent.setup();
    const record = { ...jobRecordFixture, files: jobRecordFixture.files.map((f, i) => ({ ...f, originalFileName: i ? 'revizie.txt' : 'original.txt' })) };
    render(<JobRecordView record={record} canWriteFiles={false} operationHref={id => '#' + id}/>);
    await user.type(screen.getByRole('searchbox'), 'original');
    await user.click(screen.getByRole('button', { name: 'Utilizări și versiuni →' }));
    await user.click(screen.getByRole('button', { name: /Versiune ulterioară/ }));
    const detail = screen.getByRole('region', { name: 'Detalii fișier revizie.txt' });
    expect(detail).toBeVisible(); expect(screen.getByRole('searchbox')).toHaveValue('');
    await user.click(within(detail).getByRole('button', { name: 'Închide detaliul' }));
    expect(screen.getAllByRole('button', { name: 'Utilizări și versiuni →' })[1]).toHaveFocus();
  });

});
