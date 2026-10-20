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
});
