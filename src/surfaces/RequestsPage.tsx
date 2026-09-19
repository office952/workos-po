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
import { statusTone } from "../presentation/statusTone";
import { requestHref } from "../routing/appRoute";

const ALL = "all";
const COLUMNS = ["Cerere", "Client", "Context", "Stare", "Actualizat", "Acțiune"] as const;

export function RequestsPage() {
  const requests = useResource(resourceKeys.requests(), loadRequestList);
  const items = useMemo(() => requests.data ?? [], [requests.data]);
  const [query, setQuery] = useState("");
  const [statusChip, setStatusChip] = useState(ALL);

  const statusChips = useMemo(
    () => [
      { id: ALL, label: "Toate" },
      ...uniqueLabels(items.map((item) => item.statusLabel)).map((label) => ({
        id: label,
        label,
      })),
    ],
    [items],
  );

  const visible = useMemo(
    () =>
      items.filter((item) => {
        const matchesChip = statusChip === ALL || item.statusLabel === statusChip;
        return (
          matchesChip &&
          matchesSearch(query, [
            item.title,
            item.reference,
            item.customerDisplayName,
            item.contextLabel,
            item.statusLabel,
            item.nextActionLabel,
          ])
        );
      }),
    [items, query, statusChip],
  );

  return (
    <SlicePage
      contextLabel="Cereri"
      currentHref="/cereri"
      workspace="stack"
      eyebrow="Cereri"
      title="Cereri de ofertă"
      lead="Deschide cererea lucrării și continuă către catalog."
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
          meta={requests.status === "success" ? `${visible.length} din ${items.length}` : undefined}
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
          {visible.map((item) => (
            <WorklistRow
              key={item.requestId}
              variant="registry"
              href={requestHref(item.requestId)}
              identity={item.reference || item.title}
              identityDetail={
                item.reference && item.reference !== item.title ? item.title : undefined
              }
              context={item.customerDisplayName ?? "Fără client"}
              support={item.contextLabel ?? ""}
              state={<StatusBadge label={item.statusLabel} tone={statusTone("workflow")} />}
              meta={formatTimestamp(item.updatedAt) ?? ""}
              actionLabel={item.nextActionLabel || "Deschide"}
            />
          ))}
        </CollectionBody>
      </SurfacePanel>
    </SlicePage>
  );
}
