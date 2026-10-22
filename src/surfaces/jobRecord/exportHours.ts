import type { JobRecord } from '../../api/jobRecord';

export function exportHours(record: JobRecord) {
  const cell = (v: string) => {
    let first = 0;
    while (first < v.length && (v.charCodeAt(first) <= 32 || /\s/.test(v[first]!))) first++;
    return '"' + (/^[=+\-@]/.test(v.slice(first)) ? "'" + v : v).replaceAll('"', '""') + '"';
  };
  const rows = [['Operație', 'Componentă', 'Ore de muncă', 'Calitatea evidenței', 'Durată declarată', 'Timp utilaj'],
    ...(record.hours?.tasks ?? []).map(t => [t.seqLabel + ' · ' + t.processLabel, t.scopeLabel, t.timeLabel, t.coverageLabel, t.declaredDurationLabel ?? '', t.machineTimeLabel ?? '']),
    ['TOTAL ÎNREGISTRAT', '', record.hours?.totalLabel ?? 'Neînregistrat', record.hours?.coverageLabel ?? '', '', record.hours?.machineTimeLabel ?? '']];
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'ore-lucrare.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

