import { useEffect, useMemo, useRef, useState } from "react";
import { collectionViewState } from "../components/collectionViewState";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadJobList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { globalNavItems } from "../layout/globalNav";
import { PageRegion } from "../layout/PageRegion";
import { jobsHref, jobsViewHref, parseJobsSelection, type JobsView } from "../routing/appRoute";
import { DeskDialog, DeskDossier, type DeskVacancy } from "./desk/DeskDossier";
import { DeskSignalBoard } from "./desk/DeskSignalBoard";
import type { Density } from "./desk/DeskToolbar";
import { useDeskLayout } from "./desk/useDeskLayout";
import { useDeskSelection } from "./desk/useDeskSelection";
import { JobsRegister } from "./jobs/JobsRegister";
import { JobTraveler } from "./jobs/JobTraveler";
import { EMPTY_JOB_FILTERS, filterJobs, jobName, jobSignals, readJobsMemory, writeJobsMemory, type JobFilters, type JobSort } from "./jobs/jobRegistryModel";
import { ProductionLine } from "./jobs/ProductionLine";
import { JobsWorkload } from "./JobsWorkload";
import "../styles/layout/registry-desk.css";
import "../styles/surfaces/jobs-line.css";

const MODULE_INDEX = String(globalNavItems().findIndex((item) => item.href === "/lucrari") + 1).padStart(2, "0");

/**
 * Lucrări: the production line over the register and the traveler in the dossier.
 * The selected job lives in the URL (?lucrare=…); filters stay in session memory.
 */
export function JobsPage({ view = "jobs", search = "" }: { view?: JobsView; search?: string }) {
  const jobs = useResource(resourceKeys.jobs(), loadJobList);
  const items = useMemo(() => jobs.data?.jobs ?? [], [jobs.data]);
  const summary = jobs.data?.summary ?? null;
  const [remembered] = useState(readJobsMemory);
  const [filters, setFilters] = useState<JobFilters>(remembered.filters);
  const [sort, setSort] = useState<JobSort>(remembered.sort);
  const [density, setDensity] = useState<Density>(remembered.density);
  const searchRef = useRef<HTMLInputElement>(null);
  const layout = useDeskLayout();
  const selectedId = view === "jobs" ? parseJobsSelection(search) : null;

  useEffect(() => writeJobsMemory({ filters, sort, density }), [filters, sort, density]);

  const visible = useMemo(() => filterJobs(items, filters, sort), [items, filters, sort]);
  const order = useMemo(() => visible.map((job) => job.jobId), [visible]);
  const registryView = collectionViewState(jobs.status, items.length, visible.length);
  const listReady = jobs.status === "success" || items.length > 0;
  const selected = items.find((job) => job.jobId === selectedId) ?? null;
  const selection = useDeskSelection({ layout, selectedId, href: jobsHref, order, searchRef });

  function changeFilters(next: JobFilters): void {
    setFilters(next);
    if (selectedId && !filterJobs(items, next, sort).some((job) => job.jobId === selectedId)) selection.clear();
  }

  function onSignal(id: string): void {
    changeFilters(id === "attention" ? { ...filters, attention: !filters.attention } : { ...EMPTY_JOB_FILTERS, query: filters.query });
  }

  function resetFilters(): void {
    changeFilters(EMPTY_JOB_FILTERS);
    searchRef.current?.focus();
  }

  const vacancy: DeskVacancy | null = selected
    ? null
    : !listReady
      ? jobs.status === "error"
        ? { title: "Dosarul nu este disponibil", body: "Lista de lucrări nu a putut fi citită." }
        : { title: "Se citește registrul", body: "Fișa se deschide după citirea listei de lucrări." }
      : selectedId
        ? { title: "Lucrarea nu este în registru", body: "Lucrarea cerută nu există sau nu este accesibilă în această organizație." }
        : {
            title: "Nicio lucrare selectată",
            body: "Alege o lucrare din registru sau o stație de pe linie. Fișa arată traseul, progresul operațiilor și pasul următor.",
            hint: "↑ ↓ selectează · Enter deschide lucrarea",
          };

  const dossier = (
    <DeskDossier
      id="lucrari-dosar"
      label="Fișa de traseu a lucrării"
      steps={{ previous: "Lucrarea anterioară", next: "Lucrarea următoare" }}
      layout={layout}
      position={selected ? { index: selection.index, count: visible.length } : null}
      vacancy={vacancy}
      onMove={selection.move}
      onClose={layout === "docked" ? undefined : selection.close}
    >
      {selected ? <JobTraveler key={selected.jobId} job={selected} /> : null}
    </DeskDossier>
  );

  return (
    <PageRegion>
      <div
        className="rdesk jline-desk"
        data-surface="jobs-registry"
        data-layout={view === "jobs" ? layout : "workload"}
        data-density={density}
      >
        <header className="rdesk__bar">
          <div className="rdesk__title">
            <p className="rdesk__eyebrow"><span aria-hidden="true" />{MODULE_INDEX} · Registru operațional</p>
            <h1>Lucrări</h1>
          </div>
          {view === "jobs" ? (
            <DeskSignalBoard label="Filtre registru lucrări" signals={jobSignals(summary, items, filters)} ready={listReady} onPress={onSignal} />
          ) : null}
        </header>
        <nav className="rdesk__views" aria-label="Vederi lucrări">
          <a href={jobsViewHref("jobs")} aria-current={view === "jobs" ? "page" : undefined}>Lista lucrărilor</a>
          <a href={jobsViewHref("resources")} aria-current={view === "resources" ? "page" : undefined}>Pe utilaje și zone</a>
        </nav>
        {view === "jobs" ? (
          <>
            <div className="rdesk__instrument">
              <ProductionLine
                items={items}
                ready={listReady}
                stage={filters.stage}
                layout={layout}
                onStage={(stage) => changeFilters({ ...filters, stage })}
              />
            </div>
            <div className="rdesk__work">
              <JobsRegister
                layout={layout}
                view={registryView}
                refreshFailed={jobs.status === "error"}
                items={visible}
                total={items.length}
                filters={filters}
                sort={sort}
                density={density}
                selectedId={selectedId}
                searchRef={searchRef}
                onFilters={changeFilters}
                onSort={setSort}
                onDensity={setDensity}
                onReset={resetFilters}
                onRetry={() => invalidateResources(resourceKeys.jobs())}
                onSelect={layout === "docked" ? selection.select : selection.open}
                onOpen={selection.open}
              />
              {layout === "docked" ? dossier : null}
            </div>
            {selection.dialogOpen ? (
              <DeskDialog layout={layout} label="Fișa de traseu a lucrării" onClose={selection.close}>{dossier}</DeskDialog>
            ) : null}
            <span className="u-visually-hidden" aria-live="polite" aria-atomic="true">
              {selected ? `Fișa afișează lucrarea ${jobName(selected)}` : ""}
            </span>
          </>
        ) : (
          <div className="jline-desk__workload"><JobsWorkload active /></div>
        )}
      </div>
    </PageRegion>
  );
}
