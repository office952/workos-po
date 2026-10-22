import { useEffect, useMemo, useRef, useState } from "react";
import { collectionViewState } from "../components/collectionViewState";
import { invalidateResources } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { loadQuoteList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { globalNavItems } from "../layout/globalNav";
import { PageRegion } from "../layout/PageRegion";
import { parseQuotesSelection, quotesHref, type QuotesSheet } from "../routing/appRoute";
import { navigate } from "../routing/navigate";
import { DossierDialog, QuoteDossier, type DossierEmpty } from "./quotes/QuoteDossier";
import {
  EMPTY_FILTERS,
  filterQuotes,
  isTypingTarget,
  positionIn,
  presentSignalTiles,
  showsKindFilter,
  type RegistryFilters,
} from "./quotes/quoteRegistryModel";
import { QuotesRegister } from "./quotes/QuotesRegister";
import { QuotesSignalBoard } from "./quotes/QuotesSignalBoard";
import { useQuotesLayout } from "./quotes/useQuotesLayout";
import "../styles/surfaces/offers-desk.css";

const MODULE_INDEX = String(globalNavItems().findIndex((item) => item.href === "/oferte") + 1).padStart(2, "0");

function focusQuote(quoteId: string): void {
  const escaped = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(quoteId) : quoteId;
  document.querySelector<HTMLElement>(`[data-quote-id="${escaped}"]`)?.focus();
}

/**
 * Oferte coordinates the register and the dossier. The selected offer and its front sheet
 * live in the URL (?oferta=…&foaie=comanda); search and filters stay in memory, so opening
 * or closing the dossier never resets them.
 */
export function QuotesPage({ search = "" }: { search?: string }) {
  const quotes = useResource(resourceKeys.quotes(), loadQuoteList);
  const items = useMemo(() => quotes.data ?? [], [quotes.data]);
  const [filters, setFilters] = useState<RegistryFilters>(EMPTY_FILTERS);
  const searchRef = useRef<HTMLInputElement>(null);
  const layout = useQuotesLayout();
  const selection = parseQuotesSelection(search);
  const pushedRef = useRef(false);
  const openerRef = useRef<string | null>(null);
  const previousSelection = useRef(selection.quoteId);

  const visible = useMemo(() => filterQuotes(items, filters), [items, filters]);
  const tiles = useMemo(() => presentSignalTiles(items, filters), [items, filters]);
  const view = collectionViewState(quotes.status, items.length, visible.length);
  const listReady = quotes.status === "success" || items.length > 0;
  const selected = items.find((item) => item.quoteSnapshotId === selection.quoteId) ?? null;
  const index = positionIn(visible, selection.quoteId);
  const dialogOpen = layout !== "docked" && selection.quoteId !== null;

  const empty: DossierEmpty = !listReady
    ? quotes.status === "error"
      ? "unavailable"
      : "loading"
    : selection.quoteId && !selected
      ? "not-found"
      : view === "filtered-empty"
        ? "filtered"
        : "none";

  useEffect(() => {
    const before = previousSelection.current;
    previousSelection.current = selection.quoteId;
    if (selection.quoteId) return;
    pushedRef.current = false;
    if (before && layout !== "docked") {
      // Closing the dialog (button, Esc or browser Back) returns focus to what opened it.
      focusQuote(openerRef.current ?? before);
    }
  }, [selection.quoteId, layout]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target) || dialogOpen) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen]);

  function select(quoteId: string): void {
    navigate(quotesHref({ quoteId, sheet: quoteId === selection.quoteId ? selection.sheet : "oferta" }), "replace");
  }

  function open(quoteId: string): void {
    openerRef.current = quoteId;
    if (!selection.quoteId) {
      pushedRef.current = true;
      navigate(quotesHref({ quoteId }), "push");
    } else {
      navigate(quotesHref({ quoteId }), "replace");
    }
  }

  function close(): void {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      navigate(quotesHref(), "replace");
    }
  }

  function move(delta: number): void {
    const next = visible[index + delta];
    if (!next) return;
    navigate(quotesHref({ quoteId: next.quoteSnapshotId, sheet: selection.sheet }), "replace");
    if (layout === "docked" && document.activeElement?.closest("[data-register]")) {
      focusQuote(next.quoteSnapshotId);
    }
  }

  function setSheet(sheet: QuotesSheet): void {
    navigate(quotesHref({ quoteId: selection.quoteId, sheet }), "replace");
  }

  function changeFilters(next: RegistryFilters): void {
    setFilters(next);
    if (selection.quoteId && !filterQuotes(items, next).some((item) => item.quoteSnapshotId === selection.quoteId)) {
      navigate(quotesHref(), "replace");
    }
  }

  function resetFilters(): void {
    changeFilters(EMPTY_FILTERS);
    searchRef.current?.focus();
  }

  const dossier = (
    <QuoteDossier
      layout={layout}
      item={selected}
      empty={empty}
      sheet={selection.sheet}
      position={{ index, count: visible.length }}
      onSheet={setSheet}
      onMove={move}
      onClose={layout === "docked" ? undefined : close}
    />
  );

  return (
    <PageRegion>
      <div className="offers-desk" data-surface="quotes-registry" data-layout={layout}>
        <header className="offers-desk__bar">
          <div className="offers-desk__title">
            <p className="offers-desk__eyebrow">
              <span aria-hidden="true" />
              {MODULE_INDEX} · Registru comercial
            </p>
            <h1>Oferte</h1>
          </div>
          <QuotesSignalBoard tiles={tiles} ready={listReady} filters={filters} onChange={changeFilters} />
        </header>
        <div className="offers-desk__work">
          <QuotesRegister
            layout={layout}
            view={view}
            refreshFailed={quotes.status === "error"}
            items={visible}
            total={items.length}
            filters={filters}
            showKind={showsKindFilter(items)}
            selectedId={selection.quoteId}
            searchRef={searchRef}
            onFilters={changeFilters}
            onReset={resetFilters}
            onRetry={() => invalidateResources(resourceKeys.quotes())}
            onSelect={layout === "docked" ? select : open}
            onOpen={open}
          />
          {layout === "docked" ? dossier : null}
        </div>
        {dialogOpen ? <DossierDialog layout={layout} onClose={close}>{dossier}</DossierDialog> : null}
        <span className="u-visually-hidden" aria-live="polite" aria-atomic="true">
          {selected ? `Dosarul afișează oferta ${selected.reference}` : ""}
        </span>
      </div>
    </PageRegion>
  );
}
