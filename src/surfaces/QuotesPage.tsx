import { useMemo, useState } from "react";
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
import { quoteHref } from "../routing/appRoute";
import "../styles/surfaces/commercial.css";

const ALL = "all";
const COLUMNS = ["Ofertă", "Client", "Produs", "Stare", "Creată", "Acțiune"] as const;

export function QuotesPage() {
  const quotes = useResource(resourceKeys.quotes(), loadQuoteList);
  const items = useMemo(() => quotes.data ?? [], [quotes.data]);
  const [query, setQuery] = useState("");
  const [stageChip, setStageChip] = useState(ALL);

  const chips = useMemo(
    () => [
      { id: ALL, label: "Toate" },
      ...uniqueLabels(items.map((item) => item.stageLabel)).map((label) => ({
        id: label,
        label,
      })),
    ],
    [items],
  );

  const visible = useMemo(
    () =>
      items.filter((item) => {
        const matchesChip = stageChip === ALL || item.stageLabel === stageChip;
        return (
          matchesChip &&
          matchesSearch(query, [
            item.reference,
            item.inscription,
            item.productLabel,
            item.customerDisplayName,
            item.stageLabel,
            item.nextActionLabel,
            item.requestReference,
            item.attentionLabel,
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
                detailHref={quoteHref(item.productCode, item.quoteSnapshotId)}
                actionHref={action.actionHref}
                identity={item.reference}
                identityDetail={
                  [item.inscription || null, item.attentionLabel].filter(Boolean).join(" · ") ||
                  undefined
                }
                context={item.customerDisplayName ?? "Fără client"}
                support={item.productLabel}
                state={<StatusBadge label={item.stageLabel} tone={statusTone("workflow")} />}
                meta={formatTimestamp(item.createdAt) ?? ""}
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
