import type { KeyboardEvent, Ref } from "react";
import type { JobListItemTransport } from "../../api/types";
import type { CollectionViewState } from "../../components/collectionViewState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { InlineAlert } from "../../components/InlineAlert";
import { presentJobWorklistAction } from "../../presentation/worklistAction";
import { jobHref } from "../../routing/appRoute";
import { clickedControl, moveRowFocus } from "../desk/deskKeys";
import { DeskCaption, DeskDensity, DeskOptions, DeskSearch, DeskSkeleton, type Density } from "../desk/DeskToolbar";
import type { DeskLayout } from "../desk/useDeskLayout";
import { Deadline, MiniRoute, ProgressBar, StageLamp } from "./JobParts";
import { FOCUS_OPTIONS, hasJobFilter, jobContext, jobName, type JobFilters, type JobSort } from "./jobRegistryModel";

type Props = {
  layout: DeskLayout;
  view: CollectionViewState;
  refreshFailed: boolean;
  items: readonly JobListItemTransport[];
  total: number;
  filters: JobFilters;
  sort: JobSort;
  density: Density;
  selectedId: string | null;
  searchRef: Ref<HTMLInputElement>;
  onFilters: (next: JobFilters) => void;
  onSort: (next: JobSort) => void;
  onDensity: (next: Density) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (jobId: string) => void;
  onOpen: (jobId: string) => void;
};

/** The server's next step, shown only when it says more than the button. */
function NextStep({ job, actionLabel }: { job: JobListItemTransport; actionLabel: string }) {
  if (!job.nextActionLabel || job.nextActionLabel === actionLabel) return null;
  return <span className="rdesk-step">{`Pas următor: ${job.nextActionLabel}`}</span>;
}

function Attention({ job }: { job: JobListItemTransport }) {
  return job.attentionLabel ? <span className="rdesk-attention">{job.attentionLabel}</span> : null;
}

function Table({ items, selectedId, onSelect }: Props) {
  return (
    <table className="rdesk-table jline-table">
      <caption className="u-visually-hidden">Lista de lucrări</caption>
      <thead>
        <tr>
          <th scope="col">Lucrare · client</th>
          <th scope="col" className="jline-table__route">Etapă · traseu</th>
          <th scope="col" className="jline-table__action" data-align="end">Acțiune</th>
        </tr>
      </thead>
      <tbody>
        {items.map((job) => {
          const action = presentJobWorklistAction(job);
          const selected = job.jobId === selectedId;
          return (
            <tr
              key={job.jobId}
              data-row
              data-row-id={job.jobId}
              data-selected={selected || undefined}
              data-attention={job.needsAttention || undefined}
              tabIndex={0}
              aria-selected={selected}
              aria-label={`Previzualizează lucrarea ${jobName(job)}`}
              aria-controls="lucrari-dosar"
              onClick={(event) => {
                if (clickedControl(event) || window.getSelection()?.toString()) return;
                onSelect(job.jobId);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(job.jobId);
                } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveRowFocus(event.currentTarget, event.key === "ArrowDown" ? 1 : -1, onSelect);
                }
              }}
            >
              <td>
                <a className="rdesk-title jline-title" href={jobHref(job.jobId)} title={jobName(job)}>{jobName(job)}</a>
                <span className="rdesk-sub" title={jobContext(job)}>{jobContext(job)}</span>
                <Deadline job={job} />
                <Attention job={job} />
              </td>
              <td className="jline-table__route">
                <StageLamp job={job} />
                <MiniRoute job={job} />
                <ProgressBar job={job} />
              </td>
              <td className="jline-table__action" data-align="end">
                <a className="rdesk-next" data-priority={job.needsAttention || undefined} href={action.actionHref}>
                  <span>{action.actionLabel}</span>
                  <span aria-hidden="true">→</span>
                </a>
                <NextStep job={job} actionLabel={action.actionLabel} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DoorIcon({ kind }: { kind: "sheet" | "operations" | "done" }) {
  if (kind === "operations") {
    return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3.5 6.5h13v10h-13zM7 6.5V4h6v2.5M3.5 10.5h13" /></svg>;
  }
  if (kind === "done") {
    return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>;
  }
  return <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 2.75h10v14.5H5zM8 2.75v2h4v-2M7.5 9h5M7.5 12h5" /></svg>;
}

function Cards({ items, selectedId, onOpen }: Props) {
  return (
    <ul className="rdesk-cards">
      {items.map((job) => {
        const action = presentJobWorklistAction(job);
        const sheetHref = jobHref(job.jobId);
        const separate = action.actionHref !== sheetHref;
        const done = job.nextAction === "VIEW_COMPLETED";
        return (
          <li key={job.jobId} className="rdesk-card" data-attention={job.needsAttention || undefined} data-selected={job.jobId === selectedId || undefined}>
            <button
              type="button"
              className="rdesk-card__open"
              data-row-id={job.jobId}
              aria-haspopup="dialog"
              aria-label={`Deschide dosarul lucrării ${jobName(job)}`}
              onClick={() => onOpen(job.jobId)}
            >
              <span className="jline-card__title">{jobName(job)}</span>
              <span className="rdesk-sub">{jobContext(job)}</span>
              <span className="jline-card__route">
                <StageLamp job={job} />
                <MiniRoute job={job} />
              </span>
              <ProgressBar job={job} />
              <NextStep job={job} actionLabel={action.actionLabel} />
              <Deadline job={job} />
              <Attention job={job} />
            </button>
            <div className="rdesk-card__doors">
              <a className="rdesk-door" data-next href={action.actionHref}>
                <DoorIcon kind={separate ? "operations" : done ? "done" : "sheet"} />
                <span>
                  <strong>{action.actionLabel}</strong>
                  <small>{separate ? "Secțiunea Operații" : done ? "Fișa lucrării · consultare" : "Fișa lucrării"}</small>
                </span>
              </a>
              {separate ? (
                <a className="rdesk-door" href={sheetHref}>
                  <DoorIcon kind="sheet" />
                  <span><strong>Fișa lucrării</strong><small>Toate secțiunile</small></span>
                </a>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The register: search, view filter, density, then rows (wide) or cards (narrow). */
export function JobsRegister(props: Props) {
  const { layout, view, refreshFailed, filters, sort, density, searchRef, onFilters, onSort, onDensity, onReset, onRetry, items, total } = props;
  const ready = view !== "loading" && view !== "error";
  return (
    <section className="rdesk-register" aria-label="Registru de producție" data-register data-scroll-memory="registru">
      <div className="rdesk-toolbar">
        <DeskSearch
          id="lucrari-cauta"
          placeholder="Caută lucrare, client sau produs"
          value={filters.query}
          layout={layout}
          inputRef={searchRef}
          onChange={(query) => onFilters({ ...filters, query })}
        />
        <DeskOptions label="Vedere" layout={layout} options={FOCUS_OPTIONS} value={filters.focus} onChange={(focus) => onFilters({ ...filters, focus })} />
        {layout === "docked" ? <DeskDensity value={density} onChange={onDensity} /> : null}
      </div>
      {refreshFailed && total > 0 ? (
        <InlineAlert tone="error" title="Lista nu a putut fi actualizată">
          Datele afișate sunt de la ultima citire reușită.
          <button type="button" className="quiet-action" onClick={onRetry}>Reîncearcă</button>
        </InlineAlert>
      ) : null}
      <DeskCaption
        title={filters.attention ? "Necesită acțiune" : "Lista de lucrări"}
        count={ready ? `${items.length} din ${total}` : "Se citesc lucrările"}
        showReset={hasJobFilter(filters)}
        onReset={onReset}
        keys={layout === "docked"}
      >
        <button type="button" className="rdesk-sort" onClick={() => onSort(sort === "newest" ? "oldest" : "newest")}>
          <span>Ordine</span>
          <span>{sort === "newest" ? "Cele mai noi ↓" : "Cele mai vechi ↑"}</span>
        </button>
      </DeskCaption>
      <div aria-busy={view === "loading" || view === "refreshing"}>
        {view === "error" ? (
          <ErrorState title="Lucrările nu au putut fi citite">
            Lista de lucrări nu este disponibilă.
            <button type="button" className="quiet-action" onClick={onRetry}>Reîncearcă</button>
          </ErrorState>
        ) : view === "empty" ? (
          <EmptyState title="Nu există lucrări." description="Lucrările apar aici după confirmarea unei comenzi." />
        ) : view === "loading" ? (
          <DeskSkeleton />
        ) : view === "filtered-empty" ? (
          <div className="rdesk-empty">
            <EmptyState
              title="Nicio lucrare nu corespunde filtrului."
              description="Schimbă căutarea, stația sau vederea ori resetează filtrele."
              action={<button type="button" className="rdesk-reset" onClick={onReset}>Afișează toate lucrările</button>}
            />
          </div>
        ) : layout === "docked" ? (
          <Table {...props} />
        ) : (
          <Cards {...props} />
        )}
      </div>
    </section>
  );
}
