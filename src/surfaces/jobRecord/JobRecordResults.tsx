import type { WorkHoursTask } from '../../api/jobRecord';
import { Heading } from './presentation';

export function JobRecordResults({ tasks, operationHref }: { tasks: WorkHoursTask[]; operationHref: (id: string) => string }) {
  const results = tasks.filter(t => t.plannedQuantity || t.completedQuantityLabel || t.varianceLabel || t.plannedConsumption?.length || t.actualConsumption.length || t.qualityLabel);
  return <section id="rezultate" className="job-record__section" aria-label="Rezultatele lucrării">
    <header><div><Heading icon="check">Rezultatele lucrării</Heading><p>Cantități, consumuri și control, comparate cu planul inițial.</p></div></header>
    {results.length ? <table className="job-record__table job-record__results">
      <caption className="u-visually-hidden">Cantități și materiale pe operație</caption>
      <thead><tr><th scope="col">Operație</th><th scope="col">Cantități</th><th scope="col">Materiale</th><th scope="col">Control și diferențe</th></tr></thead>
      <tbody>{results.map(t => <tr key={t.taskId}>
        <td data-label="Operație"><a href={operationHref(t.taskId)}>{t.seqLabel} · {t.processLabel}</a><p>{t.scopeLabel} · {t.statusLabel}</p></td>
        <td data-label="Cantități">{t.plannedQuantity ? <p>Planificat: {t.plannedQuantity.value.toLocaleString('ro-RO')} {t.plannedQuantity.unit}</p> : null}<p>{t.completedQuantityLabel ?? 'Realizat: neînregistrat'}</p></td>
        <td data-label="Materiale">{t.plannedConsumption?.length ? <ul aria-label="Consum planificat">{t.plannedConsumption.map((a, i) => <li key={i}>Planificat · {a.resourceLabel}: {a.quantity.toLocaleString('ro-RO')} {a.unit}</li>)}</ul> : null}{t.actualConsumption.length ? <ul aria-label="Consum efectiv">{t.actualConsumption.map((a, i) => <li key={i}>Efectiv · {a.resourceLabel}: {a.actualQuantity.toLocaleString('ro-RO')} {a.unit}</li>)}</ul> : <p>Fără consum înregistrat</p>}</td>
        <td data-label="Control și diferențe">{t.qualityLabel ? <p>{t.qualityLabel}</p> : null}{t.varianceLabel ? <p>{t.varianceLabel}</p> : null}{!t.qualityLabel && !t.varianceLabel ? <p>Fără înregistrări</p> : null}</td>
      </tr>)}</tbody>
    </table> : <p className="job-record__empty">Nu există încă rezultate sau cantități planificate.</p>}
  </section>;
}
