import { useRef, useState } from 'react';
import type { JobRecord, JobRecordFile, WorkHoursTask } from '../api/jobRecord';
import { AuthenticatedDownloadLink } from '../presentation/AuthenticatedDownloadLink';
import { formatTimestamp } from '../presentation/format';
import { JobArtifactPreview } from './JobArtifactPreview';
import { JobFilesPanel } from './JobFilesPanel';
import { Button } from '../components/Button';
import { resourceKeys } from '../data/resourceKeys';
import { invalidateResources } from '../data/resourceCache';
import '../styles/surfaces/job-record.css';

export function RecordIcon({ kind }: { kind: 'file' | 'hours' | 'people' | 'history' | 'machine' | 'check' | 'link' }) {
  const paths = {
    file: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></>,
    hours: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/></>,
    history: <><path d="M4 8a9 9 0 1 1-1 8M4 3v5h5M12 7v5l4 2"/></>,
    machine: <path d="M3 21V4h18v17H3M3 17h18M8 4v5h8V4M12 9v5M7 21v-4M17 21v-4"/>,
    check: <><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></>,
    link: <path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0"/>,
  };
  return <svg className="job-record__icon" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
}

function Heading({ icon, children }: { icon: Parameters<typeof RecordIcon>[0]['kind']; children: React.ReactNode }) {
  return <h2><RecordIcon kind={icon}/>{children}</h2>;
}
function moment(value: string | null) { return value ? formatTimestamp(value) : 'Neînregistrat'; }

function exportHours(record: JobRecord) {
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

export function JobRecordView({ record, canWriteFiles, operationHref }: { record: JobRecord; canWriteFiles: boolean; operationHref: (id: string) => string }) {
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [sessionTask, setSessionTask] = useState<string | null>(null);
  const fileButtons = useRef(new Map<string, HTMLButtonElement>());
  const fileDetail = useRef<HTMLElement>(null);
  const sessionHeading = useRef<HTMLHeadingElement>(null);
  const sessionButtons = useRef(new Map<string, HTMLButtonElement>());
  const file = record.files.find(f => f.artifactId === selected) ?? null;
  const task = record.hours?.tasks.find(t => t.taskId === sessionTask) ?? null;
  const normalized = query.trim().toLocaleLowerCase('ro');
  const files = record.files.filter(f => [f.originalFileName, f.purposeLabel, ...f.usages.map(u => u.taskLabel)].join(' ').toLocaleLowerCase('ro').includes(normalized));
  const hours = record.hours;
  function openFile(f: JobRecordFile) { setSelected(f.artifactId); setTimeout(() => fileDetail.current?.focus(), 0); }
  function openSessions(t: WorkHoursTask) { setSessionTask(t.taskId); setTimeout(() => sessionHeading.current?.focus(), 0); }
  return <div className="job-record">
    {hours ? <section className="job-record__summary" aria-label="Totalurile lucrării">
      <div className="job-record__metrics">
        <div><span><RecordIcon kind="hours"/>Ore de muncă înregistrate</span><strong>{hours.totalLabel}</strong><p>Suma contribuțiilor persoanelor{hours.applicableTasks === 0 ? ' · producție externă' : hours.complete ? '' : ' · total parțial sau provizoriu'}</p></div>
        <div><span><RecordIcon kind="history"/>De la început la final</span><strong>{hours.elapsedLabel}</strong><p>Include întreruperile și așteptarea</p></div>
        <div><span><RecordIcon kind="machine"/>Timp utilaj înregistrat</span><strong>{hours.machineTimeLabel}</strong><p>{hours.machineActive ? 'Există rulări active · totalul include numai rulările închise' : 'Rulări închise · separat de orele oamenilor'}</p></div>
      </div>
      <Button variant="secondary" onClick={() => invalidateResources(resourceKeys.jobRecord(record.jobId))}>Actualizează evidența</Button>
      <div className="job-record__facts"><p>Început: {moment(hours.startedAt)} → Final: {moment(hours.completedAt)}</p><p data-complete={hours.complete}>{hours.coverageLabel}{hours.applicableTasks ? ` · ${hours.completeTasks} / ${hours.applicableTasks} operații documentate complet` : ''}</p></div><p className="job-record__note">Situație la {moment(hours.asOf)} · de la prima operație începută până la ultima finalizată sau până la această citire.</p>
    </section> : null}
    <nav className="job-record__anchors" aria-label="Repere în fișa lucrării">
      <a href="#fisiere"><RecordIcon kind="file"/>Fișiere · {record.files.length}</a><a href="#ore"><RecordIcon kind="hours"/>Ore lucrare</a><a href="#oameni"><RecordIcon kind="people"/>Oameni</a><a href="#cronologie"><RecordIcon kind="history"/>Cronologie</a>
    </nav>
    <section id="fisiere" className="job-record__section" aria-label="Fișierele lucrării">
      <header><div><Heading icon="file">Fișierele lucrării</Heading><p>Versiunile păstrate și operațiile în care au fost declarate folosite.</p></div>{canWriteFiles ? <Button variant="secondary" aria-expanded={uploading} onClick={() => setUploading(v => !v)}>{uploading ? 'Închide încărcarea' : 'Adaugă fișier'}</Button> : null}</header>
      {uploading && canWriteFiles ? <JobFilesPanel jobId={record.jobId} uploadOnly onUploaded={() => invalidateResources(resourceKeys.jobRecord(record.jobId))}/> : null}
      <label className="job-record__search">Caută fișier sau operație<input type="search" value={query} onChange={e => setQuery(e.target.value)}/></label>
      {files.length ? <table className="job-record__table job-record__files"><caption className="u-visually-hidden">Fișiere, utilizări și autorii înregistrărilor</caption><thead><tr><th>Fișier / revizie</th><th>Unde a fost folosit</th><th>Încărcat de / când</th><th>Consultare</th></tr></thead><tbody>{files.map(f => <tr key={f.artifactId} data-selected={file?.artifactId === f.artifactId}>
        <td data-label="Fișier / revizie"><strong>{f.originalFileName}</strong><p>{f.sizeLabel} · {f.purposeLabel ?? 'Scop nedeclarat'}</p><p>{f.supersedesArtifactId ? 'Revizie nouă · versiunea anterioară rămâne păstrată' : 'Fișier inițial'}</p></td>
        <td data-label="Unde a fost folosit">{f.usages.length ? f.usages.map(u => <div key={u.taskId} className="job-record__use"><a href={operationHref(u.taskId)}>{u.taskLabel}</a><p><RecordIcon kind={u.usedAt ? 'check' : 'link'}/>{u.usedAt ? 'Utilizare înregistrată' : 'Asociat · utilizare neconfirmată'}</p>{u.usedAt ? <p>{u.usedByLabel ?? 'Autor neînregistrat'} · {moment(u.usedAt)}</p> : null}</div>) : <p>Asociat lucrării · fără utilizare înregistrată pe operații</p>}</td>
        <td data-label="Încărcat de / când">{f.authorLabel ?? 'Cont organizație'}<p>{moment(f.uploadedAt)}</p></td><td data-label="Consultare"><button type="button" ref={n => { if (n) fileButtons.current.set(f.artifactId, n); }} onClick={() => openFile(f)}>Utilizări și versiuni →</button></td>
      </tr>)}</tbody></table> : <p>{record.files.length ? 'Niciun fișier în această căutare.' : 'Lucrarea nu are încă fișiere.'}</p>}
      <p className="job-record__note">Asocierea și descărcarea nu confirmă utilizarea. O revizie nouă nu schimbă fișierul deja declarat folosit.</p>
      {file ? <section className="job-record__file-detail" ref={fileDetail} tabIndex={-1} aria-label={'Detalii fișier ' + file.originalFileName}><header><h3>{file.originalFileName}</h3><Button variant="secondary" onClick={() => { setSelected(null); fileButtons.current.get(file.artifactId)?.focus(); }}>Închide detaliul</Button></header><p>Încărcat: {moment(file.uploadedAt)} · {file.authorLabel ?? 'Cont organizație'}</p>{file.note ? <p>{file.note}</p> : null}<AuthenticatedDownloadLink href={file.downloadHref}>Descarcă această versiune</AuthenticatedDownloadLink><JobArtifactPreview file={file}/>
        <h4>Relații între versiuni</h4>{record.files.filter(f => f.artifactId === file.supersedesArtifactId || f.supersedesArtifactId === file.artifactId).map(f => <p key={f.artifactId}><button type="button" onClick={() => openFile(f)}>{f.artifactId === file.supersedesArtifactId ? 'Versiune anterioară: ' : 'Versiune ulterioară: '}{f.originalFileName} · {moment(f.uploadedAt)}</button></p>)}{!file.supersedesArtifactId && !record.files.some(f => f.supersedesArtifactId === file.artifactId) ? <p>Nu există alte revizii legate de acest fișier.</p> : null}
      </section> : null}
    </section>
    <section id="ore" className="job-record__section" aria-label="Orele lucrării"><header><div><Heading icon="hours">Orele lucrării</Heading><p>Contribuții pe operație, păstrate separat de duratele declarate anterior.</p></div>{hours ? <Button variant="secondary" onClick={() => exportHours(record)}>Exportă orele CSV</Button> : null}</header>
      {hours ? <><table className="job-record__table"><caption className="u-visually-hidden">Evidența orelor pe toate operațiile</caption><thead><tr><th>Operație</th><th>Contribuții</th><th>Început → Final</th><th>Ore de muncă</th><th>Timp utilaj</th></tr></thead><tbody>{hours.tasks.map(t => <tr key={t.taskId} id={'op-' + t.taskId}><td data-label="Operație"><a href={operationHref(t.taskId)}>{t.seqLabel} · {t.processLabel}</a><p>{t.scopeLabel} · {t.statusLabel}</p>{t.qualityLabel ? <p>{t.qualityLabel}</p> : null}{t.providerLabel || t.externalProviderLabel ? <p>{t.externalProviderLabel ?? t.providerLabel}</p> : null}{t.plannedQuantity ? <p>Planificat: {t.plannedQuantity.value.toLocaleString('ro-RO')} {t.plannedQuantity.unit}</p> : null}{t.completedQuantityLabel ? <p>{t.completedQuantityLabel}</p> : null}{t.varianceLabel ? <p>{t.varianceLabel}</p> : null}{t.plannedConsumption?.length ? <ul aria-label="Consum planificat">{t.plannedConsumption.map((a,i) => <li key={i}>Planificat · {a.resourceLabel}: {a.quantity.toLocaleString('ro-RO')} {a.unit}</li>)}</ul> : null}{t.actualConsumption?.length ? <ul aria-label="Consum efectiv">{t.actualConsumption.map((a,i) => <li key={i}>Efectiv · {a.resourceLabel}: {a.actualQuantity.toLocaleString('ro-RO')} {a.unit}</li>)}</ul> : null}</td><td data-label="Contribuții">{t.people.length ? t.people.map(p => <p key={p.personId}>{p.label} · {p.timeLabel}{p.active ? ' · activ' : ''}</p>) : 'Fără sesiuni înregistrate'}</td><td data-label="Început → Final">{moment(t.startedAt)} → {moment(t.completedAt)}</td><td data-label="Ore de muncă"><strong>{t.timeLabel}</strong><p>{t.coverageLabel}</p>{t.declaredDurationLabel ? <p>Durată declarată: {t.declaredDurationLabel}</p> : null}{t.sessions.length ? <button ref={n => { if (n) sessionButtons.current.set(t.taskId, n); }} onClick={() => openSessions(t)} type="button">Vezi sesiunile</button> : null}</td><td data-label="Timp utilaj">{t.machineTimeLabel ?? 'Fără rulări înregistrate'}</td></tr>)}</tbody><tfoot><tr><th scope="row">TOTAL ÎNREGISTRAT</th><td>{hours.people.length} persoane</td><td>{hours.coverageLabel}</td><td><strong>{hours.totalLabel}</strong></td><td>{hours.machineTimeLabel}</td></tr></tfoot></table>
      {task ? <section className="job-record__session-detail" aria-label="Sesiuni de lucru"><header><h3 tabIndex={-1} ref={sessionHeading}>Sesiuni · {task.seqLabel} · {task.processLabel}</h3><Button variant="secondary" onClick={() => { setSessionTask(null); sessionButtons.current.get(task.taskId)?.focus(); }}>Închide sesiunile</Button></header><table className="job-record__table"><thead><tr><th>Persoană</th><th>Intrare</th><th>Ieșire</th><th>Timp</th></tr></thead><tbody>{task.sessions.map(s => <tr key={s.sessionId}><td data-label="Persoană">{s.personLabel}</td><td data-label="Intrare">{moment(s.startedAt)}</td><td data-label="Ieșire">{s.endedAt ? moment(s.endedAt) : 'Sesiune activă'}</td><td data-label="Timp">{s.timeLabel}</td></tr>)}</tbody><tfoot><tr><th scope="row">TOTAL OPERAȚIE</th><td/><td/><td>{task.timeLabel}</td></tr></tfoot></table></section> : null}</> : <p>Planul de execuție nu există încă.</p>}
    </section>
    <div className="job-record__history-grid"><section id="cronologie" className="job-record__section"><Heading icon="history">Cronologia lucrării</Heading><p>Cine · ce a înregistrat · când</p>{record.timeline.length ? <ol className="job-record__timeline">{record.timeline.map(e => <li key={e.eventId}><RecordIcon kind={e.kind === 'TASK_COMPLETED' || e.kind === 'QUALITY_PASS' ? 'check' : e.kind.includes('MACHINE') ? 'machine' : e.kind.includes('ARTIFACT') ? 'file' : 'history'}/><time dateTime={e.occurredAt}>{moment(e.occurredAt)}</time><div><strong>{e.label}</strong><p>{e.actorLabel ?? 'Autor neînregistrat'}</p>{e.taskId ? <a href={operationHref(e.taskId)}>{e.taskLabel}</a> : null}{e.detail ? <p>{e.detail}</p> : null}</div></li>)}</ol> : <p>Nu există încă evenimente înregistrate.</p>}</section>
      <section id="oameni" className="job-record__section"><Heading icon="people">Oameni și timp</Heading>{hours?.people.length ? <ul className="job-record__people">{hours.people.map(p => <li key={p.personId}><span>{p.label}{p.active ? ' · lucrează acum' : ''}</span><strong>{p.timeLabel}</strong></li>)}</ul> : <p>Participanții nu au fost documentați prin sesiuni.</p>}<p>Timp cu activitate înregistrată: <strong>{hours?.activeTimeLabel ?? 'Neînregistrat'}</strong></p><p className="job-record__note">Intervalele simultane se numără o singură dată aici. În orele de muncă, contribuția fiecărei persoane se adună.</p></section></div>
  </div>;
}
