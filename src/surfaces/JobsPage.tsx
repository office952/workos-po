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
import { matchesSearch } from "../presentation/listFilter";
import { statusTone } from "../presentation/statusTone";
import { presentJobWorklistAction } from "../presentation/worklistAction";
import { jobHref } from "../routing/appRoute";

const FILTERS = [
  { id: "all", label: "Toate" },
  { id: "needs-action", label: "Necesită acțiune" },
  { id: "urgent", label: "Urgente" },
  { id: "overdue", label: "Termen depășit" },
  { id: "in-execution", label: "În execuție" },
  { id: "completed", label: "Finalizate" },
] as const;

type JobListFilter = (typeof FILTERS)[number]["id"];

const COLUMNS = ["Lucrare", "Client", "Prioritate", "Progres", "Stare", "Termen", "Acțiune"] as const;

export function JobsPage() {
  const jobs = useResource(resourceKeys.jobs(), loadJobList);
  const items = useMemo(() => jobs.data ?? [], [jobs.data]);
  const [query, setQuery] = useState("");
  const [stageChip, setStageChip] = useState<JobListFilter>("all");

  const visible = useMemo(
    () =>
      items.filter((item) => {
        const matchesChip = matchesJobFilter(item, stageChip);
        return (
          matchesChip &&
          matchesSearch(query, [
            item.inscription,
            item.productLabel,
            item.customerDisplayName,
            item.stageLabel,
            item.priorityLabel,
            item.kindLabel,
            item.nextActionLabel,
            item.progressLabel,
            item.attentionLabel,
            ...item.memberLabels,
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
          chips={[...FILTERS]}
          selectedChip={stageChip}
          onChipChange={(id) => {
            const next = FILTERS.find((filter) => filter.id === id);
            if (next) {
              setStageChip(next.id);
            }
          }}
          meta={jobs.status === "success" ? `${visible.length} din ${items.length}` : undefined}
        />
        <CollectionBody
          status={jobs.status}
          itemCount={items.length}
          visibleCount={visible.length}
          loadingLabel="Se citesc lucrările"
          columns={COLUMNS}
          worklistLabel="Lista de lucrări"
          variant="operations"
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
                variant="operations"
                detailHref={jobHref(item.jobId)}
                actionHref={action.actionHref}
                identity={item.kind === "ASSEMBLY" ? item.productLabel : item.inscription || item.productLabel}
                identityDetail={
                  [
                    item.kind === "ASSEMBLY" ? item.inscription : item.inscription ? item.productLabel : null,
                    item.attentionLabel,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                context={item.customerDisplayName ?? "—"}
                support={item.priorityLabel}
                progress={item.progressLabel ?? "—"}
                state={
                  <StatusBadge
                    label={item.stageLabel}
                    tone={statusTone(item.overdue ? "warning" : item.stage === "EXECUTION_COMPLETED" ? "success" : "workflow")}
                  />
                }
                meta={item.targetDateLabel}
                actionLabel={action.actionLabel}
              />
            );
          })}
        </CollectionBody>
      </SurfacePanel>
    </SlicePage>
  );
}

function matchesJobFilter(
  item: {
    needsAttention: boolean;
    stage: string;
    priority: string;
    overdue: boolean;
  },
  filter: JobListFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs-action":
      return item.needsAttention && item.stage !== "EXECUTION_COMPLETED";
    case "urgent":
      return item.priority === "URGENT";
    case "overdue":
      return item.overdue;
    case "in-execution":
      return item.stage === "EXECUTION_IN_PROGRESS";
    case "completed":
      return item.stage === "EXECUTION_COMPLETED";
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}
