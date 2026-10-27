import type { KeyboardEvent, ReactNode, Ref } from "react";
import type { CustomerRegistryItemTransport } from "../../api/types";
import type { CollectionViewState } from "../../components/collectionViewState";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { InlineAlert } from "../../components/InlineAlert";
import { clientHref } from "../../routing/appRoute";
import { clickedControl, moveRowFocus } from "../desk/deskKeys";
import { DeskCaption, DeskDensity, DeskSearch, DeskSkeleton, PlusIcon, type Density } from "../desk/DeskToolbar";
import type { DeskLayout } from "../desk/useDeskLayout";
import { letterAnchor } from "./agendaAnchors";
import { groupByLetter, identityLine, type ClientFilters } from "./clientsAgendaModel";
import { ClientMark } from "./ClientMark";

type Props = {
  layout: DeskLayout;
  view: CollectionViewState;
  denied: boolean;
  refreshFailed: boolean;
  items: readonly CustomerRegistryItemTransport[];
  total: number;
  filters: ClientFilters;
  density: Density;
  canCreate: boolean;
  selectedId: string | null;
  searchRef: Ref<HTMLInputElement>;
  onFilters: (next: ClientFilters) => void;
  onDensity: (next: Density) => void;
  onCreate: () => void;
  onReset: () => void;
  onRetry: () => void;
  onSelect: (customerId: string) => void;
  onOpen: (customerId: string) => void;
  /** Phone (compact): filter chips and the A–Z toggle, right under the search. */
  filtersSlot?: ReactNode;
};

/**
 * Open requests apart from the totals: openRequestCount vs quoteCount and workCount. "lucrări" is
 * every work of the client (WorkOS jobs and historical records, N-020), the same number as its tab.
 */
export function Relation({ customer }: { customer: Pick<CustomerRegistryItemTransport, "openRequestCount" | "quoteCount" | "jobCount" | "historicalWorkCount" | "workCount"> }) {
  return (
    <span className="cagenda-rel">
      <span className="cagenda-rel__open" data-zero={customer.openRequestCount === 0 || undefined}>
        <span aria-hidden="true" />
        Cereri deschise <strong>{customer.openRequestCount}</strong>
      </span>
      <span className="cagenda-rel__total">
        <small>Total</small> oferte <strong>{customer.quoteCount}</strong> · <span title={`În WorkOS: ${customer.jobCount} · istorice: ${customer.historicalWorkCount}`}>lucrări <strong>{customer.workCount}</strong></span>
      </span>
    </span>
  );
}

export function ClientState({ customer }: { customer: Pick<CustomerRegistryItemTransport, "status" | "statusLabel"> }) {
  return (
    <span className="rdesk-state">
      <span className="rdesk-lamp" data-filled={customer.status === "ACTIVE" || undefined} aria-hidden="true" />
      {customer.statusLabel || "—"}
    </span>
  );
}

function Identity({ customer }: { customer: CustomerRegistryItemTransport }) {
  const line = identityLine(customer);
  return (
    <span className="cagenda-id">
      <ClientMark name={customer.displayName} logo={customer.logo} />
      <span className="cagenda-id__text">
        <a className="rdesk-title" href={clientHref(customer.customerId)} title={customer.displayName}>{customer.displayName}</a>
        <span className="rdesk-sub" data-missing={line.missing || undefined}>{line.text}</span>
      </span>
    </span>
  );
}

function Table({ items, selectedId, onSelect }: Props) {
  return (
    <table className="rdesk-table cagenda-table">
      <caption className="u-visually-hidden">Clienți înregistrați</caption>
      <thead>
        <tr>
          <th scope="col">Client</th>
          <th scope="col" className="cagenda-table__rel">Relație</th>
          <th scope="col" className="cagenda-table__state">Stare</th>
          <th scope="col" className="cagenda-table__action" data-align="end">Acțiune</th>
        </tr>
      </thead>
      {groupByLetter(items).map((group) => (
        <tbody key={group.letter}>
          <tr className="cagenda-table__letter">
            <th scope="rowgroup" colSpan={4} id={letterAnchor(group.letter)}>
              <span>{group.letter}</span>
            </th>
          </tr>
          {group.items.map((customer) => {
            const selected = customer.customerId === selectedId;
            return (
              <tr
                key={customer.customerId}
                data-row
                data-row-id={customer.customerId}
                data-selected={selected || undefined}
                data-arrival-target={selected || undefined}
                data-attention={customer.needsAttention || undefined}
                tabIndex={0}
                aria-selected={selected}
                aria-label={`Previzualizează clientul ${customer.displayName}`}
                aria-controls="clienti-dosar"
                onClick={(event) => {
                  if (clickedControl(event) || window.getSelection()?.toString()) return;
                  onSelect(customer.customerId);
                }}
                onKeyDown={(event: KeyboardEvent<HTMLTableRowElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(customer.customerId);
                    // Enter opens the card: focus moves into it; Escape there returns to this row.
                    if (event.key === "Enter") window.requestAnimationFrame(() => document.getElementById("clienti-dosar")?.focus());
                  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    moveRowFocus(event.currentTarget, event.key === "ArrowDown" ? 1 : -1, onSelect);
                  }
                }}
              >
                <td><Identity customer={customer} /></td>
                <td className="cagenda-table__rel"><Relation customer={customer} /></td>
                <td className="cagenda-table__state">
                  <ClientState customer={customer} />
                  {customer.attentionLabel ? <span className="rdesk-attention">{customer.attentionLabel}</span> : null}
                </td>
                <td className="cagenda-table__action" data-align="end">
                  <a className="rdesk-next" data-priority={customer.needsAttention || undefined} href={clientHref(customer.customerId)}>
                    <span>Deschide clientul</span>
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

function Cards({ items, selectedId, onOpen }: Props) {
  return (
    <div className="cagenda-groups">
      {groupByLetter(items).map((group) => (
        <section key={group.letter} className="cagenda-group" aria-labelledby={letterAnchor(group.letter)}>
          <h3 className="cagenda-group__letter" id={letterAnchor(group.letter)}>{group.letter}</h3>
          <ul className="rdesk-cards">
            {group.items.map((customer) => {
              const line = identityLine(customer);
              const contact = [customer.contactName, customer.phone].filter(Boolean).join("  ·  ");
              return (
                <li key={customer.customerId} className="rdesk-card" data-attention={customer.needsAttention || undefined} data-selected={customer.customerId === selectedId || undefined} data-arrival-target={customer.customerId === selectedId || undefined}>
                  <button
                    type="button"
                    className="rdesk-card__open"
                    data-row-id={customer.customerId}
                    aria-haspopup="dialog"
                    aria-label={`Deschide cartela clientului ${customer.displayName}`}
                    onClick={() => onOpen(customer.customerId)}
                  >
                    <span className="cagenda-id">
                      <ClientMark name={customer.displayName} logo={customer.logo} />
                      <span className="cagenda-id__text">
                        <span className="rdesk-title">{customer.displayName}</span>
                        <span className="rdesk-sub" data-missing={line.missing || undefined}>{line.text}</span>
                      </span>
                    </span>
                    <Relation customer={customer} />
                    {contact ? <span className="rdesk-sub">{contact}</span> : null}
                    {customer.attentionLabel ? <span className="rdesk-attention">{customer.attentionLabel}</span> : null}
                  </button>
                  <div className="rdesk-card__doors">
                    <a className="rdesk-door" data-next href={clientHref(customer.customerId)}>
                      <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 2.75h6.5l3.5 3.5v11H5zM11.5 2.75v3.5H15M7.5 10h5M7.5 13h5" /></svg>
                      <span><strong>Fișa clientului</strong><small>Toate documentele clientului</small></span>
                    </a>
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

/** The agenda register: search, density, new client, then clients grouped by letter. */
export function ClientsRegister(props: Props) {
  const { layout, view, denied, refreshFailed, filters, density, canCreate, searchRef, onFilters, onDensity, onCreate, onReset, onRetry, items, total, filtersSlot } = props;
  const ready = view !== "loading" && view !== "error";
  return (
    <section className="rdesk-register" aria-label="Registru clienți" data-register data-scroll-memory="registru">
      <div className="rdesk-toolbar">
        <DeskSearch
          id="clienti-cauta"
          placeholder="Caută client, CUI, oraș sau contact"
          value={filters.query}
          layout={layout}
          inputRef={searchRef}
          onChange={(query) => onFilters({ ...filters, query })}
        />
        {layout === "docked" ? <DeskDensity value={density} onChange={onDensity} /> : null}
        {canCreate ? (
          <button type="button" className="rdesk-create" onClick={onCreate}><PlusIcon />Client nou</button>
        ) : null}
      </div>
      {filtersSlot}
      {refreshFailed && total > 0 ? (
        <InlineAlert tone="error" title="Lista nu a putut fi actualizată">
          Datele afișate sunt de la ultima citire reușită.
          <button type="button" className="quiet-action" onClick={onRetry}>Reîncearcă</button>
        </InlineAlert>
      ) : null}
      <DeskCaption
        title={filters.chip === "attention" ? "Necesită acțiune" : "Lista de clienți"}
        count={ready ? `${items.length} din ${total}` : denied ? "—" : "Se citesc clienții"}
        showReset={filters.query.trim() !== "" || filters.chip !== "all"}
        onReset={onReset}
        keys={layout === "docked" ? "↑ ↓ selectează · Enter deschide cartela · / caută" : false}
      />
      <div aria-busy={view === "loading" || view === "refreshing"}>
        {view === "error" ? (
          <ErrorState title={denied ? "Acces refuzat" : "Lista nu a putut fi citită"}>
            {denied ? "Nu ai acces la registrul de clienți în această organizație." : "Lista de clienți nu este disponibilă momentan."}
            <button type="button" className="quiet-action" onClick={onRetry}>Reîncearcă</button>
          </ErrorState>
        ) : view === "empty" ? (
          <EmptyState title="Nu există încă clienți" description="Înregistrează primul client." />
        ) : view === "loading" ? (
          <DeskSkeleton />
        ) : view === "filtered-empty" ? (
          <div className="rdesk-empty">
            <EmptyState
              title="Niciun client nu corespunde filtrului."
              description="Schimbă căutarea sau resetează filtrele pentru a reveni la agendă."
              action={<button type="button" className="rdesk-reset" onClick={onReset}>Afișează toți clienții</button>}
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
