import type { ReactNode } from "react";
import { collectionViewState } from "./collectionViewState";
import { ErrorState } from "./ErrorState";
import { SurfacePanel } from "./SurfacePanel";
import { Worklist, type WorklistVariant } from "./Worklist";

export type LoadingFloorVariant =
  | "registry"
  | "object"
  | "facts"
  | "form"
  | "operational"
  | "admin"
  | "traveler";

type LoadingFloorProps = {
  label: string;
  variant?: LoadingFloorVariant;
  rows?: number;
  columns?: readonly string[];
  worklistVariant?: WorklistVariant;
  reserveToolbar?: boolean;
};

function worklistColumnCount(variant: WorklistVariant): number {
  switch (variant) {
    case "registry":
      return 6;
    case "commercial":
    case "operational":
      return 4;
    case "compact":
      return 3;
    default: {
      const exhaustive: never = variant;
      return exhaustive;
    }
  }
}

function bars(count: number, widths: readonly string[]) {
  return Array.from({ length: count }, (_, index) => (
    <span
      key={index}
      className={`loading-floor__bar loading-floor__bar--${widths[index % widths.length]}`}
    />
  ));
}

export function LoadingFloor({
  label,
  variant = "object",
  rows = 5,
  columns,
  worklistVariant,
  reserveToolbar = true,
}: LoadingFloorProps) {
  const listVariant = worklistVariant ?? "registry";
  const barCount = columns?.length ?? worklistColumnCount(listVariant);

  return (
    <div
      className={`loading-floor loading-floor--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="u-visually-hidden">{label}</span>
      {variant === "registry" ? (
        <>
          {reserveToolbar ? <div className="loading-floor__toolbar" aria-hidden="true" /> : null}
          <Worklist label={label} variant={listVariant} columns={columns}>
            {Array.from({ length: rows }, (_, index) => (
              <div
                key={index}
                className={`worklist-row worklist-row--${listVariant} worklist-row--static loading-floor__row`}
                aria-hidden="true"
              >
                {bars(barCount, ["wide", "mid", "mid", "narrow"])}
              </div>
            ))}
          </Worklist>
        </>
      ) : null}
      {variant === "object" || variant === "facts" || variant === "traveler" ? (
        <div className="loading-floor__blocks" aria-hidden="true">
          <div className="loading-floor__block loading-floor__block--title" />
          {bars(variant === "traveler" ? 6 : 4, ["wide", "mid"])}
        </div>
      ) : null}
      {variant === "form" ? (
        <div className="loading-floor__blocks" aria-hidden="true">
          <div className="loading-floor__field" />
          <div className="loading-floor__field" />
          <div className="loading-floor__field loading-floor__field--short" />
        </div>
      ) : null}
      {variant === "operational" ? (
        <div className="loading-floor__blocks" aria-hidden="true">
          <div className="loading-floor__block loading-floor__block--title" />
          <div className="loading-floor__field" />
          {bars(3, ["mid", "narrow"])}
        </div>
      ) : null}
      {variant === "admin" ? (
        <div className="loading-floor__blocks" aria-hidden="true">
          <div className="loading-floor__toolbar" />
          {bars(4, ["wide", "mid"])}
        </div>
      ) : null}
    </div>
  );
}

type CollectionBodyProps = {
  status: "idle" | "loading" | "success" | "error";
  itemCount: number;
  visibleCount: number;
  loadingLabel: string;
  columns: readonly string[];
  worklistLabel: string;
  variant?: WorklistVariant;
  errorTitle: string;
  errorBody: string;
  empty: ReactNode;
  filteredEmpty: ReactNode;
  children: ReactNode;
};

export function CollectionBody({
  status,
  itemCount,
  visibleCount,
  loadingLabel,
  columns,
  worklistLabel,
  variant = "commercial",
  errorTitle,
  errorBody,
  empty,
  filteredEmpty,
  children,
}: CollectionBodyProps) {
  const view = collectionViewState(status, itemCount, visibleCount);

  switch (view) {
    case "error":
      return (
        <div className="ui-panel__pad">
          <ErrorState title={errorTitle}>{errorBody}</ErrorState>
        </div>
      );
    case "loading":
      return (
        <LoadingFloor
          variant="registry"
          label={loadingLabel}
          columns={columns}
          rows={5}
          worklistVariant={variant}
          reserveToolbar={false}
        />
      );
    case "empty":
      return <div className="ui-panel__pad">{empty}</div>;
    case "filtered-empty":
      return <div className="ui-panel__pad">{filteredEmpty}</div>;
    case "refreshing":
    case "ready":
      return (
        <Worklist
          variant={variant}
          label={worklistLabel}
          columns={columns}
          busy={view === "refreshing"}
        >
          {children}
        </Worklist>
      );
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

type PendingPanelProps = {
  title?: string;
  label: string;
  variant?: "default" | "quiet" | "selected" | "operational" | "flush";
  floor?: LoadingFloorVariant;
  children?: ReactNode;
};

export function PendingPanel({
  title,
  label,
  variant = "default",
  floor = "facts",
  children,
}: PendingPanelProps) {
  return (
    <SurfacePanel variant={variant} title={title} label={label} busy>
      {children ?? <LoadingFloor variant={floor} label={label} />}
    </SurfacePanel>
  );
}

export { collectionViewState } from "./collectionViewState";
