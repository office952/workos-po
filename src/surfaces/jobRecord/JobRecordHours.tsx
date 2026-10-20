import { moment } from './format';
import { useRef, useState, type ReactNode } from 'react';
import type { JobRecord, WorkHoursTask } from '../../api/jobRecord';
import { Button } from '../../components/Button';
import { Heading } from './presentation';
import { exportHours } from './exportHours';

export function JobRecordHours({ record, operationHref, operationDetail }: { record: JobRecord | null; operationHref: (id: string) => string; operationDetail?: ReactNode }) {
  const hours = record?.hours;
  const [sessionTask, setSessionTask] = useState<string | null>(null);
  const sessionHeading = useRef<HTMLHeadingElement>(null);
  const sessionButtons = useRef(new Map<string, HTMLButtonElement>());
  const task = hours?.tasks.find(t => t.taskId === sessionTask) ?? null;
  function openSessions(t: WorkHoursTask) { setSessionTask(t.taskId); setTimeout(() => sessionHeading.current?.focus(), 0); }
  if (!record && !operationDetail) return null;
  return <section id="ore" className="job-record__section" aria-label="Orele lucrării"><header><div><Heading icon="hours">Orele lucrării</Heading><p>Cine a lucrat, când și cât. Cantitățile și materialele sunt în secțiunea Rezultate.</p></div>{hours && record ? <Button variant="secondary" onClick={() => exportHours(record)}>Exportă orele CSV</Button> : null}</header>
      {operationDetail}
      {hours ? <><table className="job-record__table"><caption className="u-visually-hidden">Evidența orelor pe toate operațiile</caption><thead><tr><th>Operație</th><th>Contribuții</th><th>Început / Final</th><th>Ore de muncă</th><th>Timp utilaj</th></tr></thead><tbody>{hours.tasks.map(t => <tr key={t.taskId} id={'op-' + t.taskId}><td data-label="Operație"><a href={operationHref(t.taskId)}>{t.seqLabel} · {t.processLabel}</a><p>{t.scopeLabel} · {t.statusLabel}</p>{t.providerLabel || t.externalProviderLabel ? <p>{t.externalProviderLabel ?? t.providerLabel}</p> : null}</td><td data-label="Contribuții">{t.people.length ? t.people.map(p => <p key={p.personId}>{p.label} · {p.timeLabel}{p.active ? ' · activ' : ''}</p>) : 'Fără sesiuni înregistrate'}</td><td data-label="Început → Final"><span className="job-record__date">{moment(t.startedAt)}</span><span className="job-record__date">{moment(t.completedAt)}</span></td><td data-label="Ore de muncă"><strong>{t.timeLabel}</strong><p>{t.coverageLabel}</p>{t.declaredDurationLabel ? <p>Durată declarată: {t.declaredDurationLabel}</p> : null}{t.sessions.length ? <button ref={n => { if (n) sessionButtons.current.set(t.taskId, n); }} onClick={() => openSessions(t)} type="button">Vezi sesiunile</button> : null}</td><td data-label="Timp utilaj">{t.machineTimeLabel ?? 'Fără rulări înregistrate'}</td></tr>)}</tbody><tfoot><tr><th scope="row">TOTAL ÎNREGISTRAT</th><td>{hours.people.length} persoane</td><td>{hours.coverageLabel}</td><td><strong>{hours.totalLabel}</strong></td><td>{hours.machineTimeLabel}</td></tr></tfoot></table>
      {task ? <section className="job-record__session-detail" aria-label="Sesiuni de lucru"><header><h3 tabIndex={-1} ref={sessionHeading}>Sesiuni · {task.seqLabel} · {task.processLabel}</h3><Button variant="secondary" onClick={() => { setSessionTask(null); sessionButtons.current.get(task.taskId)?.focus(); }}>Închide sesiunile</Button></header><table className="job-record__table"><thead><tr><th>Persoană</th><th>Intrare</th><th>Ieșire</th><th>Timp</th></tr></thead><tbody>{task.sessions.map(s => <tr key={s.sessionId}><td data-label="Persoană">{s.personLabel}</td><td data-label="Intrare">{moment(s.startedAt)}</td><td data-label="Ieșire">{s.endedAt ? moment(s.endedAt) : 'Sesiune activă'}</td><td data-label="Timp">{s.timeLabel}</td></tr>)}</tbody><tfoot><tr><th scope="row">TOTAL OPERAȚIE</th><td/><td/><td>{task.timeLabel}</td></tr></tfoot></table></section> : null}</> : record ? <p>Planul de execuție nu există încă.</p> : null}
    </section>;
}
