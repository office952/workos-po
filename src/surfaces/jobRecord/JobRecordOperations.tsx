import { createPortal } from "react-dom";
import { Fragment, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { JobRecord, WorkHoursTask } from "../../api/jobRecord";
import { Button } from "../../components/Button";
import { InlineAlert } from "../../components/InlineAlert";
import { exportHours } from "./exportHours";
import { moment } from "./format";
import { Heading } from "./presentation";

function quantityText(task: WorkHoursTask): string {
  if (!task.plannedQuantity) return "Planificat: neînregistrat";
  return `Planificat: ${task.plannedQuantity.value.toLocaleString("ro-RO")} ${task.plannedQuantity.unit}`;
}

function OperationEvidence({ task }: { task: WorkHoursTask }) {
  return (
    <>
      <h4>Rezultate</h4>
      <div className="job-record__facts-grid">
        <div>
          <h5>Cantități</h5>
          <p>{quantityText(task)}</p>
          <p>{task.completedQuantityLabel ?? "Realizat: neînregistrat"}</p>
          {task.varianceLabel ? <p>{task.varianceLabel}</p> : null}
        </div>
        <div>
          <h5>Consumuri</h5>
          {task.plannedConsumption?.length ? (
            <ul aria-label="Consum planificat">
              {task.plannedConsumption.map((item, index) => (
                <li key={`${item.resourceLabel}-${index}`}>Planificat · {item.resourceLabel}: {item.quantity.toLocaleString("ro-RO")} {item.unit}</li>
              ))}
            </ul>
          ) : <p>Consum planificat: neînregistrat</p>}
          {task.actualConsumption.length ? (
            <ul aria-label="Consum efectiv">
              {task.actualConsumption.map((item, index) => (
                <li key={`${item.resourceLabel}-${index}`}>Efectiv · {item.resourceLabel}: {item.actualQuantity.toLocaleString("ro-RO")} {item.unit}</li>
              ))}
            </ul>
          ) : <p>Fără consum înregistrat</p>}
        </div>
        <div>
          <h5>Control</h5>
          {task.qualityLabel ? <p>{task.qualityLabel}</p> : null}
          {!task.qualityLabel ? <p>Control neînregistrat</p> : null}
        </div>
      </div>
      <h4>Sesiuni</h4>
      {task.sessions.length ? (
        <table className="job-record__table">
          <caption className="u-visually-hidden">Sesiuni pentru {task.seqLabel} · {task.processLabel}</caption>
          <thead><tr><th>Persoană</th><th>Intrare</th><th>Ieșire</th><th>Timp</th></tr></thead>
          <tbody>
            {task.sessions.map((session) => (
              <tr key={session.sessionId}>
                <td data-label="Persoană">{session.personLabel}</td>
                <td data-label="Intrare">{moment(session.startedAt)}</td>
                <td data-label="Ieșire">{session.endedAt ? moment(session.endedAt) : "Sesiune activă"}</td>
                <td data-label="Timp">{session.timeLabel}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th scope="row">TOTAL OPERAȚIE</th><td /><td /><td>{task.timeLabel}</td></tr></tfoot>
        </table>
      ) : <p>Fără sesiuni înregistrate. Orele lipsă rămân neînregistrate.</p>}
    </>
  );
}

export function JobRecordOperations({
  record,
  selectedTaskId,
  selectedLabel,
  invalidTask,
  planUnavailable,
  workspaceHref,
  onOpen,
  onClose,
  dossier,
}: {
  record: JobRecord | null;
  selectedTaskId: string | null;
  selectedLabel: string | null;
  invalidTask: boolean;
  planUnavailable: boolean;
  workspaceHref: string | null;
  onOpen: (taskId: string) => void;
  onClose: () => void;
  dossier: ReactNode;
}) {
  const detailId = useId();
  const hours = record?.hours ?? null;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const selected = hours?.tasks.find((task) => task.taskId === selectedTaskId) ?? null;
  function matches(task: WorkHoursTask, text: string, status: string) {
    return (status === 'ALL' || task.status === status) &&
      [task.seqLabel, task.processLabel, task.scopeLabel, task.providerLabel, ...task.people.map(person => person.label)]
        .join(' ').toLocaleLowerCase('ro').includes(text.trim().toLocaleLowerCase('ro'));
  }
  const visibleTasks = hours?.tasks.filter(task => matches(task, query, filter)) ?? [];
  function changeFilter(text: string, status: string) {
    setQuery(text);
    setFilter(status);
    if (selected && !matches(selected, text, status)) onClose();
  }
  const toggles = useRef(new Map<string, HTMLButtonElement>());
  const rootRef = useRef<HTMLElement>(null);
  const standbyRef = useRef<HTMLDivElement>(null);
  const [host] = useState(() => {
    const node = document.createElement("div");
    node.className = "job-record__detail-host";
    return node;
  });
  const open = Boolean(selectedTaskId);
  const [placed, setPlaced] = useState(false);
  const label = selected ? `${selected.seqLabel} · ${selected.processLabel}` : selectedLabel;

  useLayoutEffect(() => {
    const slot = rootRef.current?.querySelector<HTMLElement>("[data-detail-slot='open']");
    const destination = slot ?? standbyRef.current;
    const active = document.activeElement;
    const movingFocus = active instanceof HTMLElement && host.contains(active) ? active : null;
    const moved = Boolean(destination && host.parentElement !== destination);
    if (moved && destination) destination.appendChild(host);
    if (moved && movingFocus && document.activeElement !== movingFocus) movingFocus.focus();
    const nextPlaced = Boolean(slot && host.parentElement === slot);
    setPlaced((current) => current === nextPlaced ? current : nextPlaced);
  }, [host, selectedTaskId, record]);

  function close() {
    if (selectedTaskId) toggles.current.get(selectedTaskId)?.focus();
    onClose();
  }

  const detail = open || dossier ? createPortal(
    <section id={detailId} className="job-record__operation-detail" aria-label="Dosarul operației selectate">
      <header>
        <h3>{label ?? "Operație"}</h3>
        <Button variant="secondary" onClick={close}>Închide detaliul</Button>
      </header>
      {selected ? <p>{selected.scopeLabel} · {selected.statusLabel}</p> : null}
      {workspaceHref ? <a className="job-sheet__link-button" href={workspaceHref}>Deschide operația în Atelier</a> : null}
      {selected ? <OperationEvidence task={selected} /> : open ? <p>Rezultatele și sesiunile se afișează după citirea evidenței.</p> : null}
      {dossier}
    </section>,
    host,
  ) : null;

  return (
    <section ref={rootRef} className="job-record__section" aria-label="Operațiile lucrării">
      <header>
        <div>
          <Heading icon="hours">Operațiile lucrării</Heading>
          <p>Stare, participanți și timp. Deschide o operație pentru rezultate și dosar.</p>
        </div>
        {hours && record ? <Button variant="secondary" onClick={() => exportHours(record)}>Exportă orele CSV</Button> : null}
      </header>
      {planUnavailable ? <InlineAlert tone="error" title="Operațiile nu au putut fi citite">Drepturile și detaliile operațiilor nu sunt disponibile.</InlineAlert> : null}
      {invalidTask ? <InlineAlert tone="error" title="Operația nu există în această lucrare">Linkul nu a fost înlocuit cu altă operație.</InlineAlert> : null}
      {hours ? <div className="job-record__operation-toolbar">
        <label className="job-record__search">Caută operație, componentă sau persoană<input type="search" value={query} onChange={event => changeFilter(event.target.value, filter)}/></label>
        <div className="job-plan__filters" role="group" aria-label="Filtrează operațiile">
          {[['ALL', 'Toate'], ['IN_PROGRESS', 'În lucru'], ['COMPLETED', 'Finalizate']].map(([status, label]) => <button key={status} type="button" aria-pressed={filter === status} onClick={() => changeFilter(query, status!)}>{label} · {hours.tasks.filter(task => status === 'ALL' || task.status === status).length}</button>)}
        </div>
      </div> : null}
      {hours ? (
        <table className="job-record__table job-record__operations-table">
          <caption className="u-visually-hidden">Registrul operațiilor</caption>
          <thead><tr><th scope="col">Operație / componentă</th><th scope="col">Stare</th><th scope="col">Participanți</th><th scope="col">Ore</th><th scope="col">Început / final</th></tr></thead>
          <tbody>
            {visibleTasks.map((task) => {
              const expanded = task.taskId === selectedTaskId;
              return (
                <Fragment key={task.taskId}>
                  <tr data-selected={expanded}>
                    <td data-label="Operație">
                      <button
                        type="button"
                        className="job-record__operation-toggle"
                        aria-expanded={expanded}
                        aria-controls={expanded ? detailId : undefined}
                        ref={(node) => { if (node) toggles.current.set(task.taskId, node); else toggles.current.delete(task.taskId); }}
                        onClick={() => expanded ? close() : onOpen(task.taskId)}
                      >
                        {task.seqLabel} · {task.processLabel}
                      </button>
                      <p>{task.scopeLabel}{task.providerLabel || task.externalProviderLabel ? ` · ${task.externalProviderLabel ?? task.providerLabel}` : ''}</p>
                    </td>
                    <td data-label="Stare"><span className="job-record__status" data-status={task.status}>{task.statusLabel}</span></td>
                    <td data-label="Participanți">{task.people.length ? task.people.map((person) => <p key={person.personId}>{person.label} · {person.timeLabel}{person.active ? " · activ" : ""}</p>) : "Fără sesiuni înregistrate"}</td>
                    <td data-label="Ore">
                      <p className="job-record__hours"><span>Oameni</span><strong>{task.timeLabel}</strong></p>
                      {!task.complete ? <p>{task.coverageLabel}</p> : null}
                      {task.declaredDurationLabel ? <p>Durată declarată: {task.declaredDurationLabel}</p> : null}
                      <p>Utilaj: {task.machineTimeLabel ?? "Fără rulări înregistrate"}</p>
                    </td>
                    <td data-label="Început / final">
                      <span className="job-record__date">Început: {moment(task.startedAt)}</span>
                      <span className="job-record__date">Final: {moment(task.completedAt)}</span>
                    </td>
                  </tr>
                  <tr hidden={!expanded} className="job-record__detail-row">
                    <td colSpan={5}><div data-detail-slot={expanded ? "open" : "closed"} /></td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">TOTAL ÎNREGISTRAT</th>
              <td>{hours.coverageLabel}</td>
              <td>{hours.people.length} persoane</td>
              <td><p className="job-record__hours"><span>Oameni</span><strong>{hours.totalLabel}</strong></p><p>Utilaj: {hours.machineTimeLabel}</p></td>
              <td><span className="job-record__date">Început: {moment(hours.startedAt)}</span><span className="job-record__date">Final: {moment(hours.completedAt)}</span></td>
            </tr>
          </tfoot>
        </table>
      ) : record ? <p>Planul de execuție nu există încă.</p> : null}
      {hours && !visibleTasks.length ? <p role="status">Nicio operație nu corespunde filtrelor.</p> : null}
      {hours ? <section className="job-record__print-sheet" hidden aria-label="Rezultatele operațiilor pentru tipărire">
        <h2>Rezultatele operațiilor</h2>
        {hours.tasks.map((task) => <article key={task.taskId}>
          <h3>{task.seqLabel} · {task.processLabel}</h3>
          <p>{task.scopeLabel} · {task.statusLabel}</p>
          <p>Oameni: {task.timeLabel}</p>
          <p>{task.coverageLabel}</p>
          {task.declaredDurationLabel ? <p>Durată declarată: {task.declaredDurationLabel}</p> : null}
          <p>Utilaj: {task.machineTimeLabel ?? "Fără rulări înregistrate"}</p>
          <p>Început: {moment(task.startedAt)}</p>
          <p>Final: {moment(task.completedAt)}</p>
          <OperationEvidence task={task} />
        </article>)}
      </section> : null}
      <div ref={standbyRef} hidden={placed || !open} />
      {detail}
    </section>
  );
}
