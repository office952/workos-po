import { useMemo, useRef, useState } from "react";
import type { JobListItemTransport } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { collectionViewState } from "../components/collectionViewState";
import { resourceKeys } from "../data/resourceKeys";
import { loadJobList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { PageHeader } from "../layout/PageHeader";
import { PageRegion } from "../layout/PageRegion";
import { formatTimestamp } from "../presentation/format";
import { matchesSearch } from "../presentation/listFilter";
import { presentJobWorklistAction } from "../presentation/worklistAction";
import { jobHref } from "../routing/appRoute";
import travelerTop from "../assets/work-traveler-top.svg";
import travelerFoot from "../assets/work-traveler-foot.svg";
import "../styles/surfaces/jobs.css";

const FILTERS = [
  { id: "all", label: "Toate" },
  { id: "needs-action", label: "Necesită acțiune" },
  { id: "urgent", label: "Urgente" },
  { id: "overdue", label: "Termen depășit" },
  { id: "in-execution", label: "În execuție" },
  { id: "completed", label: "Finalizate" },
] as const;

type JobFilter = (typeof FILTERS)[number]["id"];
type JobSort = "newest" | "oldest";
type RailMark = "done" | "current" | "future" | "unknown";

const STEPS = [
  { id: "order", compact: "Comandă", label: "Comandă creată" },
  { id: "release", compact: "Eliberare", label: "Eliberare în producție" },
  { id: "plan", compact: "Plan", label: "Plan de execuție" },
  { id: "execution", compact: "Execuție", label: "Atelier / execuție" },
  { id: "complete", compact: "Final", label: "Lucrare finalizată" },
] as const;

/** Visual milestones only. Business state, blockers and next actions stay server-owned. */
function railMarks(job: JobListItemTransport): RailMark[] {
  const completedMilestones: Record<string, number> = {
    ORDER_CREATED: 1,
    RELEASED: 2,
    EXECUTION_PLANNED: 3,
    EXECUTION_IN_PROGRESS: 3,
    EXECUTION_COMPLETED: 5,
  };
  const done = completedMilestones[job.stage];
  if (done === undefined) return STEPS.map(() => "unknown");
  return STEPS.map((_, index) => {
    if (index < done) return "done";
    if (job.stage === "EXECUTION_IN_PROGRESS" && index === 3) return "current";
    return "future";
  });
}

function jobName(job: JobListItemTransport): string {
  return job.kind === "ASSEMBLY" ? job.productLabel : job.inscription || job.productLabel;
}

function jobSubtitle(job: JobListItemTransport): string {
  return job.kind === "ASSEMBLY"
    ? job.memberLabels.join(" + ") || job.inscription
    : job.inscription && job.inscription !== job.productLabel
      ? job.productLabel
      : job.kindLabel;
}

function matchFilter(job: JobListItemTransport, filter: JobFilter): boolean {
  switch (filter) {
    case "all": return true;
    case "needs-action": return job.needsAttention && job.stage !== "EXECUTION_COMPLETED";
    case "urgent": return job.priority === "URGENT";
    case "overdue": return job.overdue;
    case "in-execution": return job.stage === "EXECUTION_IN_PROGRESS";
    case "completed": return job.stage === "EXECUTION_COMPLETED";
    default: {
      const exhaustive: never = filter;
      return exhaustive;
    }
  }
}

function dateValue(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ProductionRail({ job, vertical = false }: { job: JobListItemTransport; vertical?: boolean }) {
  const marks = railMarks(job);
  return (
    <ol
      className={vertical ? "jobs-traveler__steps" : "jobs-spine__rail"}
      aria-label={"Traseu de producție: " + job.stageLabel}
    >
      {STEPS.map((step, index) => (
        <li key={step.id} data-mark={marks[index]}>
          <span className="jobs-spine__rail-node" aria-hidden="true" />
          <span className="jobs-spine__rail-label">{vertical ? step.label : step.compact}</span>
          {vertical ? (
            <span className="jobs-traveler__step-status">
              {marks[index] === "done" ? "Finalizat" : marks[index] === "current" ? "În lucru" : marks[index] === "unknown" ? "Necunoscut" : "Urmează"}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function JobRow({
  job, selected, compact, onSelect,
}: {
  job: JobListItemTransport;
  selected: boolean;
  compact: boolean;
  onSelect: () => void;
}) {
  const action = presentJobWorklistAction(job);
  const name = jobName(job);
  return (
    <li
      className="jobs-spine__row"
      data-selected={selected}
      data-attention={job.needsAttention}
      data-density={compact ? "compact" : "comfortable"}
    >
      <button
        className="jobs-spine__row-select"
        type="button"
        aria-label={"Previzualizează lucrarea " + name}
        aria-pressed={selected}
        onClick={onSelect}
      />
      <div className="jobs-spine__cell jobs-spine__cell--identity">
        <a href={jobHref(job.jobId)} className="jobs-spine__object">{name}</a>
        <span className="jobs-spine__sub">{jobSubtitle(job)}</span>
        <span className="jobs-spine__customer-mini">{job.customerDisplayName ?? "Client neprecizat"}</span>
        {job.attentionLabel ? <span className="jobs-spine__attention">{job.attentionLabel}</span> : null}
      </div>
      <div className="jobs-spine__cell jobs-spine__cell--client">{job.customerDisplayName ?? "—"}</div>
      <div className="jobs-spine__cell jobs-spine__cell--flow">
        <span className="jobs-spine__stage">{job.stageLabel}</span>
        <ProductionRail job={job} />
        {job.progressLabel ? <span className="jobs-spine__progress">{job.progressLabel}</span> : null}
      </div>
      <div className="jobs-spine__cell jobs-spine__cell--due">
        <span>{job.targetDateLabel}</span>
        {job.overdue ? <span className="jobs-spine__overdue">Termen depășit</span> : null}
        {job.priority !== "STANDARD" ? <span className="jobs-spine__priority">{job.priorityLabel}</span> : null}
      </div>
      <div className="jobs-spine__cell jobs-spine__cell--action">
        <a href={action.actionHref} className="jobs-spine__row-action">
          <span>{action.actionLabel || "Deschide lucrarea"}</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </li>
  );
}

function WorkTraveler({ job }: { job: JobListItemTransport | null }) {
  const action = job ? presentJobWorklistAction(job) : null;

  return (
    <aside className="jobs-traveler" aria-label="Fișă operațională pentru lucrarea selectată">
      <div className="jobs-traveler__housing">
        <span className="jobs-traveler__side-rail jobs-traveler__side-rail--left" aria-hidden="true" />
        <span className="jobs-traveler__side-rail jobs-traveler__side-rail--right" aria-hidden="true" />
        <div className="jobs-traveler__fixture-top" aria-hidden="true">
          <img src={travelerTop} alt="" width="820" height="194" />
          <div className="jobs-traveler__fixture-label">
            <span><strong>WORK TRAVELER</strong><small>PRODUCTION CONTROL</small></span>
            <span className="jobs-traveler__fixture-brand">WorkOS<small>ATELIER / OPERATIONS</small></span>
          </div>
        </div>
        <div className="jobs-traveler__paper-bay">
          {job ? (
            <div className="jobs-traveler__paper" key={job.jobId}>
              <div className="jobs-traveler__paper-head">
                <span>FIȘĂ DE PRODUCȚIE</span>
                <span>{formatTimestamp(job.createdAt) ?? "—"}</span>
              </div>
              <h2 className="jobs-traveler__title">{jobName(job)}</h2>
              <p className="jobs-traveler__description" title={jobSubtitle(job)}>{jobSubtitle(job)}</p>
              <p className="jobs-traveler__client">{job.customerDisplayName ?? "Client neprecizat"}</p>
              <dl className="jobs-traveler__facts">
                <div><dt>Tip lucrare</dt><dd>{job.kindLabel}</dd></div>
                <div><dt>Prioritate</dt><dd>{job.priorityLabel}</dd></div>
                <div><dt>Termen</dt><dd>{job.targetDateLabel}</dd></div>
                <div><dt>Progres</dt><dd>{job.progressLabel ?? "Fără plan de execuție"}</dd></div>
              </dl>
              <div className="jobs-traveler__current">
                <span className="jobs-traveler__eyebrow">ETAPA ACTUALĂ</span>
                <strong>{job.stageLabel}</strong>
                {job.attentionLabel ? (
                  <p className="jobs-traveler__alert"><span aria-hidden="true">!</span>{job.attentionLabel}</p>
                ) : null}
              </div>
              <div className="jobs-traveler__flow">
                <h3>FLUX DE PRODUCȚIE</h3>
                <ProductionRail job={job} vertical />
              </div>
              <div className="jobs-traveler__continue">
                <span className="jobs-traveler__eyebrow">URMĂTOAREA ACȚIUNE</span>
                <strong>{job.nextActionLabel || "Deschide lucrarea"}</strong>
                <a href={action?.actionHref ?? jobHref(job.jobId)} className="jobs-traveler__action">
                  <span>{action?.actionLabel || "Deschide lucrarea"}</span>
                  <span aria-hidden="true">↗</span>
                </a>
                {action?.actionHref !== jobHref(job.jobId) ? (
                  <a className="jobs-traveler__detail-link" href={jobHref(job.jobId)}>Deschide fișa completă →</a>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="jobs-traveler__paper jobs-traveler__paper--empty">
              <span className="jobs-traveler__eyebrow">FIȘĂ DE PRODUCȚIE</span>
              <p>Selectează o lucrare din registru pentru a-i vedea traseul și următoarea acțiune.</p>
            </div>
          )}
        </div>
        <div className="jobs-traveler__paper-tear" aria-hidden="true" />
        <div className="jobs-traveler__fixture-bottom" aria-hidden="true">
          <img src={travelerFoot} alt="" width="820" height="140" />
          <span className="jobs-traveler__fixture-engraving">
            <span>WORKOS / JOB CONTROL</span>
            <span>PRODUCTION SYSTEM</span>
          </span>
        </div>
      </div>
      <p className="jobs-traveler__hint" aria-hidden="true">
        {job ? "Fișă operațională / " + job.stageLabel : "Selectează un rând pentru previzualizare"}
        <span>WORKOS / OPERAȚIUNI</span>
      </p>
      <p className="u-visually-hidden" aria-live="polite" aria-atomic="true">
        {job ? "Fișa afișează lucrarea " + jobName(job) : "Nicio lucrare selectată"}
      </p>
    </aside>
  );
}

export function JobsPage() {
  const jobs = useResource(resourceKeys.jobs(), loadJobList);
  const items = useMemo(() => jobs.data ?? [], [jobs.data]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<JobFilter>("all");
  const [sort, setSort] = useState<JobSort>("newest");
  const [compact, setCompact] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const counts = useMemo(() => ({
    total: items.length,
    attention: items.filter((job) => matchFilter(job, "needs-action")).length,
    executing: items.filter((job) => matchFilter(job, "in-execution")).length,
    completed: items.filter((job) => matchFilter(job, "completed")).length,
  }), [items]);

  const visible = useMemo(() => {
    return items.filter((job) =>
      matchFilter(job, filter) &&
      matchesSearch(query, [
        job.inscription, job.productLabel, job.customerDisplayName, job.stageLabel,
        job.priorityLabel, job.kindLabel, job.nextActionLabel, job.attentionLabel,
        job.progressLabel, job.targetDateLabel, ...job.memberLabels,
      ]),
    ).sort((left, right) => {
      const a = dateValue(left.createdAt);
      const b = dateValue(right.createdAt);
      if (a === null) return b === null ? 0 : 1;
      if (b === null) return -1;
      return sort === "newest" ? b - a : a - b;
    });
  }, [items, filter, query, sort]);

  const view = collectionViewState(jobs.status, items.length, visible.length);
  const selected = visible.find((job) => job.jobId === selectedId) ?? visible[0] ?? null;
  const shown = jobs.status === "success" ? visible.length + " din " + items.length : "—";
  const countLabel = (value: number) => jobs.status === "success" ? String(value).padStart(2, "0") : "—";
  const hasFilters = query.trim().length > 0 || filter !== "all";

  function resetFilters() {
    setQuery("");
    setFilter("all");
    setSelectedId(null);
    searchRef.current?.focus();
  }

  return (
    <PageRegion>
      <div className="jobs-spine">
        <div className="jobs-spine__layout">
          <div className="jobs-spine__header">
            <div className="jobs-spine__process-map" aria-hidden="true">
              <span>PLANIFICARE</span>
              <span>EXECUȚIE</span>
              <span>ATELIER</span>
              <span>CALITATE</span>
              <span>LIVRARE</span>
            </div>
            <PageHeader
              variant="pilot-compact"
              eyebrow="Registru operațional"
              title="Lucrări"
              lead="Planifică, urmărește execuția și finalizează lucrările de producție."
              instrument={
                <div className="jobs-spine__metrics" role="group" aria-label="Indicatori lucrări">
                  <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                    <strong>{countLabel(counts.total)}</strong><span>Total<br />lucrări</span>
                  </button>
                  <button type="button" data-attention={counts.attention > 0} aria-pressed={filter === "needs-action"} onClick={() => setFilter("needs-action")}>
                    <strong>{countLabel(counts.attention)}</strong><span>Necesită<br />acțiune</span>
                  </button>
                  <button type="button" aria-pressed={filter === "in-execution"} onClick={() => setFilter("in-execution")}>
                    <strong>{countLabel(counts.executing)}</strong><span>În<br />execuție</span>
                  </button>
                  <button type="button" aria-pressed={filter === "completed"} onClick={() => setFilter("completed")}>
                    <strong>{countLabel(counts.completed)}</strong><span>Finalizate</span>
                  </button>
                </div>
              }
            />
          </div>

          <section className="jobs-spine__register" aria-label="Registru de producție">
            <div className="jobs-spine__toolbar">
              <div className="jobs-spine__search">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></svg>
                <label className="u-visually-hidden" htmlFor="lucrari-cauta">Caută lucrări</label>
                <input
                  ref={searchRef}
                  id="lucrari-cauta"
                  type="search"
                  placeholder="Caută lucrare, client sau produs"
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setSelectedId(null); }}
                />
              </div>
              <div className="jobs-spine__controls">
                <label className="jobs-spine__sort" htmlFor="lucrari-ordine">
                  <span>Ordine</span>
                  <select id="lucrari-ordine" value={sort} onChange={(event) => setSort(event.target.value as JobSort)}>
                    <option value="newest">Cele mai noi</option>
                    <option value="oldest">Cele mai vechi</option>
                  </select>
                </label>
                <button className="jobs-spine__density" type="button" aria-pressed={compact} onClick={() => setCompact((value) => !value)}>
                  <span aria-hidden="true">☷</span>{compact ? "Compact" : "Confort"}
                </button>
                <a className="jobs-spine__planning" href="/planificare">
                  <span>Planificare</span><span aria-hidden="true">↗</span>
                </a>
              </div>
            </div>

            <div className="jobs-spine__filterbar" role="group" aria-label="Filtre lucrări">
              {FILTERS.map((option) => (
                <button type="button" key={option.id} aria-pressed={filter === option.id} onClick={() => { setFilter(option.id); setSelectedId(null); }}>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="jobs-spine__section-label">
              <h2>Lista de lucrări</h2>
              <span>{shown}</span>
              {hasFilters ? <button type="button" onClick={resetFilters}>Resetează filtrele ↗</button> : null}
            </div>

            <div className="jobs-spine__columns" aria-hidden="true">
              <span>LUCRARE</span><span>CLIENT</span><span>ETAPĂ / PROGRES</span><span>TERMEN</span><span>ACȚIUNE</span>
            </div>
            {view === "error" ? (
              <div className="jobs-spine__feedback"><ErrorState title="Lucrările nu au putut fi citite">Lista de lucrări nu este disponibilă.</ErrorState></div>
            ) : view === "loading" ? (
              <div className="jobs-spine__feedback" role="status" aria-live="polite">Se citesc lucrările…</div>
            ) : view === "empty" ? (
              <div className="jobs-spine__feedback"><EmptyState title="Nu există lucrări." /></div>
            ) : view === "filtered-empty" ? (
              <div className="jobs-spine__feedback"><EmptyState title="Nicio lucrare nu corespunde filtrului." /><button className="jobs-spine__reset" type="button" onClick={resetFilters}>Șterge filtrele</button></div>
            ) : (
              <ul className="jobs-spine__rows" aria-label="Lista de lucrări" aria-busy={view === "refreshing"}>
                {visible.map((job) => (
                  <JobRow
                    key={job.jobId}
                    job={job}
                    selected={selected?.jobId === job.jobId}
                    compact={compact}
                    onSelect={() => setSelectedId(job.jobId)}
                  />
                ))}
              </ul>
            )}
            <div className="jobs-spine__footer"><span>{shown}</span></div>
          </section>
          <WorkTraveler job={selected} />
        </div>
      </div>
    </PageRegion>
  );
}
