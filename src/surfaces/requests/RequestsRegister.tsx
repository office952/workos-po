import type { KeyboardEvent, Ref } from "react";
import type { RequestListItemTransport } from "../../api/types";
import type { CollectionViewState } from "../../components/collectionViewState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { InlineAlert } from "../../components/InlineAlert";
import { presentRequestWorklistAction } from "../../presentation/worklistAction";
import { newRequestHref, requestHref } from "../../routing/appRoute";
import { clickedControl, moveRowFocus } from "../desk/deskKeys";
import { DeskCaption, DeskDensity, DeskSearch, DeskSkeleton, PlusIcon, type Density } from "../desk/DeskToolbar";
import type { DeskLayout } from "../desk/useDeskLayout";
import { CommercialProgress, RequestState } from "./RequestParts";
import { entryTime, groupByDay, hasRequestFilter, type RequestFilters, type RequestSort } from "./requestRegistryModel";

export type Paging = { page: number; pageCount: number; pageSize: number; offset: number; shown: number; total: number };

type Props = {
  layout: DeskLayout;
  view: CollectionViewState;
  refreshFailed: boolean;
  rows: readonly RequestListItemTransport[];
  visibleCount: number;
  total: number;
  filters: RequestFilters;
  sort: RequestSort;
  density: Density;
  paging: Paging;
  selectedId: string | null;
  searchRef: Ref<HTMLInputElement>;
  onFilters: (next: RequestFilters) => void;
  onSort: (next: RequestSort) => void;
  onDensity: (next: Density) => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (requestId: string) => void;
  onOpen: (requestId: string) => void;
};

function title(item: RequestListItemTransport): string {
  return item.title || item.reference || "Cerere";
}

function context(item: RequestListItemTransport): string {
  return [item.customerDisplayName ?? "Fără client", item.reference && item.reference !== item.title ? item.reference : null].filter(Boolean).join("  ·  ");
}

function Attention({ item }: { item: RequestListItemTransport }) {
  return item.attentionLabel ? <span className="rdesk-attention">{item.attentionLabel}</span> : null;
}

function Table({ rows, selectedId, onSelect }: Props) {
  return (
    <table className="rdesk-table rtray-table">
      <caption className="u-visually-hidden">Lista de cereri</caption>
      <thead>
        <tr>
          <th scope="col" className="rtray-table__time">Ora</th>
          <th scope="col">Cerere · client</th>
          <th scope="col" className="rtray-table__state">Stare cerere</th>
          <th scope="col" className="rtray-table__progress">Progres comercial</th>
          <th scope="col" className="rtray-table__action" data-align="end">Acțiune</th>
        </tr>
      </thead>
      {groupByDay(rows).map((day) => (
        <tbody key={day.key}>
          <tr className="rtray-table__day">
            <th scope="rowgroup" colSpan={5}>
              <span>{day.label}</span>
              <small>{`${day.items.length} ${day.items.length === 1 ? "intrare" : "intrări"}`}</small>
            </th>
          </tr>
          {day.items.map((item) => {
            const action = presentRequestWorklistAction(item);
            const selected = item.requestId === selectedId;
            return (
              <tr
                key={item.requestId}
                data-row
                data-row-id={item.requestId}
                data-selected={selected || undefined}
                data-attention={item.needsAttention || undefined}
                tabIndex={0}
                aria-selected={selected}
                aria-label={`Previzualizează cererea ${title(item)}`}
                aria-controls="cereri-dosar"
                onClick={(event) => {
                  if (clickedControl(event) || window.getSelection()?.toString()) return;
                  onSelect(item.requestId);
                }}
                onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(item.requestId);
                  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    moveRowFocus(event.currentTarget, event.key === "ArrowDown" ? 1 : -1, onSelect);
                  }
                }}
              >
                <td className="rtray-table__time">
                  <span className="rtray-axis" aria-hidden="true" />
                  <time dateTime={item.createdAt ?? undefined}>{entryTime(item.createdAt)}</time>
                </td>
                <td>
                  <a className="rdesk-title" href={requestHref(item.requestId)} title={title(item)}>{title(item)}</a>
                  <span className="rdesk-sub" title={context(item)}>{context(item)}</span>
                </td>
                <td className="rtray-table__state">
                  <RequestState item={item} />
                  <Attention item={item} />
                </td>
                <td className="rtray-table__progress"><CommercialProgress item={item} /></td>
                <td className="rtray-table__action" data-align="end">
                  <a className="rdesk-next" data-priority={item.needsAttention || undefined} href={action.actionHref}>
                    <span>{action.actionLabel}</span>
                    <span aria-hidden="true">→</span>
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}

function Cards({ rows, selectedId, onOpen }: Props) {
  return (
    <div className="rtray-days">
      {groupByDay(rows).map((day) => (
        <section key={day.key} className="rtray-day" aria-label={day.label}>
          <h3 className="rtray-day__head">
            <span>{day.label}</span>
            <small>{`${day.items.length} ${day.items.length === 1 ? "intrare" : "intrări"}`}</small>
          </h3>
          <ul className="rdesk-cards">
            {day.items.map((item) => {
              const action = presentRequestWorklistAction(item);
              const detailHref = requestHref(item.requestId);
              return (
                <li key={item.requestId} className="rdesk-card" data-attention={item.needsAttention || undefined} data-selected={item.requestId === selectedId || undefined}>
                  <button
                    type="button"
                    className="rdesk-card__open"
                    data-row-id={item.requestId}
                    aria-haspopup="dialog"
                    aria-label={`Deschide dosarul cererii ${title(item)}`}
                    onClick={() => onOpen(item.requestId)}
                  >
                    <span className="rtray-card__time"><span aria-hidden="true" />{entryTime(item.createdAt)}</span>
                    <span className="rtray-card__title">{title(item)}</span>
                    <span className="rdesk-sub">{context(item)}</span>
                    <span className="rtray-card__state">
                      <RequestState item={item} />
                      <CommercialProgress item={item} />
                    </span>
                    <Attention item={item} />
                  </button>
                  <div className="rdesk-card__doors">
                    <a className="rdesk-door" href={detailHref}>
                      <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3.5 5.5h13v9h-13zM3.5 5.5 10 10.5l6.5-5" /></svg>
                      <span><strong>Cererea</strong><small>{item.reference ?? "Pagina cererii"}</small></span>
                    </a>
                    {action.actionHref !== detailHref ? (
                      <a className="rdesk-door" data-next href={action.actionHref}>
                        <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 2.75h6.5l3.5 3.5v11H5zM11.5 2.75v3.5H15M7.5 10h5M7.5 13h5" /></svg>
                        <span><strong>{action.actionLabel}</strong><small>{item.nextAction === "CHOOSE_PRODUCT" ? "Configuratorul cererii" : "Pasul următor"}</small></span>
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Pagination({ paging, onPage, onPageSize }: Pick<Props, "paging" | "onPage" | "onPageSize">) {
  const { page, pageCount, pageSize, offset, shown, total } = paging;
  const numbers = [...new Set([1, page - 1, page, page + 1, pageCount])].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  return (
    <nav className="rtray-pages" aria-label="Paginare cereri">
      <span role="status">{`${offset + 1}–${offset + shown} din ${total} cereri`}</span>
      <label htmlFor="cereri-pe-pagina">
        Pe pagină
        <select id="cereri-pe-pagina" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
      </label>
      <div className="rtray-pages__steps">
        <button type="button" disabled={page === 1} onClick={() => onPage(page - 1)}>Anterior</button>
        {numbers.map((number, index) => (
          <span key={number}>
            {index > 0 && number - (numbers[index - 1] ?? number) > 1 ? <span aria-hidden="true">…</span> : null}
            <button type="button" aria-label={`Pagina ${number}`} aria-current={number === page ? "page" : undefined} onClick={() => onPage(number)}>{number}</button>
          </span>
        ))}
        <button type="button" disabled={page === pageCount} onClick={() => onPage(page + 1)}>Următor</button>
      </div>
    </nav>
  );
}

/** The intake register: search, density, new request, then the entries grouped by day. */
export function RequestsRegister(props: Props) {
  const { layout, view, refreshFailed, filters, sort, density, searchRef, onFilters, onSort, onDensity, onReset, onRetry, visibleCount, total, paging } = props;
  const ready = view !== "loading" && view !== "error";
  return (
    <section className="rdesk-register" aria-label="Registru cereri" data-register>
      <div className="rdesk-toolbar">
        <DeskSearch
          id="cereri-cauta"
          placeholder="Caută cerere, client sau referință"
          value={filters.query}
          layout={layout}
          inputRef={searchRef}
          onChange={(query) => onFilters({ ...filters, query })}
        />
        {layout === "docked" ? <DeskDensity value={density} onChange={onDensity} /> : null}
        <a className="rdesk-create" href={newRequestHref()}><PlusIcon />Cerere nouă</a>
      </div>
      {refreshFailed && total > 0 ? (
        <InlineAlert tone="error" title="Lista nu a putut fi actualizată">
          Datele afișate sunt de la ultima citire reușită.
          <button type="button" className="quiet-action" onClick={onRetry}>Reîncearcă</button>
        </InlineAlert>
      ) : null}
      <DeskCaption
        title={filters.attention ? "Necesită acțiune" : "Intrări"}
        count={ready ? `${visibleCount} din ${total}` : "Se citesc cererile"}
        showReset={hasRequestFilter(filters)}
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
          <ErrorState title="Cererile nu au putut fi citite">
            Lista de cereri nu este disponibilă.
            <button type="button" className="quiet-action" onClick={onRetry}>Reîncearcă</button>
          </ErrorState>
        ) : view === "empty" ? (
          <EmptyState
            title="Nu există cereri"
            description="Înregistrează clientul și lucrarea solicitată."
            action={<a className="text-link" href={newRequestHref()}>Creează o cerere</a>}
          />
        ) : view === "loading" ? (
          <DeskSkeleton />
        ) : view === "filtered-empty" ? (
          <div className="rdesk-empty">
            <EmptyState
              title="Nicio cerere nu corespunde filtrului."
              description={filters.attention && !filters.query.trim() && filters.status === null
                ? "Nu sunt cereri care necesită acțiune în registrul curent."
                : "Schimbă căutarea sau tava ori resetează filtrele pentru a reveni la registru."}
              action={<button type="button" className="rdesk-reset" onClick={onReset}>Afișează toate cererile</button>}
            />
          </div>
        ) : layout === "docked" ? (
          <Table {...props} />
        ) : (
          <Cards {...props} />
        )}
      </div>
      {view !== "error" && view !== "loading" && visibleCount > 0 ? (
        <Pagination paging={paging} onPage={props.onPage} onPageSize={props.onPageSize} />
      ) : null}
    </section>
  );
}
