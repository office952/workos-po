import { useEffect, useMemo, useRef, useState } from "react";
import "../styles/surfaces/requests.css";
import "../styles/surfaces/requests-hero.css";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { collectionViewState } from "../components/collectionViewState";
import { StatusBadge } from "../components/StatusBadge";
import { resourceKeys } from "../data/resourceKeys";
import { loadRequestList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";
import { matchesSearch } from "../presentation/listFilter";
import { presentRequestRegistryStatus } from "../presentation/requestListStatus";
import { statusTone } from "../presentation/statusTone";
import { presentRequestWorklistAction } from "../presentation/worklistAction";
import { requestHref } from "../routing/appRoute";
import intakeImage from "../assets/request-intake-760.webp";
import intakeImageRetina from "../assets/request-intake-1520.webp";

type RequestFilter = "all" | "needs-action";
type RequestSort = "newest" | "oldest";

function useIntakeViewport() {
  const [visible, setVisible] = useState(() =>
    typeof window.matchMedia !== "function" || window.matchMedia("(min-width: 768px)").matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 768px)");
    const update = () => setVisible(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return visible;
}

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function RequestsPage() {
  const requests = useResource(resourceKeys.requests(), loadRequestList);
  const items = useMemo(() => requests.data ?? [], [requests.data]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [sort, setSort] = useState<RequestSort>("newest");
  const [compact, setCompact] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const showIntake = useIntakeViewport();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const latest = useMemo(() => {
    const dated = items.filter((item) => timestamp(item.createdAt) !== null);
    return dated.sort((a, b) => timestamp(b.createdAt)! - timestamp(a.createdAt)!)[0];
  }, [items]);
  const selected = items.find((item) => item.requestId === selectedRequestId);
  // Forget a removed selection so it cannot return unexpectedly on a later refresh.
  if (selectedRequestId && requests.status === "success" && !selected) setSelectedRequestId(null);
  const receipt = selected ?? latest;
  const receiptRegistry = receipt ? presentRequestRegistryStatus(receipt) : null;
  const attentionCount = useMemo(
    () => items.filter((item) => item.needsAttention).length,
    [items],
  );
  const visible = useMemo(() => {
    const rows = items
      .map((item) => ({
        item,
        registry: presentRequestRegistryStatus({
          statusLabel: item.statusLabel,
          contextLabel: item.contextLabel,
        }),
      }))
      .filter(
        ({ item, registry }) =>
          (filter === "all" || item.needsAttention) &&
          matchesSearch(query, [
            item.title,
            item.reference,
            item.customerDisplayName,
            registry.commercialProgressLabel,
            registry.stateLabel,
            item.nextActionLabel,
            item.attentionLabel,
          ]),
      );
    return rows.sort((a, b) => {
      const left = timestamp(a.item.createdAt);
      const right = timestamp(b.item.createdAt);
      // Unknown dates stay last in either direction; equal dates preserve API order.
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return sort === "newest" ? right - left : left - right;
    });
  }, [items, filter, query, sort]);
  const view = collectionViewState(
    requests.status,
    items.length,
    visible.length,
  );
  const hasFilter = query.trim().length > 0 || filter !== "all";
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  // Persist a clamped page so a later refresh cannot jump back to an old page.
  if (page > pageCount) setPage(pageCount);
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * pageSize;
  const pageRows = visible.slice(offset, offset + pageSize);
  const pageNumbers = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, pageCount])]
    .filter((number) => number >= 1 && number <= pageCount).sort((a, b) => a - b);
  const count = (value: number) =>
    requests.status === "success" ? String(value).padStart(2, "0") : "—";
  function resetFilters() {
    setQuery("");
    setFilter("all");
    setPage(1);
    searchRef.current?.focus();
  }

  return (
    <SlicePage
      contextLabel="Cereri"
      currentHref="/cereri"
      workspace="stack"
      surface="cereri-registry"
      headerVariant="pilot"
      eyebrow="Registru comercial"
      title="Cereri de ofertă"
      action={showIntake ? (
        <div id="cereri-intake" className="requests-intake" aria-label="Registru de intrare">
          <div className="requests-intake__device">
            <img src={intakeImage} srcSet={`${intakeImage} 760w, ${intakeImageRetina} 1520w`}
              sizes="(min-width: 1152px) 760px, calc(50vw - 44px)"
              alt="" width="760" height="324" decoding="async" />
            {requests.status === "success" && receipt ? (
              <a className="requests-intake__sheet" href={requestHref(receipt.requestId)}
                aria-label={`${selected ? "Cerere selectată" : "Ultima intrare"}: ${receipt.title || receipt.reference}`}>
                <span className="requests-intake__meta">
                  <span>{receipt.reference || "—"}</span>
                  <span>{formatTimestamp(receipt.createdAt)?.split(",")[0] || "—"}</span>
                </span>
                <strong title={receipt.title || receipt.reference || undefined}>
                  {receipt.title || receipt.reference}
                </strong>
                <span className="requests-intake__client" title={receipt.customerDisplayName || undefined}>
                  {receipt.customerDisplayName || "Fără client"}
                </span>
                <span className="requests-intake__progress">
                  <span>Stare: {receiptRegistry?.stateLabel}</span>
                  {receiptRegistry?.commercialProgressLabel !== "—" && (
                    <span>{receiptRegistry?.commercialProgressLabel}</span>
                  )}
                </span>
              </a>
            ) : (
              <span className="requests-intake__sheet requests-intake__sheet--idle">
                Registru de intrare
              </span>
            )}
            {requests.status === "success" && receipt && (
              <span className="requests-intake__hint" aria-hidden="true">
                <span>{selected ? "Cerere selectată" : "Ultima intrare"}</span>
                <span>Selectează un rând pentru previzualizare</span>
              </span>
            )}
          </div>
          <span className="requests-intake__label" aria-hidden="true">WORKOS<br />REGISTRU<br />INTRARE</span>
          <span className="u-visually-hidden" aria-live="polite" aria-atomic="true">
            {selected ? `Fișa afișează: ${selected.title || selected.reference}` : ""}
          </span>
        </div>
      ) : undefined}
      instrument={
        <div
          className="pilot-instrument"
          role="group"
          aria-label="Filtre registru cereri"
        >
          <button
            type="button"
            className="pilot-instrument__metric"
            aria-pressed={filter === "all"}
            onClick={() => { setFilter("all"); setPage(1); }}
          >
            <strong className="pilot-instrument__metric-value">
              {count(items.length)}
            </strong>
            <span className="pilot-instrument__metric-label">Total</span>
          </button>
          <button
            type="button"
            className="pilot-instrument__metric pilot-instrument__metric--attention"
            data-attention={attentionCount > 0}
            aria-pressed={filter === "needs-action"}
            onClick={() => { setFilter("needs-action"); setPage(1); }}
          >
            <strong className="pilot-instrument__metric-value">
              {count(attentionCount)}
            </strong>
            <span className="pilot-instrument__metric-label">
              Necesită acțiune
            </span>
          </button>
        </div>
      }
    >
      <section
        className="requests-register"
        aria-label="Registru cereri"
        data-density={compact ? "compact" : "comfortable"}
      >
        <div className="requests-toolbar">
          <div className="requests-search">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="10" cy="10" r="6" />
              <path d="m15 15 5 5" />
            </svg>
            <label className="u-visually-hidden" htmlFor="cereri-cauta">
              Caută
            </label>
            <input
              ref={searchRef}
              id="cereri-cauta"
              type="search"
              placeholder="Caută client, referință sau lucrare"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            />
          </div>
          <div className="requests-toolbar__controls">
            <label className="requests-sort" htmlFor="cereri-ordine">
              <span>Ordine</span>
              <select
                id="cereri-ordine"
                value={sort}
                onChange={(event) => { setSort(event.target.value as RequestSort); setPage(1); }}
              >
                <option value="newest">Cele mai noi</option>
                <option value="oldest">Cele mai vechi</option>
              </select>
            </label>
            <button
              className="requests-density"
              type="button"
              aria-pressed={compact}
              aria-label="Rânduri compacte"
              onClick={() => setCompact((value) => !value)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>{compact ? "Compact" : "Confort"}</span>
            </button>
            <a className="requests-new" href="/clienti">
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
              Cerere nouă
            </a>
          </div>
        </div>
        <div className="requests-register__strip">
          <h2>
            {filter === "needs-action" ? "Necesită acțiune" : "Lista de cereri"}
          </h2>
          <span className="requests-result" role={visible.length === 0 || requests.status !== "success" ? "status" : undefined}>
            {requests.status === "success"
              ? `${visible.length} din ${items.length}`
              : "Se citesc cererile"}
          </span>
          {hasFilter && (
            <button
              type="button"
              className="requests-reset"
              onClick={resetFilters}
            >
              Resetează filtrele <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
        {view === "error" ? (
          <div className="requests-feedback">
            <ErrorState title="Cererile nu au putut fi citite">
              Lista de cereri nu este disponibilă.
            </ErrorState>
          </div>
        ) : view === "empty" ? (
          <div className="requests-feedback">
            <EmptyState
              title="Nu există cereri"
              description="Începe de la un client."
              action={
                <a className="text-link" href="/clienti">
                  Începe de la un client
                </a>
              }
            />
          </div>
        ) : (
          <div
            className="requests-table-wrap"
            aria-busy={view === "loading" || view === "refreshing"}
          >
            <table className="requests-table">
              <caption className="u-visually-hidden">Lista de cereri</caption>
              <thead>
                <tr>
                  <th scope="col" className="requests-table__identity">
                    Cerere
                  </th>
                  <th scope="col" className="requests-table__client">
                    Client
                  </th>
                  <th scope="col" className="requests-table__progress">
                    Progres comercial
                  </th>
                  <th scope="col" className="requests-table__state">
                    Stare
                  </th>
                  <th
                    scope="col"
                    className="requests-table__date"
                    aria-sort={sort === "newest" ? "descending" : "ascending"}
                  >
                    Creată{" "}
                    <span aria-hidden="true">
                      {sort === "newest" ? "↓" : "↑"}
                    </span>
                  </th>
                  <th scope="col" className="requests-table__action">
                    Acțiune
                  </th>
                </tr>
              </thead>
              <tbody>
                {view === "filtered-empty" ? (
                  <tr className="requests-no-results">
                    <td colSpan={6}>
                      <EmptyState
                        title="Nicio cerere nu corespunde filtrului."
                        description={filter === "needs-action" && !query.trim()
                          ? "Nu sunt cereri care necesită acțiune în registrul curent."
                          : "Schimbă căutarea sau resetează filtrele pentru a reveni la registru."}
                        action={
                          <button type="button" className="requests-reset" onClick={resetFilters}>
                            Afișează toate cererile
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : view === "loading"
                  ? Array.from({ length: 4 }, (_, index) => (
                      <tr
                        key={index}
                        className="requests-skeleton"
                        aria-hidden="true"
                      >
                        {Array.from({ length: 6 }, (_, cell) => (
                          <td key={cell}>
                            <span />
                          </td>
                        ))}
                      </tr>
                    ))
                  : pageRows.map(({ item, registry }) => {
                      const action = presentRequestWorklistAction(item);
                      return (
                        <tr
                          key={item.requestId}
                          data-attention={item.needsAttention}
                          data-preview={showIntake}
                          data-selected={showIntake && selected?.requestId === item.requestId}
                          tabIndex={showIntake ? 0 : undefined}
                          aria-selected={showIntake ? selected?.requestId === item.requestId : undefined}
                          aria-label={showIntake ? `Previzualizează cererea: ${item.title || item.reference}` : undefined}
                          aria-controls={showIntake ? "cereri-intake" : undefined}
                          onClick={(event) => {
                            if (!showIntake || !(event.target instanceof Element)) return;
                            if (event.target.closest("a, button, input, select, textarea")) return;
                            if (window.getSelection()?.toString()) return;
                            setSelectedRequestId(item.requestId);
                          }}
                          onKeyDown={(event) => {
                            if (!showIntake || event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedRequestId(item.requestId);
                            }
                          }}
                        >
                          <td className="requests-table__identity">
                            <a
                              className="requests-object"
                              href={requestHref(item.requestId)}
                            >
                              <span className="requests-object__title">
                                {item.title || item.reference}
                              </span>
                              {item.reference &&
                                item.reference !== item.title && (
                                  <span className="requests-object__reference">
                                    {item.reference}
                                  </span>
                                )}
                            </a>
                          </td>
                          <td className="requests-table__client">
                            <span className="requests-client">
                              {item.customerDisplayName ?? "Fără client"}
                            </span>
                          </td>
                          <td className="requests-table__progress">
                            <span className="requests-progress">
                              {registry.commercialProgressLabel}
                            </span>
                            {item.attentionLabel && (
                              <span className="requests-attention">
                                {item.needsAttention && (
                                  <span
                                    aria-hidden="true"
                                    className="requests-attention__mark"
                                  />
                                )}
                                {item.attentionLabel}
                              </span>
                            )}
                          </td>
                          <td className="requests-table__state">
                            <StatusBadge
                              label={registry.stateLabel}
                              tone={statusTone("workflow")}
                            />
                          </td>
                          <td className="requests-table__date">
                            <span>
                              {formatTimestamp(item.createdAt) ?? "—"}
                            </span>
                          </td>
                          <td className="requests-table__action">
                            <a
                              className="requests-next"
                              href={action.actionHref}
                            >
                              <span className="requests-next__label">{action.actionLabel}</span>
                              <span className="requests-next__arrow" aria-hidden="true">→</span>
                            </a>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}
        {requests.status === "success" && visible.length > 0 && (
          <nav className="requests-pagination" aria-label="Paginare cereri">
            <span className="requests-pagination__range" role="status">
              {offset + 1}–{Math.min(offset + pageSize, visible.length)} din {visible.length} cereri
            </span>
            <label className="requests-pagination__size" htmlFor="cereri-pe-pagina">
              Pe pagină
              <select id="cereri-pe-pagina" value={pageSize}
                onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
              </select>
            </label>
            <div className="requests-pagination__pages">
              <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</button>
              {pageNumbers.map((number, index) => (
                <span className="requests-pagination__step" key={number}>
                  {index > 0 && number - pageNumbers[index - 1] > 1 && <span aria-hidden="true">…</span>}
                  <button type="button" aria-label={`Pagina ${number}`} aria-current={number === currentPage ? "page" : undefined}
                    onClick={() => setPage(number)}>{number}</button>
                </span>
              ))}
              <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Următor</button>
            </div>
          </nav>
        )}
      </section>
    </SlicePage>
  );
}
