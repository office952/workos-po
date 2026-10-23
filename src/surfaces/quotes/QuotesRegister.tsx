import type { KeyboardEvent, MouseEvent, Ref } from "react";
import type { QuoteListItemTransport } from "../../api/types";
import type { CollectionViewState } from "../../components/collectionViewState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { InlineAlert } from "../../components/InlineAlert";
import { presentQuoteWorklistAction } from "../../presentation/worklistAction";
import { jobHref, registryQuoteHref } from "../../routing/appRoute";
import {
  KIND_OPTIONS,
  createdLabel,
  createdShortLabel,
  hasActiveFilter,
  listValue,
  type RegistryFilters,
} from "./quoteRegistryModel";
import type { QuotesLayout } from "./useQuotesLayout";

type Props = {
  layout: QuotesLayout;
  view: CollectionViewState;
  refreshFailed: boolean;
  items: readonly QuoteListItemTransport[];
  total: number;
  filters: RegistryFilters;
  showKind: boolean;
  selectedId: string | null;
  searchRef: Ref<HTMLInputElement>;
  onFilters: (next: RegistryFilters) => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (quoteId: string) => void;
  onOpen: (quoteId: string) => void;
};

const SEARCH_ID = "oferte-cauta";

function clickedControl(event: MouseEvent): boolean {
  return event.target instanceof Element && Boolean(event.target.closest("a, button, input, select, textarea"));
}

function Lamp({ item }: { item: QuoteListItemTransport }) {
  return <span className="offers-lamp" data-filled={Boolean(item.orderSnapshotId) || undefined} aria-hidden="true" />;
}

function Value({ item }: { item: QuoteListItemTransport }) {
  const value = listValue(item);
  if (!value) return <span className="offers-v2__value">—</span>;
  return (
    <span className="offers-v2__value">
      <span className="offers-v2__amount">{value.amount}</span>
      {value.currency ? <span className="offers-v2__currency"> {value.currency}</span> : null}
    </span>
  );
}

function Attention({ item }: { item: QuoteListItemTransport }) {
  if (!item.attentionLabel) return null;
  return (
    <span className="offers-v2__attention" data-flag={item.needsAttention || undefined}>
      {item.attentionLabel}
    </span>
  );
}

function KindFilter({ layout, filters, onFilters }: Pick<Props, "layout" | "filters" | "onFilters">) {
  return (
    <div className={layout === "docked" ? "offers-segment" : "offers-chips"} role="group" aria-label="Tip">
      <span className="offers-segment__label" aria-hidden="true">Tip</span>
      {KIND_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={filters.kind === option.id}
          onClick={() => onFilters({ ...filters, kind: option.id })}
        >
          {layout !== "docked" && filters.kind === option.id ? <span className="offers-chips__check" aria-hidden="true" /> : null}
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toolbar(props: Props) {
  const { layout, filters, showKind, searchRef, onFilters } = props;
  return (
    <div className="offers-v2__toolbar">
      <div className="offers-search">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" />
        </svg>
        <label className="u-visually-hidden" htmlFor={SEARCH_ID}>Caută</label>
        <input
          ref={searchRef}
          id={SEARCH_ID}
          type="search"
          placeholder="Caută ofertă, client, cerere sau produs"
          value={filters.query}
          onChange={(event) => onFilters({ ...filters, query: event.target.value })}
        />
        {filters.query ? (
          <button type="button" className="offers-search__clear" aria-label="Golește căutarea" onClick={() => onFilters({ ...filters, query: "" })}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15" /></svg>
          </button>
        ) : layout === "docked" ? (
          <kbd className="offers-search__key" aria-hidden="true">/</kbd>
        ) : null}
      </div>
      {showKind ? <KindFilter layout={layout} filters={filters} onFilters={onFilters} /> : null}
    </div>
  );
}

function Caption({ view, items, total, filters, onReset, layout }: Props) {
  const ready = view !== "loading" && view !== "error";
  return (
    <div className="offers-v2__caption">
      <h2>{filters.attention ? "Necesită atenție" : "Lista de oferte"}</h2>
      <span className="offers-v2__count" role={items.length === 0 || !ready ? "status" : undefined}>
        {ready ? `${items.length} din ${total}` : "Se citesc ofertele"}
      </span>
      {hasActiveFilter(filters) ? (
        <button type="button" className="offers-reset" onClick={onReset}>
          Resetează filtrele <span aria-hidden="true">×</span>
        </button>
      ) : null}
      {layout === "docked" ? (
        <span className="offers-v2__keys" aria-hidden="true">↑ ↓ selectează · Enter deschide · / caută</span>
      ) : null}
    </div>
  );
}

function moveFocus(from: HTMLElement, delta: number, onSelect: (id: string) => void) {
  const rows = Array.from(from.closest("[data-register]")?.querySelectorAll<HTMLElement>("[data-quote-id]") ?? []);
  const index = rows.indexOf(from);
  const next = rows[index + delta];
  if (!next) return;
  next.focus();
  const id = next.dataset.quoteId;
  if (id) onSelect(id);
}

function Table({ items, selectedId, onSelect }: Props) {
  return (
    <table className="offers-v2__table">
      <caption className="u-visually-hidden">Lista de oferte</caption>
      <thead>
        <tr>
          <th scope="col" className="offers-v2__col-ref">Ofertă</th>
          <th scope="col" className="offers-v2__col-client">Client · produs</th>
          <th scope="col" className="offers-v2__col-value">Total cu TVA</th>
          <th scope="col" className="offers-v2__col-state">Stare</th>
          <th scope="col" className="offers-v2__col-action">Acțiune</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const action = presentQuoteWorklistAction(item);
          const selected = item.quoteSnapshotId === selectedId;
          return (
            <tr
              key={item.quoteSnapshotId}
              data-quote-id={item.quoteSnapshotId}
              data-selected={selected || undefined}
              data-attention={item.needsAttention || undefined}
              tabIndex={0}
              aria-selected={selected}
              aria-label={`Previzualizează oferta ${item.reference}`}
              aria-controls="oferte-dosar"
              onClick={(event) => {
                if (clickedControl(event) || window.getSelection()?.toString()) return;
                onSelect(item.quoteSnapshotId);
              }}
              onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(item.quoteSnapshotId);
                } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  moveFocus(event.currentTarget, event.key === "ArrowDown" ? 1 : -1, onSelect);
                }
              }}
            >
              <td className="offers-v2__col-ref">
                <a className="offers-v2__ref" href={registryQuoteHref(item)}>{item.reference || "Ofertă"}</a>
                <span className="offers-v2__meta" title={createdLabel(item) ?? undefined}>
                  {item.kindLabel}
                  {createdShortLabel(item) ? <span className="offers-v2__meta-time"> · {createdShortLabel(item)}</span> : null}
                </span>
              </td>
              <td className="offers-v2__col-client">
                <span className="offers-v2__client">{item.customerDisplayName ?? "Fără client"}</span>
                <span className="offers-v2__product" title={item.productLabel || undefined}>
                  {[item.productLabel, item.requestReference].filter(Boolean).join("  ·  ") || "—"}
                </span>
              </td>
              <td className="offers-v2__col-value"><Value item={item} /></td>
              <td className="offers-v2__col-state">
                <span className="offers-v2__state"><Lamp item={item} />{item.stageLabel || "—"}</span>
                <Attention item={item} />
              </td>
              <td className="offers-v2__col-action">
                <a className="offers-v2__next" data-priority={item.needsAttention || undefined} href={action.actionHref}>
                  <span>{action.actionLabel}</span>
                  <span aria-hidden="true">→</span>
                </a>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Cards({ items, selectedId, onOpen }: Props) {
  return (
    <ul className="offers-cards">
      {items.map((item) => {
        const action = presentQuoteWorklistAction(item);
        const offerHref = registryQuoteHref(item);
        const orderHref = item.orderSnapshotId ? jobHref(item.orderSnapshotId) : null;
        const value = listValue(item);
        return (
          <li
            key={item.quoteSnapshotId}
            className="offer-card"
            data-attention={item.needsAttention || undefined}
            data-selected={item.quoteSnapshotId === selectedId || undefined}
          >
            <button
              type="button"
              className="offer-card__open"
              data-quote-id={item.quoteSnapshotId}
              aria-haspopup="dialog"
              aria-label={`Deschide dosarul ofertei ${item.reference}`}
              onClick={() => onOpen(item.quoteSnapshotId)}
            >
              <span className="offer-card__top">
                <span className="offer-card__ref"><Lamp item={item} />{item.reference || "Ofertă"}</span>
                <span className="offers-v2__value">
                  <span className="offers-v2__amount">{value?.amount ?? "—"}</span>
                  {value?.currency ? <span className="offers-v2__currency"> {value.currency}</span> : null}
                </span>
              </span>
              <span className="offer-card__client">{item.customerDisplayName ?? "Fără client"}</span>
              <span className="offer-card__product">{item.productLabel || "—"}</span>
              <span className="offer-card__meta">
                <span className="offer-card__stage">{item.stageLabel || "—"}</span>
                {[item.kindLabel, item.requestReference].filter(Boolean).join(" · ")}
              </span>
              <Attention item={item} />
            </button>
            <div className="offer-card__doors">
              <a className="offer-card__door" href={offerHref} data-next={action.actionHref === offerHref || undefined}>
                <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 2.75h6.5l3.5 3.5v11H5zM11.5 2.75v3.5H15M7.5 10h5M7.5 13h5" /></svg>
                <span><strong>Oferta</strong><small>{item.reference}</small></span>
              </a>
              {orderHref ? (
                <a className="offer-card__door" href={orderHref} data-next={action.actionHref === orderHref || undefined}>
                  <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3.5 6.5h13v10h-13zM7 6.5V4h6v2.5M3.5 10.5h13" /></svg>
                  <span><strong>Comanda</strong><small>Fișa lucrării</small></span>
                </a>
              ) : (
                <span className="offer-card__door" aria-disabled="true">
                  <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3.5 6.5h13v10h-13zM7 6.5V4h6v2.5M3.5 10.5h13" /></svg>
                  <span><strong>Comanda</strong><small>Fără comandă încă</small></span>
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Skeleton({ layout }: { layout: QuotesLayout }) {
  return (
    <div className="offers-v2__skeleton" aria-hidden="true" data-layout={layout}>
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

/** The register: search, kind filter, then rows (wide) or cards with two doors (narrow). */
export function QuotesRegister(props: Props) {
  const { layout, view, refreshFailed, onRetry, onReset } = props;
  return (
    <section className="offers-v2__register" aria-label="Registru oferte" data-register data-scroll-memory="registru">
      <Toolbar {...props} />
      {refreshFailed && props.total > 0 ? (
        <InlineAlert tone="error" title="Lista nu a putut fi actualizată">
          Datele afișate sunt de la ultima citire reușită.
          <button type="button" className="quiet-action" onClick={onRetry}>Reîncearcă</button>
        </InlineAlert>
      ) : null}
      <Caption {...props} />
      <div className="offers-v2__list" aria-busy={view === "loading" || view === "refreshing"}>
        {view === "error" ? (
          <ErrorState title="Ofertele nu au putut fi citite">
            Lista de oferte nu este disponibilă.
            <button type="button" className="quiet-action" onClick={onRetry}>Reîncearcă</button>
          </ErrorState>
        ) : view === "empty" ? (
          <EmptyState
            title="Nu există oferte înghețate."
            description="Ofertele apar aici după înghețarea unei configurații dintr-o cerere."
          />
        ) : view === "loading" ? (
          <Skeleton layout={layout} />
        ) : view === "filtered-empty" ? (
          <div className="offers-v2__empty">
            {layout === "docked" ? <Table {...props} items={[]} /> : null}
            <EmptyState
              title="Nicio ofertă nu corespunde filtrului."
              description="Schimbă căutarea sau resetează filtrele pentru a reveni la registru."
              action={
                <button type="button" className="offers-reset" onClick={onReset}>
                  Afișează toate ofertele
                </button>
              }
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
