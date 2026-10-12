import { useMemo, useState } from "react";
import type { QuoteKindTransport, QuoteListItemTransport } from "../api/types";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { CollectionBody } from "../components/LoadingFloor";
import { PageMetrics } from "../components/PageMetrics";
import { InlineAlert } from "../components/InlineAlert";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { WorklistRow } from "../components/WorklistRow";
import { resourceKeys } from "../data/resourceKeys";
import { invalidateResources } from "../data/resourceCache";
import { loadQuoteList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";
import { matchesSearch, uniqueLabels } from "../presentation/listFilter";
import { statusTone } from "../presentation/statusTone";
import { presentQuoteWorklistAction } from "../presentation/worklistAction";
import { registryQuoteHref } from "../routing/appRoute";
import "../styles/surfaces/commercial.css";

const ALL = "all";
const KIND_CHIPS: readonly { id: string; label: string; kind: QuoteKindTransport }[] = [
  { id: "kind:PRODUCT", label: "Produse", kind: "PRODUCT" },
  { id: "kind:ASSEMBLY", label: "Ansambluri", kind: "ASSEMBLY" },
];
const COLUMNS = ["Ofertă", "Client", "Produs", "Stare", "Total · Creată", "Acțiune"] as const;

function matchesChip(item: QuoteListItemTransport, chip: string): boolean {
  if (chip === ALL) {
    return true;
  }
  const kindChip = KIND_CHIPS.find((option) => option.id === chip);
  return kindChip ? item.kind === kindChip.kind : item.stageLabel === chip;
}

function quoteSupport(item: QuoteListItemTransport): string {
  return item.kind === "ASSEMBLY"
    ? `${item.productLabel} · ${item.sectionCount} secțiuni`
    : item.productLabel;
}

function quoteMeta(item: QuoteListItemTransport): string {
  const total = item.grossDisplay ? `${item.grossDisplay} ${item.currency ?? ""}`.trim() : null;
  return [total, formatTimestamp(item.createdAt)].filter(Boolean).join(" · ");
}

export function QuotesPage() {
  const quotes = useResource(resourceKeys.quotes(), loadQuoteList);
  const items = useMemo(() => quotes.data ?? [], [quotes.data]);
  const [query, setQuery] = useState("");
  const [stageChip, setStageChip] = useState(ALL);

  const chips = useMemo(() => {
    const kinds = new Set(items.map((item) => item.kind));
    return [
      { id: ALL, label: "Toate" },
      ...uniqueLabels(items.map((item) => item.stageLabel)).map((label) => ({
        id: label,
        label,
      })),
      ...(kinds.size > 1 ? KIND_CHIPS.map(({ id, label }) => ({ id, label })) : []),
    ];
  }, [items]);

  const visible = useMemo(
    () =>
      items.filter((item) => {
        return (
          matchesChip(item, stageChip) &&
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
          ])
        );
      }),
    [items, query, stageChip],
  );

  return (
    <SlicePage
      contextLabel="Oferte"
      currentHref="/oferte"
      workspace="stack"
      surface="quotes-registry"
      headerVariant="pilot"
      eyebrow="Registru comercial"
      title="Oferte"
      instrument={<PageMetrics items={[
        { label: "Oferte", value: quotes.status === "success" ? items.length : "—" },
        { label: "Necesită atenție", value: quotes.status === "success" ? items.filter((item) => item.needsAttention).length : "—" },
      ]} />}
    >
      {quotes.status === "error" && items.length > 0 ? (
        <InlineAlert tone="error" title="Lista nu a putut fi actualizată">
          Datele afișate sunt de la ultima citire reușită.
          <button type="button" className="quiet-action" onClick={() => invalidateResources(resourceKeys.quotes())}>Reîncearcă</button>
        </InlineAlert>
      ) : null}
      <div className="commercial-toolbar">
        <FilterBar
          variant="toolbar"
          searchId="oferte-cauta"
          searchLabel="Caută"
          searchValue={query}
          onSearchChange={setQuery}
          chips={chips}
          selectedChip={stageChip}
          onChipChange={setStageChip}
        />
        {query || stageChip !== ALL ? <button type="button" className="quiet-action" onClick={() => { setQuery(""); setStageChip(ALL); }}>Resetează filtrele</button> : null}
      </div>
      <section className="commercial-register" aria-label="Registru oferte">
      <SurfacePanel
        variant="flush"
        label="Oferte"
        busy={quotes.status === "loading" && items.length === 0}
      >
        <CollectionBody
          status={quotes.status}
          itemCount={items.length}
          visibleCount={visible.length}
          loadingLabel="Se citesc ofertele"
          columns={COLUMNS}
          worklistLabel="Lista de oferte"
          variant="registry"
          errorTitle="Ofertele nu au putut fi citite"
          errorBody="Lista de oferte nu este disponibilă."
          errorAction={<button type="button" className="quiet-action" onClick={() => invalidateResources(resourceKeys.quotes())}>Reîncearcă</button>}
          empty={<EmptyState title="Nu există oferte înghețate." />}
          filteredEmpty={<EmptyState title="Nicio ofertă nu corespunde filtrului." />}
        >
          {visible.map((item) => {
            const action = presentQuoteWorklistAction(item);
            return (
              <WorklistRow
                key={item.quoteSnapshotId}
                variant="registry"
                detailHref={registryQuoteHref(item)}
                actionHref={action.actionHref}
                identity={item.reference}
                identityDetail={
                  [
                    item.kind === "ASSEMBLY" ? item.kindLabel : null,
                    item.inscription || null,
                    item.requestReference,
                    item.attentionLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                context={item.customerDisplayName ?? "Fără client"}
                support={quoteSupport(item)}
                state={<StatusBadge label={item.stageLabel} tone={statusTone("workflow")} />}
                meta={quoteMeta(item)}
                actionLabel={action.actionLabel}
              />
            );
          })}
        </CollectionBody>
      </SurfacePanel>
      </section>
    </SlicePage>
  );
}
