import { useEffect, useMemo, useRef, useState } from "react";
import { collectionViewState } from "../components/collectionViewState";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadRequestList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { globalNavItems } from "../layout/globalNav";
import { PageRegion } from "../layout/PageRegion";
import { parseRequestsSelection, requestsHref } from "../routing/appRoute";
import { rowSelector } from "./desk/deskKeys";
import { DeskDialog, DeskDossier, type DeskVacancy } from "./desk/DeskDossier";
import { DeskSignalBoard } from "./desk/DeskSignalBoard";
import type { Density } from "./desk/DeskToolbar";
import { useDeskLayout } from "./desk/useDeskLayout";
import { useDeskSelection } from "./desk/useDeskSelection";
import { RequestTrays } from "./requests/RequestParts";
import { RequestSlip } from "./requests/RequestSlip";
import { RequestsRegister } from "./requests/RequestsRegister";
import {
  EMPTY_REQUEST_FILTERS,
  filterRequests,
  readRequestsMemory,
  requestSignals,
  pageOfIndex,
  writeRequestsMemory,
  type RequestFilters,
  type RequestSort,
} from "./requests/requestRegistryModel";
import "../styles/layout/registry-desk.css";
import "../styles/surfaces/requests-queue.css";

const MODULE_INDEX = String(globalNavItems().findIndex((item) => item.href === "/cereri") + 1).padStart(2, "0");

/**
 * Cereri: the intake queue. Preparation trays (request status) over a register grouped by day,
 * and the intake slip in the dossier. The selected request lives in the URL (?cerere=…).
 */
export function RequestsPage({ search = "" }: { search?: string }) {
  const requests = useResource(resourceKeys.requests(), loadRequestList);
  const items = useMemo(() => requests.data?.requests ?? [], [requests.data]);
  const summary = requests.data?.summary ?? null;
  const [remembered] = useState(readRequestsMemory);
  const [filters, setFilters] = useState<RequestFilters>(remembered.filters);
  const [sort, setSort] = useState<RequestSort>(remembered.sort);
  const [density, setDensity] = useState<Density>(remembered.density);
  const [pageSize, setPageSize] = useState(remembered.pageSize);
  const [page, setPage] = useState(remembered.page);
  /** The URL selection whose page was last shown; the page follows a selection once, not on every render. */
  const [shownSelection, setShownSelection] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const layout = useDeskLayout();
  const selectedId = parseRequestsSelection(search);

  useEffect(() => writeRequestsMemory({ filters, sort, density, pageSize, page }), [filters, sort, density, pageSize, page]);

  const visible = useMemo(() => filterRequests(items, filters, sort), [items, filters, sort]);
  const order = useMemo(() => visible.map((item) => item.requestId), [visible]);
  const view = collectionViewState(requests.status, items.length, visible.length);
  const listReady = requests.status === "success" || items.length > 0;
  const selected = items.find((item) => item.requestId === selectedId) ?? null;
  const selectedIndex = selectedId ? order.indexOf(selectedId) : -1;

  function reveal(requestId: string): boolean {
    const index = order.indexOf(requestId);
    if (index < 0) return false;
    setPage(pageOfIndex(index, pageSize));
    return true;
  }

  const selection = useDeskSelection({ layout, selectedId, href: requestsHref, order, searchRef, reveal });

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  if (listReady) {
    // A selection that arrives through the URL (direct link, refresh, Back/Forward, previous/next)
    // turns the register to the page that holds it, once; changing the page by hand stays free.
    if (selectedId === null) {
      if (shownSelection !== null) setShownSelection(null);
    } else if (selectedId !== shownSelection && selectedIndex >= 0) {
      setShownSelection(selectedId);
      const target = pageOfIndex(selectedIndex, pageSize);
      if (target !== page) setPage(target);
    }
    // Clamp only after the list is read, so a remembered page survives the loading state.
    if (page > pageCount) setPage(pageCount);
  }
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const rows = visible.slice(offset, offset + pageSize);

  function changeFilters(next: RequestFilters): void {
    setFilters(next);
    setPage(1);
    if (selectedId && !filterRequests(items, next, sort).some((item) => item.requestId === selectedId)) selection.clear();
  }

  function onSignal(id: string): void {
    changeFilters(id === "attention" ? { ...filters, attention: !filters.attention } : { ...EMPTY_REQUEST_FILTERS, query: filters.query });
  }

  function resetFilters(): void {
    changeFilters(EMPTY_REQUEST_FILTERS);
    searchRef.current?.focus();
  }

  // The selected row is scrolled into view when a URL selection turned the page.
  useEffect(() => {
    if (!shownSelection) return;
    const row = document.querySelector<HTMLElement>(`[data-register] ${rowSelector(shownSelection)}`);
    if (typeof row?.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }, [shownSelection]);

  const vacancy: DeskVacancy | null = selected
    ? null
    : !listReady
      ? requests.status === "error"
        ? { title: "Dosarul nu este disponibil", body: "Lista de cereri nu a putut fi citită." }
        : { title: "Se citește registrul", body: "Bonul se deschide după citirea listei de cereri." }
      : selectedId
        ? { title: "Cererea nu este în registru", body: "Cererea cerută nu există sau nu este accesibilă în această organizație." }
        : {
            title: "Nicio cerere selectată",
            body: "Alege o intrare din registru. Bonul arată starea cererii, progresul comercial și ofertele legate, separat.",
            hint: "↑ ↓ selectează · Enter deschide cererea",
          };

  const dossier = (
    <DeskDossier
      id="cereri-dosar"
      label="Bonul de intrare al cererii"
      steps={{ previous: "Cererea anterioară", next: "Cererea următoare" }}
      layout={layout}
      position={selected ? { index: selection.index, count: visible.length } : null}
      vacancy={vacancy}
      onMove={selection.move}
      onClose={layout === "docked" ? undefined : selection.close}
    >
      {selected ? <RequestSlip key={selected.requestId} item={selected} /> : null}
    </DeskDossier>
  );

  return (
    <PageRegion>
      <div className="rdesk rtray-desk" data-surface="cereri-registry" data-layout={layout} data-density={density}>
        <header className="rdesk__bar">
          <div className="rdesk__title">
            <p className="rdesk__eyebrow"><span aria-hidden="true" />{MODULE_INDEX} · Registru comercial</p>
            <h1>Cereri</h1>
          </div>
          <DeskSignalBoard label="Filtre registru cereri" signals={requestSignals(summary, items, filters)} ready={listReady} onPress={onSignal} />
        </header>
        <div className="rdesk__instrument">
          <RequestTrays summary={summary} ready={listReady} status={filters.status} layout={layout} onStatus={(status) => changeFilters({ ...filters, status })} />
        </div>
        <div className="rdesk__work">
          <RequestsRegister
            layout={layout}
            view={view}
            refreshFailed={requests.status === "error"}
            rows={rows}
            visibleCount={visible.length}
            total={items.length}
            filters={filters}
            sort={sort}
            density={density}
            paging={{ page: currentPage, pageCount, pageSize, offset, shown: rows.length, total: visible.length }}
            selectedId={selectedId}
            searchRef={searchRef}
            onFilters={changeFilters}
            onSort={(next) => { setSort(next); setPage(1); }}
            onDensity={setDensity}
            onPage={setPage}
            onPageSize={(size) => { setPageSize(size); setPage(1); }}
            onReset={resetFilters}
            onRetry={() => invalidateResources(resourceKeys.requests())}
            onSelect={layout === "docked" ? selection.select : selection.open}
            onOpen={selection.open}
          />
          {layout === "docked" ? dossier : null}
        </div>
        {selection.dialogOpen ? <DeskDialog layout={layout} label="Bonul de intrare al cererii" onClose={selection.close}>{dossier}</DeskDialog> : null}
        <span className="u-visually-hidden" aria-live="polite" aria-atomic="true">
          {selected ? `Bonul afișează cererea ${selected.title || selected.reference}` : ""}
        </span>
      </div>
    </PageRegion>
  );
}
