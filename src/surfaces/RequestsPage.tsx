import { useMemo, useState } from "react";
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
import { matchesSearch, uniqueLabels } from "../presentation/listFilter";
import { presentRequestRegistryStatus } from "../presentation/requestListStatus";
import { statusTone } from "../presentation/statusTone";
import { presentRequestWorklistAction } from "../presentation/worklistAction";
import { requestHref } from "../routing/appRoute";

const ALL = "all";
const COLUMNS = ["Cerere", "Client", "Context", "Stare", "Creată", "Acțiune"] as const;

export function RequestsPage() {
  const requests = useResource(resourceKeys.requests(), loadRequestList);
  const items = useMemo(() => requests.data ?? [], [requests.data]);
  const [query, setQuery] = useState("");
  const [statusChip, setStatusChip] = useState(ALL);

  const registryRows = useMemo(
    () =>
      items.map((item) => ({
        item,
        registry: presentRequestRegistryStatus({
          status: item.status,
          statusLabel: item.statusLabel,
          contextLabel: item.contextLabel,
        }),
      })),
    [items],
  );

  const statusChips = useMemo(
    () => [
      { id: ALL, label: "Toate" },
      ...uniqueLabels(registryRows.map((row) => row.registry.stateLabel)).map((label) => ({
        id: label,
        label,
      })),
    ],
    [registryRows],
  );

  const visible = useMemo(
    () =>
      registryRows.filter(({ item, registry }) => {
        const matchesChip = statusChip === ALL || registry.stateLabel === statusChip;
        return (
          matchesChip &&
          matchesSearch(query, [
            item.title,
            item.reference,
            item.customerDisplayName,
            registry.supportLabel,
            registry.stateLabel,
            item.nextActionLabel,
            item.attentionLabel,
          ])
        );
      }),
    [registryRows, query, statusChip],
  );

  return (
    <SlicePage
      contextLabel="Cereri"
      currentHref="/cereri"
      workspace="stack"
      title="Cereri de ofertă"
      lead="Deschide cererea lucrării și continuă către pasul canonic."
      meta={requests.status === "success" ? `${visible.length} rezultate` : undefined}
    >
      <SurfacePanel
        variant="flush"
        label="Cereri"
        busy={requests.status === "loading" && items.length === 0}
      >
        <FilterBar
          searchId="cereri-cauta"
          searchLabel="Caută"
          searchValue={query}
          onSearchChange={setQuery}
          chips={statusChips}
          selectedChip={statusChip}
          onChipChange={setStatusChip}
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
              <WorklistRow
                key={item.requestId}
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
                support={registry.supportLabel}
                state={<StatusBadge label={registry.stateLabel} tone={statusTone("workflow")} />}
                meta={formatTimestamp(item.createdAt) ?? ""}
                actionLabel={action.actionLabel}
              />
            );
          })}
        </CollectionBody>
      </SurfacePanel>
    </SlicePage>
  );
}
