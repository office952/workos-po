import type { ReactNode } from "react";
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
  | "admin";

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
      return "compact";
    default: {
      const exhaustive: never = workspace;
      return exhaustive;
    }
  }
}

type SlicePageProps = {
  contextLabel: string;
  currentHref: string;
  eyebrow?: string;
  title: string;
  lead?: string;
  meta?: string;
  status?: ReactNode;
  action?: ReactNode;
  workspace?: PageWorkspace;
  children: ReactNode;
};

export function SlicePage({
  eyebrow,
  title,
  lead,
  meta,
  status,
  action,
  workspace = "stack",
  children,
}: SlicePageProps) {
  return (
    <PageRegion>
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        lead={lead}
        meta={meta}
        status={status}
        action={action}
      />
      <div className="page-region">
        <div
          className={`page-workspace page-workspace--${workspace} page-workspace--density-${densityFor(workspace)}`}
        >
          {children}
        </div>
      </div>
    </PageRegion>
  );
}
