import { useId } from "react";
import type { WorkItem } from "../../../adapters/customerDossierAdapter";
import { loadJobRecord, type JobRecord, type WorkHoursTask } from "../../../api/jobRecord";
import { AuthenticatedDownloadLink } from "../../../presentation/AuthenticatedDownloadLink";
import { resourceKeys } from "../../../data/resourceKeys";
import { useResource } from "../../../data/useResource";
import { clientHref, jobHref, requestHref } from "../../../routing/appRoute";
import { hrefPath, originBack } from "../../../routing/originBack";
import { navigate } from "../../../routing/navigate";
import { formatDay } from "../dossier/dossierModel";
import { DossierIcon } from "../dossier/dossierIcons";
import { follow } from "../dossier/history/follow";
import { StateTag } from "../dossier/historyParts";
import { clientListHref, type ListContext } from "../dossier/listContext";
import { useWorks } from "./useWorks";
import { fileRevisionSentence, hoursSentence, memoryMatches, planPresence, planSentence, quantityLine, taskFields, usageSentence } from "./workMemoryModel";
import { listTrail, stateText } from "./worksModel";
import "../../../styles/surfaces/client-work-memory.css";

function originKind(href: string, customerId: string): "istoric" | "lucrari" | "cereri" | null {
  if (hrefPath(href) !== hrefPath(clientHref(customerId))) return null;
  const section = new URL(href, window.location.origin).searchParams.get("sectiune");
  if (!section || section === "istoric") return "istoric";
  if (section === "cereri") return "cereri";
  return section === "lucrari" && !new URL(href, window.location.origin).searchParams.get("lucrare") ? "lucrari" : null;
}

function taskTitle(task: WorkHoursTask): string {
  return [task.seqLabel, task.processLabel, task.scopeLabel].filter(Boolean).join(" · ");
}

/**
 * R-005 · Client → lucrare → dosarul înregistrat → dosarul tehnic al operației.
 * Reads the client's work and the existing job record. It does not write, price, or invent
 * payment, invoicing, delivery or a person who was not recorded.
 */
export function WorkMemoryDetail({ customerId, jobId, context, search }: { customerId: string; jobId: string; context: ListContext; search: string }) {
  const works = useWorks(customerId, { id: `job:${jobId}`, pageSize: 1 });
  const item = works.data?.items[0]?.job?.jobId === jobId ? works.data.items[0] : undefined;
  const record = useResource(item ? resourceKeys.jobRecord(jobId) : null, () => loadJobRecord(jobId));
  const query = new URLSearchParams(search).get("gaseste") ?? "";
  const searchId = useId();
  const trail = listTrail(context);
  const back = originBack({ href: clientListHref(customerId, "lucrari", context), label: trail }, (href) => originKind(href, customerId) !== null);
  const origin = originKind(back.href, customerId);
  const backText = back.onClick && origin === "istoric" ? "← Istoric" : back.onClick && origin === "cereri" ? "← Cereri și oferte" : `← ${trail}`;

  function setQuery(value: string) {
    const params = new URLSearchParams(search);
    if (value) params.set("gaseste", value);
    else params.delete("gaseste");
    const next = params.toString();
    navigate(`${window.location.pathname}${next ? `?${next}` : ""}`, "replace");
  }

  return (
    <div className="dwdetail wmem">
      <a className="dwdetail__back" href={back.href} onClick={back.onClick ?? ((event) => follow(event, back.href))}>
        {backText}
      </a>
      {works.status === "error" && !works.data ? (
        <div className="dworks__state" role="alert">
          <p className="dworks__state-title">Memoria lucrării nu a putut fi citită.</p>
          <button type="button" className="dworks__button" onClick={works.retry}>Încearcă din nou</button>
        </div>
      ) : null}
      {works.data && !item ? (
        <div className="dworks__state">
          <p className="dworks__state-title">Lucrarea nu există</p>
          <p>Înregistrarea nu aparține acestui client sau nu mai este disponibilă.</p>
        </div>
      ) : null}
      {!works.data && works.status !== "error" ? <p className="dworks__state" role="status">Se citește lucrarea…</p> : null}
      {item ? <MemoryBody item={item} jobId={jobId} record={record.data ?? null} recordError={record.status === "error"} query={query} searchId={searchId} onQuery={setQuery} /> : null}
    </div>
  );
}

function MemoryBody({
  item,
  jobId,
  record,
  recordError,
  query,
  searchId,
  onQuery,
}: {
  item: WorkItem;
  jobId: string;
  record: JobRecord | null;
  recordError: boolean;
  query: string;
  searchId: string;
  onQuery: (value: string) => void;
}) {
  const presence = record ? planPresence(record.hours) : null;
  const tasks = (record?.hours?.tasks ?? []).filter((task) => memoryMatches(query, taskFields(task)));
  const events = (record?.timeline ?? []).filter((event) => memoryMatches(query, [event.label, event.actorLabel, event.taskLabel, event.detail, formatDay(event.occurredAt)]));
  const files = (record?.files ?? []).filter((file) => memoryMatches(query, [file.originalFileName, file.purposeLabel, file.note, file.authorLabel, ...file.usages.map((usage) => usage.taskLabel)]));
  const dossierHref = jobHref(jobId, { section: "situatie" });
  const planHref = jobHref(jobId, { section: "operatii" });
  const filesHref = jobHref(jobId, { section: "fisiere" });
  const searching = query.trim().length > 0;

  return (
    <article className="dwdetail__card" aria-labelledby="wmem-title">
      <p className="dwdetail__eyebrow">
        <span className="dwdetail__badge">
          <DossierIcon name="wrench" size={12} />
          În WorkOS
        </span>
        {item.reference ? <span>{item.reference}</span> : null}
      </p>
      <h3 id="wmem-title" className="dwdetail__title">{item.title}</h3>
      {item.detail && item.detail !== item.title ? <p className="dwdetail__description">{item.detail}</p> : null}
      <dl className="dwdetail__facts">
        <div>
          <dt>Stare</dt>
          <dd><StateTag state={item.state} label={stateText(item)} /></dd>
        </div>
        <div>
          <dt>Sediu la momentul lucrării</dt>
          <dd>{item.site ? `${item.site.name}${item.siteAtTimeLabel ? ` · ${item.siteAtTimeLabel}` : ""}` : "Sediu neînregistrat"}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{item.eventDateLabel}</dd>
        </div>
        <div>
          <dt>Progres</dt>
          <dd>{item.job?.progressLabel ?? "Progres neînregistrat"}</dd>
        </div>
      </dl>
      <p className="wmem__note">Lucrarea rămâne așa cum a fost înregistrată. O comandă repetată este o lucrare nouă. Plata, facturarea, livrarea și montajul nu sunt afirmate aici.</p>
      <p className="wmem__meta">
        {item.request ? <a href={requestHref(item.request.requestId)} onClick={(event) => follow(event, requestHref(item.request!.requestId))}>{`Cerere ${item.request.reference}`}</a> : <span>Cerere neînregistrată</span>}
        {item.quote ? <span>{`Ofertă ${item.quote.reference}`}</span> : <span>Ofertă neînregistrată</span>}
      </p>
      <nav className="wmem__ways" aria-label="Dosarul lucrării">
        <a href={dossierHref} onClick={(event) => follow(event, dossierHref)}>Dosar general</a>
        <a href={planHref} onClick={(event) => follow(event, planHref)}>Plan și operații</a>
        <a href={filesHref} onClick={(event) => follow(event, filesHref)}>Fișierele lucrării</a>
      </nav>
      {recordError && !record ? (
        <div className="dworks__state" role="alert">
          <p className="dworks__state-title">Dosarul tehnic nu a putut fi citit.</p>
          <p>Identitatea lucrării rămâne cea a clientului. Operațiile, orele și fișierele nu sunt afișate ca zero.</p>
        </div>
      ) : null}
      {!record && !recordError ? <p className="dworks__state" role="status">Se citește dosarul înregistrat…</p> : null}
      {record ? (
        <>
          <label className="wmem__find" htmlFor={searchId}>
            <DossierIcon name="search" size={14} />
            <input id={searchId} type="search" value={query} autoComplete="off" placeholder="Caută în dosar: operație, fișier, eveniment" onChange={(event) => onQuery(event.target.value)} />
          </label>
          <p className="wmem__note">{hoursSentence(record.hours)}</p>
          {searching && tasks.length + events.length + files.length === 0 ? <p className="wmem__empty" role="status">Niciun rezultat pentru textul căutat în dosarul înregistrat</p> : null}
          <section className="wmem__block" aria-labelledby="wmem-tasks">
            <h3 id="wmem-tasks">Operații</h3>
            {presence && planSentence(presence) ? <p className="wmem__empty">{planSentence(presence)}</p> : null}
            {tasks.length ? (
              <ol className="wmem__list">
                {tasks.map((task) => {
                  const href = jobHref(jobId, { section: "operatii", taskId: task.taskId });
                  return (
                    <li key={task.taskId} className="wmem__row">
                      <strong>{taskTitle(task)}</strong>
                      <p>{[task.statusLabel, task.timeLabel, task.qualityLabel].filter(Boolean).join(" · ")}</p>
                      {task.completedQuantityLabel ? <p>{task.completedQuantityLabel}</p> : null}
                      {task.varianceLabel ? <p>{task.varianceLabel}</p> : null}
                      {(task.plannedConsumption ?? []).map((row) => <p key={`plan-${row.resourceLabel}`}>{quantityLine("Prevăzut", row.quantity, row.unit)}{` · ${row.resourceLabel}`}</p>)}
                      {task.actualConsumption.map((row) => <p key={`actual-${row.resourceLabel}`}>{quantityLine("Consum", row.actualQuantity, row.unit)}{` · ${row.resourceLabel}`}</p>)}
                      {task.actualConsumption.length === 0 && (task.plannedConsumption ?? []).length === 0 ? <p>Consum neînregistrat</p> : null}
                      <a href={href} onClick={(event) => follow(event, href)}>{`Dosarul tehnic · ${task.seqLabel}`}</a>
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
          <section className="wmem__block" aria-labelledby="wmem-events">
            <h3 id="wmem-events">Evenimente înregistrate</h3>
            {!searching && events.length === 0 ? <p className="wmem__empty">Niciun eveniment înregistrat</p> : null}
            {events.length ? (
              <ol className="wmem__list">
                {events.map((event) => {
                  const href = event.taskId ? jobHref(jobId, { section: "operatii", taskId: event.taskId }) : null;
                  return (
                    <li key={event.eventId} className="wmem__row">
                      <strong>{event.label}</strong>
                      <p>{[formatDay(event.occurredAt), event.actorLabel, event.taskLabel, event.detail].filter(Boolean).join(" · ")}</p>
                      {href ? <a href={href} onClick={(click) => follow(click, href)}>Dosarul tehnic al operației</a> : null}
                    </li>
                  );
                })}
              </ol>
            ) : null}
          </section>
          <section className="wmem__block" aria-labelledby="wmem-files">
            <h3 id="wmem-files">Fișiere în dosarul tehnic</h3>
            {!searching && files.length === 0 ? <p className="wmem__empty">Niciun fișier în dosarul tehnic</p> : null}
            {files.length ? (
              <ul className="wmem__list">
                {files.map((file) => {
                  const href = jobHref(jobId, { section: "fisiere", fileId: file.artifactId });
                  return (
                    <li key={file.artifactId} className="wmem__row">
                      <a href={href} onClick={(event) => follow(event, href)}>{file.originalFileName}</a>
                      <p>{fileRevisionSentence(file, record.files)}</p>
                      <p>{[file.purposeLabel, file.sizeLabel, file.authorLabel ? file.authorLabel : "Autor neînregistrat", formatDay(file.uploadedAt)].filter(Boolean).join(" · ")}</p>
                      {file.usages.length === 0 ? <p>Asociat lucrării · fără utilizare înregistrată pe operații</p> : null}
                      {file.usages.map((usage) => {
                        const taskHref = jobHref(jobId, { section: "operatii", taskId: usage.taskId });
                        return (
                          <div key={usage.taskId}>
                            <p><a href={taskHref} onClick={(event) => follow(event, taskHref)}>{usage.taskLabel}</a></p>
                            <p>{usageSentence(usage.usedAt)}</p>
                          </div>
                        );
                      })}
                      <AuthenticatedDownloadLink href={file.downloadHref}>Descarcă această versiune</AuthenticatedDownloadLink>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        </>
      ) : null}
    </article>
  );
}
