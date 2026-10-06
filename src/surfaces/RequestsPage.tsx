import { useMemo, useState } from "react";
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

type RequestFilter = "all" | "needs-action";
type RequestSort = "newest" | "oldest";

function timestamp(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function RequestsPage() {
  const requests = useResource(resourceKeys.requests(), loadRequestList);
  const items = useMemo(() => requests.data ?? [], [requests.data]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [sort, setSort] = useState<RequestSort>("newest");
  const [compact, setCompact] = useState(false);
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
  const count = (value: number) =>
    requests.status === "success" ? String(value).padStart(2, "0") : "—";
  function resetFilters() {
    setQuery("");
    setFilter("all");
  }

  return (
    <SlicePage
      contextLabel="Cereri"
      currentHref="/cereri"
      workspace="stack"
      surface="cereri-registry"
      eyebrow="Registru comercial"
      title="Cereri de ofertă"
      action={
        <a className="requests-new" href="/clienti">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>{" "}
          Cerere nouă
        </a>
      }
      instrument={
        <div
          className="requests-instrument"
          role="group"
          aria-label="Filtre registru cereri"
        >
          <button
            type="button"
            className="requests-instrument__metric"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            <strong className="requests-instrument__metric-value">
              {count(items.length)}
            </strong>
            <span className="requests-instrument__metric-label">Total</span>
          </button>
          <button
            type="button"
            className="requests-instrument__metric requests-instrument__metric--attention"
            data-attention={attentionCount > 0}
            aria-pressed={filter === "needs-action"}
            onClick={() => setFilter("needs-action")}
          >
            <strong className="requests-instrument__metric-value">
              {count(attentionCount)}
            </strong>
            <span className="requests-instrument__metric-label">
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
              id="cereri-cauta"
              type="search"
              placeholder="Caută client, referință sau lucrare"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="requests-toolbar__controls">
            <label className="requests-sort" htmlFor="cereri-ordine">
              <span>Ordine</span>
              <select
                id="cereri-ordine"
                value={sort}
                onChange={(event) => setSort(event.target.value as RequestSort)}
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
          </div>
        </div>
        <div className="requests-register__strip">
          <h2>
            {filter === "needs-action" ? "Necesită acțiune" : "Lista de cereri"}
          </h2>
          <span className="requests-result" role="status">
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
        ) : view === "filtered-empty" ? (
          <div className="requests-feedback">
            <EmptyState
              title="Nicio cerere nu corespunde filtrului."
              action={
                <button
                  type="button"
                  className="requests-reset"
                  onClick={resetFilters}
                >
                  Afișează toate cererile
                </button>
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
                {view === "loading"
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
                  : visible.map(({ item, registry }) => {
                      const action = presentRequestWorklistAction(item);
                      return (
                        <tr
                          key={item.requestId}
                          data-attention={item.needsAttention}
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
                              {action.actionLabel}
                              <span aria-hidden="true">↗</span>
                            </a>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </SlicePage>
  );
}
