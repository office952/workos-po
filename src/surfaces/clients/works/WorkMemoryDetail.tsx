import { useId, type MouseEvent } from "react";
import type { WorkItem } from "../../../adapters/customerDossierAdapter";
import { loadJobRecord, type JobRecord } from "../../../api/jobRecord";
import { resourceKeys } from "../../../data/resourceKeys";
import { useResource } from "../../../data/useResource";
import { clientHref } from "../../../routing/appRoute";
import { hrefPath, originBack } from "../../../routing/originBack";
import { navigate } from "../../../routing/navigate";
import type { BandMode } from "../dossier/bandModel";
import { DossierIcon } from "../dossier/dossierIcons";
import { follow } from "../dossier/history/follow";
import { countLabel } from "../dossier/historyModel";
import { clientListHref, type ListContext } from "../dossier/listContext";
import { MemoryEvents } from "./memory/MemoryEvents";
import { MemoryFiles } from "./memory/MemoryFiles";
import { MemoryHeader } from "./memory/MemoryHeader";
import { MemoryOperations } from "./memory/MemoryOperations";
import { MemoryProgress } from "./memory/MemoryProgress";
import { MemoryTabs } from "./memory/MemoryTabs";
import { useWorks } from "./useWorks";
import {
  eventFields,
  fileDocuments,
  fileFields,
  MEMORY_TAB_PARAM,
  memoryMatches,
  planPresence,
  planSentence,
  readMemoryTab,
  recordCountsLine,
  taskFields,
  withMemoryParam,
  type MemoryTab,
} from "./workMemoryModel";
import { listTrail } from "./worksModel";
import "../../../styles/surfaces/client-work-memory.css";

const SEARCH_PARAM = "gaseste";

function originKind(href: string, customerId: string): "istoric" | "lucrari" | "cereri" | null {
  if (hrefPath(href) !== hrefPath(clientHref(customerId))) return null;
  const section = new URL(href, window.location.origin).searchParams.get("sectiune");
  if (!section || section === "istoric") return "istoric";
  if (section === "cereri") return "cereri";
  return section === "lucrari" && !new URL(href, window.location.origin).searchParams.get("lucrare") ? "lucrari" : null;
}

/**
 * R-005 · Memoria lucrării (WorkOS-N 1037:37929 · telefon 1042:39258 · tabletă 1042:39717): the
 * second level between the client's works and the job sheet. Reads the client's work and the
 * existing job record. It does not write, price, or invent payment, invoicing, delivery or a person
 * who was not recorded; the job sheet in Lucrări stays the only place where the job is managed.
 */
export function WorkMemoryDetail({
  customerId,
  clientName,
  jobId,
  context,
  search,
  mode,
}: {
  customerId: string;
  clientName: string | null;
  jobId: string;
  context: ListContext;
  search: string;
  mode: BandMode;
}) {
  const works = useWorks(customerId, { id: `job:${jobId}`, pageSize: 1 });
  const item = works.data?.items[0]?.job?.jobId === jobId ? works.data.items[0] : undefined;
  const record = useResource(item ? resourceKeys.jobRecord(jobId) : null, () => loadJobRecord(jobId));
  const trail = listTrail(context, "Lucrările clientului");
  const back = originBack({ href: clientListHref(customerId, "lucrari", context), label: trail }, (href) => originKind(href, customerId) !== null);
  const origin = originKind(back.href, customerId);
  const backLabel = back.onClick && origin === "istoric" ? "Istoric" : back.onClick && origin === "cereri" ? "Cereri și oferte" : trail;
  const [backHead, ...backRest] = backLabel.split(" · ");
  const compact = mode !== "desktop";
  const replaceParam = (name: string, value: string | null) => navigate(`${window.location.pathname}${withMemoryParam(search, name, value)}`, "replace");
  const onBack = back.onClick ?? ((event: MouseEvent<HTMLAnchorElement>) => follow(event, back.href));

  return (
    <div className="dwdetail wmem" data-mode={mode}>
      {compact ? (
        <a className="wmem-bar" href={back.href} onClick={onBack}>
          <DossierIcon name="left" size={18} />
          <span className="wmem-bar__text">
            {clientName ? <span className="wmem-bar__client">{clientName}</span> : null}{" "}
            <span className="wmem-bar__trail">{backLabel}</span>
          </span>
        </a>
      ) : (
        <div className="wmem-context">
          <a className="wmem-back" href={back.href} onClick={onBack}>
            <DossierIcon name="left" size={16} />
            <strong>{backHead}</strong>
            {backRest.length ? <span>{` · ${backRest.join(" · ")}`}</span> : null}
          </a>
          <p className="wmem-kicker">Memoria lucrării · doar citire</p>
        </div>
      )}
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
      {item ? (
        <MemoryBody
          item={item}
          jobId={jobId}
          record={record.data ?? null}
          recordError={record.status === "error"}
          query={new URLSearchParams(search).get(SEARCH_PARAM) ?? ""}
          onQuery={(value) => replaceParam(SEARCH_PARAM, value || null)}
          tab={readMemoryTab(search)}
          onTab={(tab) => replaceParam(MEMORY_TAB_PARAM, tab === "operatii" ? null : tab)}
          mode={mode}
        />
      ) : null}
      <p className="wmem-claim">
        <DossierIcon name="warning" size={14} />
        Lucrarea rămâne așa cum a fost înregistrată; o comandă repetată este o lucrare nouă. Plata, facturarea, livrarea și montajul nu sunt afirmate aici.
      </p>
    </div>
  );
}

function MemoryBody({
  item,
  jobId,
  record,
  recordError,
  query,
  onQuery,
  tab,
  onTab,
  mode,
}: {
  item: WorkItem;
  jobId: string;
  record: JobRecord | null;
  recordError: boolean;
  query: string;
  onQuery: (value: string) => void;
  tab: MemoryTab;
  onTab: (tab: MemoryTab) => void;
  mode: BandMode;
}) {
  const searchId = useId();
  const idBase = useId().replace(/:/g, "");
  const compact = mode !== "desktop";
  return (
    <article className="wmem-body" aria-labelledby="wmem-title">
      <MemoryHeader item={item} jobId={jobId}>
        <MemoryProgress hours={record ? record.hours : undefined} fallback={item.job?.progressLabel ?? null} />
      </MemoryHeader>
      {recordError && !record ? (
        <div className="dworks__state" role="alert">
          <p className="dworks__state-title">Dosarul tehnic nu a putut fi citit.</p>
          <p>Identitatea lucrării rămâne cea a clientului. Operațiile, orele și fișierele nu sunt afișate ca zero.</p>
        </div>
      ) : null}
      {!record && !recordError ? <p className="dworks__state" role="status">Se citește dosarul înregistrat…</p> : null}
      {record ? <RecordedDossier jobId={jobId} record={record} query={query} onQuery={onQuery} searchId={searchId} idBase={idBase} tab={compact ? tab : null} onTab={onTab} mode={mode} /> : null}
    </article>
  );
}

function RecordedDossier({
  jobId,
  record,
  query,
  onQuery,
  searchId,
  idBase,
  tab,
  onTab,
  mode,
}: {
  jobId: string;
  record: JobRecord;
  query: string;
  onQuery: (value: string) => void;
  searchId: string;
  idBase: string;
  /** The open tab on phone and tablet; null on desktop, where the three parts are side by side. */
  tab: MemoryTab | null;
  onTab: (tab: MemoryTab) => void;
  mode: BandMode;
}) {
  const searching = query.trim().length > 0;
  const quoted = `„${query.trim()}”`;
  const allTasks = record.hours?.tasks ?? [];
  const allDocuments = fileDocuments(record.files);
  const tasks = allTasks.filter((task) => memoryMatches(query, taskFields(task)));
  const documents = allDocuments.filter((document) => document.versions.some((version) => memoryMatches(query, fileFields(version.file))));
  const versions = documents.reduce((sum, document) => sum + document.versions.length, 0);
  const events = record.timeline.filter((event) => memoryMatches(query, eventFields(event)));
  const presence = planPresence(record.hours);
  const taskTotal = record.hours ? allTasks.length : null;
  const of = (shown: number, total: number) => (searching ? `${shown} din ${total}` : String(total));
  const counts: Record<MemoryTab, string> = {
    operatii: taskTotal === null ? "—" : of(tasks.length, taskTotal),
    fisiere: of(documents.length, allDocuments.length),
    evenimente: of(events.length, record.timeline.length),
  };
  const nothingFound = searching && tasks.length + documents.length + events.length === 0;
  const summary = searching ? `Rezultate pentru ${quoted}: ${recordCountsLine(tasks.length, documents.length, versions, events.length)}` : recordCountsLine(taskTotal, allDocuments.length, record.files.length, record.timeline.length);
  const panel = (value: MemoryTab) =>
    tab ? { id: `${idBase}-panel-${value}`, role: "tabpanel", "aria-labelledby": `${idBase}-tab-${value}`, hidden: tab !== value } : {};
  const opsEmpty = planSentence(presence) ?? (searching && !tasks.length ? `Nicio operație nu conține ${quoted}.` : null);

  return (
    <>
      <div className="wmem-find-row">
        <div className="wmem-find" role="search">
          <label htmlFor={searchId} className="u-visually-hidden">Caută în dosar</label>
          <DossierIcon name="search" size={16} />
          <input
            id={searchId}
            type="search"
            value={query}
            autoComplete="off"
            placeholder={mode === "desktop" ? "Caută în dosar: operație, fișier, eveniment, persoană" : "Caută în dosar…"}
            onChange={(event) => onQuery(event.target.value)}
          />
          {query ? (
            <button type="button" className="wmem-find__clear" onClick={() => { onQuery(""); document.getElementById(searchId)?.focus(); }}>
              <DossierIcon name="close" size={12} />
              <span className="u-visually-hidden">Șterge căutarea</span>
            </button>
          ) : null}
        </div>
        {tab ? null : <p className="wmem-summary">{summary}</p>}
      </div>
      {nothingFound ? <p className="wmem-empty" role="status">Niciun rezultat pentru textul căutat în dosarul înregistrat</p> : null}
      {tab ? <MemoryTabs idBase={idBase} active={tab} counts={counts} onSelect={onTab} /> : null}
      <div className="wmem-columns">
        <section className="wmem-part wmem-part--ops" aria-labelledby={`${idBase}-ops`} {...panel("operatii")}>
          <div className="wmem-part__head">
            <h4 id={`${idBase}-ops`} className={tab ? "u-visually-hidden" : undefined}>Operații</h4>
            {tab ? null : <span className="wmem-part__count">{counts.operatii}</span>}
            {presence === "recorded" ? <p className="wmem-part__note">{`Grupate după stare · numărul indică poziția în plan${tab ? "" : " · rândul deschide dosarul tehnic în Lucrări"}`}</p> : null}
          </div>
          <MemoryOperations jobId={jobId} tasks={tasks} files={record.files} mode={mode} emptyText={opsEmpty} searching={searching} />
        </section>
        <div className="wmem-side">
          <section className="wmem-part" aria-labelledby={`${idBase}-files`} {...panel("fisiere")}>
            <div className="wmem-part__head">
              <h4 id={`${idBase}-files`} className={tab ? "u-visually-hidden" : undefined}>Fișiere tehnice</h4>
              {tab ? null : <span className="wmem-part__count">{`${counts.fisiere} · ${countLabel(searching ? versions : record.files.length, "versiune", "versiuni")}`}</span>}
            </div>
            {record.files.length ? <p className="wmem-part__note">Asocierea cu o operație nu înseamnă utilizare. „Utilizat” apare doar când operatorul a declarat folosirea.</p> : null}
            {documents.length ? (
              <MemoryFiles documents={documents} tasks={allTasks} />
            ) : (
              <p className="wmem-empty">{searching && record.files.length ? `Niciun fișier nu conține ${quoted}.` : "Niciun fișier în dosarul tehnic"}</p>
            )}
          </section>
          <section className="wmem-part" aria-labelledby={`${idBase}-events`} {...panel("evenimente")}>
            <div className="wmem-part__head">
              <h4 id={`${idBase}-events`} className={tab ? "u-visually-hidden" : undefined}>Evenimente înregistrate</h4>
              {tab ? null : <span className="wmem-part__count">{counts.evenimente}</span>}
            </div>
            <MemoryEvents events={events} searching={searching} emptyText={searching && record.timeline.length ? `Niciun eveniment nu conține ${quoted}.` : "Niciun eveniment înregistrat"} />
          </section>
        </div>
      </div>
    </>
  );
}
