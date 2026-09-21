import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { FilterBar } from "../components/FilterBar";
import { CollectionBody } from "../components/LoadingFloor";
import { StatusBadge } from "../components/StatusBadge";
import { SurfacePanel } from "../components/SurfacePanel";
import { WorklistRow } from "../components/WorklistRow";
import { resourceKeys } from "../data/resourceKeys";
import { loadJobList } from "../data/routeLoaders";
import { useResource } from "../data/useResource";
import { SlicePage } from "../layout/SlicePage";
import { formatTimestamp } from "../presentation/format";
import { matchesSearch, uniqueLabels } from "../presentation/listFilter";
import { statusTone } from "../presentation/statusTone";
import { presentJobWorklistAction } from "../presentation/worklistAction";
import { jobHref } from "../routing/appRoute";

const ALL = "all";
const COLUMNS = ["Lucrare", "Client", "Progres", "Stare", "Creată", "Acțiune"] as const;

export function JobsPage() {
  const jobs = useResource(resourceKeys.jobs(), loadJobList);
  const items = useMemo(() => jobs.data ?? [], [jobs.data]);
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
            item.inscription,
            item.productLabel,
            item.customerDisplayName,
            item.stageLabel,
            item.nextActionLabel,
            item.progressLabel,
            item.attentionLabel,
          ])
        );
      }),
    [items, query, stageChip],
  );

  return (
    <SlicePage
      contextLabel="Lucrări"
      currentHref="/lucrari"
      eyebrow="Lucrări"
      title="Lucrări"
      lead="Continuă eliberarea, planul de execuție sau lucrarea finalizată."
      action={
        <a className="hit" href="/planificare">
          <span className="button button--primary">Planificare</span>
        </a>
      }
    >
      <SurfacePanel
        variant="flush"
        label="Lucrări"
        busy={jobs.status === "loading" && items.length === 0}
      >
        <FilterBar
          searchId="lucrari-cauta"
          searchLabel="Caută"
          searchValue={query}
          onSearchChange={setQuery}
          chips={chips}
          selectedChip={stageChip}
          onChipChange={setStageChip}
          meta={jobs.status === "success" ? `${visible.length} din ${items.length}` : undefined}
        />
        <CollectionBody
          status={jobs.status}
          itemCount={items.length}
          visibleCount={visible.length}
          loadingLabel="Se citesc lucrările"
          columns={COLUMNS}
          worklistLabel="Lista de lucrări"
          variant="registry"
          errorTitle="Lucrările nu au putut fi citite"
          errorBody="Lista de lucrări nu este disponibilă."
          empty={<EmptyState title="Nu există lucrări." />}
          filteredEmpty={<EmptyState title="Nicio lucrare nu corespunde filtrului." />}
        >
          {visible.map((item) => {
            const action = presentJobWorklistAction(item);
            return (
              <WorklistRow
                key={item.jobId}
                variant="registry"
                detailHref={jobHref(item.jobId)}
                actionHref={action.actionHref}
                identity={item.inscription || item.productLabel}
                identityDetail={
                  [
                    item.inscription ? item.productLabel : null,
                    item.attentionLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                context={item.customerDisplayName ?? "—"}
                support={item.progressLabel ?? ""}
                state={
                  <StatusBadge
                    label={item.stageLabel}
                    tone={statusTone(item.stage === "EXECUTION_COMPLETED" ? "success" : "workflow")}
                  />
                }
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
