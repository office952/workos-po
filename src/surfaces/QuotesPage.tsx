import { useEffect, useMemo, useRef, useState } from "react";
import type { QuoteKindTransport, QuoteListItemTransport } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { InlineAlert } from "../components/InlineAlert";
import { collectionViewState } from "../components/collectionViewState";
import { resourceKeys } from "../data/resourceKeys";
import { invalidateResources } from "../data/resourceCache";
import { loadQuoteList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";
import { matchesSearch, uniqueLabels } from "../presentation/listFilter";
import { presentQuoteWorklistAction } from "../presentation/worklistAction";
import { jobHref, registryQuoteHref } from "../routing/appRoute";
import "../styles/surfaces/offers.css";

const ALL = "all";
type KindFilter = typeof ALL | QuoteKindTransport;
type AttentionFilter = typeof ALL | "attention";

const KIND_OPTIONS: readonly { id: KindFilter; label: string }[] = [
  { id: ALL, label: "Toate" },
  { id: "PRODUCT", label: "Produse" },
  { id: "ASSEMBLY", label: "Ansambluri" },
];

function usePreviewViewport(): boolean {
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

function kindDetail(item: QuoteListItemTransport): string {
  return item.kind === "ASSEMBLY" ? `${item.kindLabel} · ${item.sectionCount} secțiuni` : item.kindLabel;
}

function quoteValue(item: QuoteListItemTransport): string | null {
  return item.grossDisplay ? `${item.grossDisplay} ${item.currency ?? ""}`.trim() : null;
}

function FilterSegment<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="offers-segment" role="group" aria-label={label}>
      <span className="offers-segment__label" aria-hidden="true">{label}</span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function QuoteSheet({ item, selected }: { item: QuoteListItemTransport; selected: boolean }) {
  const value = quoteValue(item);
  return (
    <div className="offers-sheet">
      <p className="offers-sheet__head">
        <span>{selected ? "Ofertă selectată" : "Ultima ofertă"}</span>
        <span>{formatTimestamp(item.createdAt) ?? "—"}</span>
      </p>
      <p className="offers-sheet__identity">
        <strong>{item.reference || "—"}</strong>
        <span className="offers-kind" data-kind={item.kind}>{kindDetail(item)}</span>
      </p>
      <p className="offers-sheet__client">
        {[item.customerDisplayName ?? "Fără client", item.requestReference].filter(Boolean).join(" · ")}
      </p>
      <p className="offers-sheet__offer">{item.productLabel}</p>
      <dl className="offers-sheet__facts">
        <div>
          <dt>Total cu TVA</dt>
          <dd className="offers-sheet__value">{value ?? "—"}</dd>
        </div>
        <div>
          <dt>Stare</dt>
          <dd>{item.stageLabel || "—"}</dd>
        </div>
      </dl>
      <p className="offers-sheet__actions">
        <a className="offers-next" href={registryQuoteHref(item)}>
          <span>Deschide oferta</span>
          <span aria-hidden="true">→</span>
        </a>
        {item.orderSnapshotId ? (
          <a className="offers-next offers-next--quiet" href={jobHref(item.orderSnapshotId)}>
            <span>Deschide comanda</span>
            <span aria-hidden="true">→</span>
          </a>
        ) : null}
      </p>
    </div>
  );
}

export function QuotesPage() {
  const quotes = useResource(resourceKeys.quotes(), loadQuoteList);
  const items = useMemo(() => quotes.data ?? [], [quotes.data]);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<KindFilter>(ALL);
  const [stage, setStage] = useState(ALL);
  const [attention, setAttention] = useState<AttentionFilter>(ALL);
  const showPreview = usePreviewViewport();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const showKind = useMemo(() => new Set(items.map((item) => item.kind)).size > 1, [items]);
  const stageOptions = useMemo(
    () => [
      { id: ALL, label: "Toate" },
      ...uniqueLabels(items.map((item) => item.stageLabel)).map((label) => ({ id: label, label })),
    ],
    [items],
  );
  const attentionCount = useMemo(() => items.filter((item) => item.needsAttention).length, [items]);
  const latest = useMemo(() => {
    const dated = items.filter((item) => timestamp(item.createdAt) !== null);
    return dated.sort((a, b) => timestamp(b.createdAt)! - timestamp(a.createdAt)!)[0] ?? items[0];
  }, [items]);
  const selected = items.find((item) => item.quoteSnapshotId === selectedId);
  // Forget a removed selection so it cannot return unexpectedly on a later refresh.
  if (selectedId && quotes.status === "success" && !selected) setSelectedId(null);
  const sheet = selected ?? latest;

  const visible = useMemo(
    () =>
      items.filter(
        (item) =>
          (attention === ALL || item.needsAttention) &&
          (kind === ALL || !showKind || item.kind === kind) &&
          (stage === ALL || item.stageLabel === stage) &&
          matchesSearch(query, [
            item.reference,
            item.inscription,
            item.productLabel,
            item.customerDisplayName,
            item.stageLabel,
            item.nextActionLabel,
            item.requestReference,
            item.attentionLabel,
            item.kindLabel,
          ]),
      ),
    [items, query, kind, stage, attention, showKind],
  );
  const view = collectionViewState(quotes.status, items.length, visible.length);
  const hasFilter = query.trim().length > 0 || kind !== ALL || stage !== ALL || attention !== ALL;
  const count = (value: number) => (quotes.status === "success" ? String(value).padStart(2, "0") : "—");

  function resetFilters() {
    setQuery("");
    setKind(ALL);
    setStage(ALL);
    setAttention(ALL);
    searchRef.current?.focus();
  }

  return (
    <SlicePage
      contextLabel="Oferte"
      currentHref="/oferte"
      workspace="stack"
      surface="quotes-registry"
      headerVariant="pilot"
      eyebrow="Registru comercial"
      title="Oferte"
      action={showPreview && quotes.status === "success" && sheet ? (
        <div id="oferte-fisa" className="offers-preview" aria-label="Fișă ofertă">
          <QuoteSheet item={sheet} selected={Boolean(selected)} />
          <span className="u-visually-hidden" aria-live="polite" aria-atomic="true">
            {selected ? `Fișa afișează oferta ${selected.reference}` : ""}
          </span>
        </div>
      ) : undefined}
      instrument={
        <div className="pilot-instrument" role="group" aria-label="Filtre registru oferte">
          <button
            type="button"
            className="pilot-instrument__metric"
            aria-pressed={attention === ALL}
            onClick={() => setAttention(ALL)}
          >
            <strong className="pilot-instrument__metric-value">{count(items.length)}</strong>
            <span className="pilot-instrument__metric-label">Oferte</span>
          </button>
          <button
            type="button"
            className="pilot-instrument__metric pilot-instrument__metric--attention"
            data-attention={attentionCount > 0}
            aria-pressed={attention === "attention"}
            onClick={() => setAttention("attention")}
          >
            <strong className="pilot-instrument__metric-value">{count(attentionCount)}</strong>
            <span className="pilot-instrument__metric-label">Necesită atenție</span>
          </button>
        </div>
      }
    >
      <section className="offers-register" aria-label="Registru oferte">
        <div className="offers-toolbar">
          <div className="offers-search">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="10" cy="10" r="6" />
              <path d="m15 15 5 5" />
            </svg>
            <label className="u-visually-hidden" htmlFor="oferte-cauta">Caută</label>
            <input
              ref={searchRef}
              id="oferte-cauta"
              type="search"
              placeholder="Caută ofertă, client, cerere sau produs"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="offers-toolbar__filters">
            {showKind ? (
              <FilterSegment label="Tip" options={KIND_OPTIONS} value={kind} onChange={setKind} />
            ) : null}
            {stageOptions.length > 2 ? (
              <FilterSegment label="Stare" options={stageOptions} value={stage} onChange={setStage} />
            ) : null}
          </div>
        </div>
        {quotes.status === "error" && items.length > 0 ? (
          <InlineAlert tone="error" title="Lista nu a putut fi actualizată">
            Datele afișate sunt de la ultima citire reușită.
            <button type="button" className="quiet-action" onClick={() => invalidateResources(resourceKeys.quotes())}>Reîncearcă</button>
          </InlineAlert>
        ) : null}
        <div className="offers-register__strip">
          <h2>{attention === "attention" ? "Necesită atenție" : "Lista de oferte"}</h2>
          <span className="offers-result" role={visible.length === 0 || quotes.status !== "success" ? "status" : undefined}>
            {quotes.status === "success" || items.length > 0 ? `${visible.length} din ${items.length}` : "Se citesc ofertele"}
          </span>
          {hasFilter ? (
            <button type="button" className="offers-reset" onClick={resetFilters}>
              Resetează filtrele <span aria-hidden="true">×</span>
            </button>
          ) : null}
        </div>
        {view === "error" ? (
          <div className="offers-feedback">
            <ErrorState title="Ofertele nu au putut fi citite">
              Lista de oferte nu este disponibilă.
              <button type="button" className="quiet-action" onClick={() => invalidateResources(resourceKeys.quotes())}>Reîncearcă</button>
            </ErrorState>
          </div>
        ) : view === "empty" ? (
          <div className="offers-feedback">
            <EmptyState
              title="Nu există oferte înghețate."
              description="Ofertele apar aici după înghețarea unei configurații dintr-o cerere."
            />
          </div>
        ) : (
          <div className="offers-table-wrap" aria-busy={view === "loading" || view === "refreshing"}>
            <table className="offers-table">
              <caption className="u-visually-hidden">Lista de oferte</caption>
              <thead>
                <tr>
                  <th scope="col" className="offers-table__identity">Ofertă</th>
                  <th scope="col" className="offers-table__client">Client</th>
                  <th scope="col" className="offers-table__offer">Ofertat</th>
                  <th scope="col" className="offers-table__value">Total cu TVA</th>
                  <th scope="col" className="offers-table__state">Stare</th>
                  <th scope="col" className="offers-table__date">Creată</th>
                  <th scope="col" className="offers-table__action">Acțiune</th>
                </tr>
              </thead>
              <tbody>
                {view === "filtered-empty" ? (
                  <tr className="offers-no-results">
                    <td colSpan={7}>
                      <EmptyState
                        title="Nicio ofertă nu corespunde filtrului."
                        description="Schimbă căutarea sau resetează filtrele pentru a reveni la registru."
                        action={
                          <button type="button" className="offers-reset" onClick={resetFilters}>
                            Afișează toate ofertele
                          </button>
                        }
                      />
                    </td>
                  </tr>
                ) : view === "loading"
                  ? Array.from({ length: 4 }, (_, index) => (
                      <tr key={index} className="offers-skeleton" aria-hidden="true">
                        {Array.from({ length: 7 }, (_, cell) => (
                          <td key={cell}><span /></td>
                        ))}
                      </tr>
                    ))
                  : visible.map((item) => {
                      const action = presentQuoteWorklistAction(item);
                      const value = quoteValue(item);
                      const isSelected = showPreview && selected?.quoteSnapshotId === item.quoteSnapshotId;
                      return (
                        <tr
                          key={item.quoteSnapshotId}
                          data-attention={item.needsAttention}
                          data-preview={showPreview}
                          data-selected={isSelected}
                          tabIndex={showPreview ? 0 : undefined}
                          aria-selected={showPreview ? isSelected : undefined}
                          aria-label={showPreview ? `Previzualizează oferta ${item.reference}` : undefined}
                          aria-controls={showPreview ? "oferte-fisa" : undefined}
                          onClick={(event) => {
                            if (!showPreview || !(event.target instanceof Element)) return;
                            if (event.target.closest("a, button, input, select, textarea")) return;
                            if (window.getSelection()?.toString()) return;
                            setSelectedId(item.quoteSnapshotId);
                          }}
                          onKeyDown={(event) => {
                            if (!showPreview || event.target !== event.currentTarget) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedId(item.quoteSnapshotId);
                            }
                          }}
                        >
                          <td className="offers-table__identity">
                            <a className="offers-object" href={registryQuoteHref(item)}>
                              {item.reference || "Ofertă"}
                            </a>
                            <span className="offers-kind" data-kind={item.kind}>{kindDetail(item)}</span>
                          </td>
                          <td className="offers-table__client">
                            <span className="offers-client">{item.customerDisplayName ?? "Fără client"}</span>
                            {item.requestReference ? (
                              <span className="offers-secondary offers-secondary--code">{item.requestReference}</span>
                            ) : null}
                          </td>
                          <td className="offers-table__offer">
                            <span className="offers-product" title={item.productLabel || undefined}>{item.productLabel || "—"}</span>
                            {item.inscription ? <span className="offers-secondary">{item.inscription}</span> : null}
                          </td>
                          <td className="offers-table__value">
                            <span className="offers-value">{value ?? "—"}</span>
                          </td>
                          <td className="offers-table__state">
                            <span className="offers-state">{item.stageLabel || "—"}</span>
                            {item.attentionLabel ? (
                              <span className="offers-attention">
                                {item.needsAttention ? <span aria-hidden="true" className="offers-attention__mark" /> : null}
                                {item.attentionLabel}
                              </span>
                            ) : null}
                          </td>
                          <td className="offers-table__date">
                            <span>{formatTimestamp(item.createdAt) ?? "—"}</span>
                          </td>
                          <td className="offers-table__action">
                            <a className="offers-next" href={action.actionHref}>
                              <span>{action.actionLabel}</span>
                              <span aria-hidden="true">→</span>
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
