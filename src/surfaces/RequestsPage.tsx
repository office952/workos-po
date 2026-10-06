import { useMemo, useState } from "react";
import "../styles/surfaces/requests.css";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { CollectionBody } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { WorklistRow } from "../components/WorklistRow";
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

const FILTERS = [
  { id: "all", label: "Toate" },
  { id: "needs-action", label: "Necesită acțiune" },
] as const;

type RequestListFilter = (typeof FILTERS)[number]["id"];

const COLUMNS = ["Cerere", "Client", "Progres comercial", "Stare", "Creată", "Acțiune"] as const;

export function RequestsPage() {
  const requests = useResource(resourceKeys.requests(), loadRequestList);
  const items = useMemo(() => requests.data ?? [], [requests.data]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RequestListFilter>("all");

  const attentionCount = useMemo(
    () => items.filter((item) => item.needsAttention).length,
    [items],
  );

  const chips = useMemo(
    () =>
      FILTERS.map((item) =>
        item.id === "needs-action" && attentionCount > 0
          ? { ...item, label: `Necesită acțiune (${attentionCount})` }
          : { ...item },
      ),
    [attentionCount],
  );

  const registryRows = useMemo(
    () =>
      items.map((item) => ({
        item,
        registry: presentRequestRegistryStatus({
          statusLabel: item.statusLabel,
          contextLabel: item.contextLabel,
        }),
      })),
    [items],
  );

  const visible = useMemo(
    () =>
      registryRows.filter(({ item, registry }) => {
        const matchesChip =
          filter === "all" || (filter === "needs-action" && item.needsAttention);
        return (
          matchesChip &&
          matchesSearch(query, [
            item.title,
            item.reference,
            item.customerDisplayName,
            registry.commercialProgressLabel,
            registry.stateLabel,
            item.nextActionLabel,
            item.attentionLabel,
          ])
        );
      }),
    [filter, query, registryRows],
  );

  const countMeta =
    requests.status === "success"
      ? `${visible.length} ${visible.length === 1 ? "cerere" : "cereri"}`
      : undefined;

  return (
    <SlicePage
      contextLabel="Cereri"
      currentHref="/cereri"
      workspace="stack"
      surface="cereri-registry"
      eyebrow="Intrare comercială / registru activ"
      title="Cereri de ofertă"
      lead="Un singur flux pentru ce intră în firmă: identifică cererea, citește starea și continuă următorul pas sigur."
      meta={
        requests.status === "success"
          ? `${items.length} în registru · ${attentionCount} necesită acțiune · ${visible.length} afișate`
          : "Sincronizare registru"
      }
      action={
        <a className="hit" href="/clienti">
          <span className="button button--primary">Cerere nouă</span>
        </a>
      }
    >
      <section className="requests-console" aria-label="Stare registru cereri">
        <div className="requests-console__identity">
          <span className="requests-console__signal" aria-hidden="true" />
          <span className="requests-console__kicker">Coada operațională</span>
          <strong className="requests-console__title">Intrare comercială</strong>
          <span className="requests-console__note">
            Starea și următorul pas vin din adevărul curent al cererii.
          </span>
        </div>
        <div className="requests-console__metric">
          <span className="requests-console__metric-label">Total</span>
          <strong className="requests-console__metric-value">
            {requests.status === "success" ? items.length : "—"}
          </strong>
        </div>
        <div
          className={
            attentionCount > 0
              ? "requests-console__metric requests-console__metric--attention"
              : "requests-console__metric"
          }
        >
          <span className="requests-console__metric-label">Necesită acțiune</span>
          <strong className="requests-console__metric-value">
            {requests.status === "success" ? attentionCount : "—"}
          </strong>
        </div>
        <div className="requests-console__metric requests-console__metric--signal">
          <span className="requests-console__metric-label">Afișate</span>
          <strong className="requests-console__metric-value">
            {requests.status === "success" ? visible.length : "—"}
          </strong>
        </div>
      </section>

      <SurfacePanel
        variant="flush"
        label="Cereri"
        busy={requests.status === "loading" && items.length === 0}
      >
        <FilterBar
          variant="toolbar"
          searchId="cereri-cauta"
          searchLabel="Caută"
          searchPlaceholder="Client, referință sau titlu"
          searchValue={query}
          onSearchChange={setQuery}
          chips={chips}
          selectedChip={filter}
          onChipChange={(id) => {
            const next = FILTERS.find((item) => item.id === id);
            if (next) {
              setFilter(next.id);
            }
          }}
          meta={countMeta}
        />
        <CollectionBody
          status={requests.status}
          itemCount={items.length}
          visibleCount={visible.length}
          loadingLabel="Se citesc cererile"
          columns={COLUMNS}
          worklistLabel="Lista de cereri"
          variant="registry"
          errorTitle="Cererile nu au putut fi citite"
          errorBody="Lista de cereri nu este disponibilă."
          empty={
            <EmptyState
              title="Nu există cereri"
              description="Începe de la un client."
              action={
                <a className="text-link" href="/clienti">
                  Începe de la un client
                </a>
              }
            />
          }
          filteredEmpty={<EmptyState title="Nicio cerere nu corespunde filtrului." />}
        >
          {visible.map(({ item, registry }) => {
            const action = presentRequestWorklistAction(item);
            return (
              <div
                key={item.requestId}
                className="requests-row-shell"
                data-attention={item.needsAttention ? "true" : "false"}
              >
                <WorklistRow
                  variant="registry"
                  detailHref={requestHref(item.requestId)}
                  actionHref={action.actionHref}
                  identity={item.reference || item.title}
                  identityDetail={
                    [
                      item.reference && item.reference !== item.title ? item.title : null,
                      item.attentionLabel,
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  context={item.customerDisplayName ?? "Fără client"}
                  support={registry.commercialProgressLabel}
                  state={<StatusBadge label={registry.stateLabel} tone={statusTone("workflow")} />}
                  meta={formatTimestamp(item.createdAt) ?? ""}
                  actionLabel={action.actionLabel}
                />
              </div>
            );
          })}
        </CollectionBody>
      </SurfacePanel>
    </SlicePage>
  );
}
