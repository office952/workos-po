import type { ReactNode } from "react";
import { floorplanForWorkspace, type FloorplanId } from "./floorplan";
import { PageHeader } from "./PageHeader";
import { PageRegion } from "./PageRegion";

export type PageWorkspace =
  | "stack"
  | "collection-with-rail"
  | "object"
  | "configuration"
  | "catalog"
  | "traveler"
  | "operational"
  | "operational-gate"
  | "admin"
  | "launchpad";

export type PageDensity = "compact" | "standard" | "operational";

function densityFor(workspace: PageWorkspace): PageDensity {
  switch (workspace) {
    case "operational":
    case "operational-gate":
      return "operational";
    case "object":
    case "configuration":
    case "traveler":
      return "standard";
    case "stack":
    case "collection-with-rail":
    case "catalog":
    case "admin":
    case "launchpad":
      return "compact";
    default: {
      const exhaustive: never = workspace;
      return exhaustive;
    }
  }
}

export type PageSurface = "cereri-registry" | "cereri-detail" | "clients-registry" | "client-hub"
  | "catalog-registry" | "configuration-workbench" | "assembly-workbench"
  | "quotes-registry" | "quote-detail";

type SlicePageProps = {
  contextLabel: string;
  currentHref: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  meta?: ReactNode;
  status?: ReactNode;
  action?: ReactNode;
  instrument?: ReactNode;
  headerVariant?: "default" | "pilot";
  workspace?: PageWorkspace;
  floorplan?: FloorplanId;
  /** Scoped presentation surface; does not invent a new workspace contract. */
  surface?: PageSurface;
  children: ReactNode;
};

export function SlicePage({
  eyebrow,
  title,
  lead,
  meta,
  status,
  action,
  instrument,
  headerVariant,
  workspace = "stack",
  floorplan,
  surface,
  children,
}: SlicePageProps) {
  const quiet = workspace === "operational" || workspace === "operational-gate";
  return (
    <PageRegion>
      <div data-surface={surface}>
        <PageHeader
          eyebrow={eyebrow}
          title={title}
          lead={lead}
          meta={meta}
          status={status}
          action={action}
          instrument={instrument}
          variant={headerVariant}
          quiet={quiet}
        />
        <div className="page-region">
          <div
            className={`page-workspace page-workspace--${workspace} page-workspace--density-${densityFor(workspace)}`}
            data-floorplan={floorplan ?? floorplanForWorkspace(workspace)}
            data-surface={surface}
          >
            {children}
          </div>
        </div>
      </div>
    </PageRegion>
  );
}
