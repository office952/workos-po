import type { AppRoute } from "../routing/appRoute";

export const STRUCTURAL_LAYOUTS = [
  "START_CONTINUATION",
  "REGISTRY",
  "OBJECT_DETAIL",
  "WORKBENCH",
  "OPERATIONAL",
  "ADMIN_MASTER_DETAIL",
] as const;

export type StructuralLayoutId = (typeof STRUCTURAL_LAYOUTS)[number];

export type LayoutVariant = "standard" | "record-document" | "queue" | "execution-focus";

export type PageDensity = "compact" | "standard" | "operational";

export type PageLayoutSelection = {
  layout: StructuralLayoutId;
  variant?: LayoutVariant;
};

export type LoadingFloorKind =
  | "registry"
  | "object"
  | "form"
  | "operational"
  | "admin"
  | "traveler";

export function layoutForRouteName(name: AppRoute["name"]): PageLayoutSelection {
  switch (name) {
    case "home":
      return { layout: "START_CONTINUATION" };
    case "clients":
    case "requests":
    case "quotes":
    case "jobs":
    case "foundation":
    case "unknown":
      return { layout: "REGISTRY" };
    case "client":
    case "request":
      return { layout: "OBJECT_DETAIL", variant: "standard" };
    case "quote":
      return { layout: "OBJECT_DETAIL", variant: "record-document" };
    case "catalog":
    case "configurator":
    case "assembly":
      return { layout: "WORKBENCH" };
    case "planning":
    case "atelier":
      return { layout: "OPERATIONAL", variant: "queue" };
    case "job":
    case "execution":
      return { layout: "OPERATIONAL", variant: "execution-focus" };
    case "admin":
    case "admin-resources":
    case "admin-services":
    case "admin-material-readiness":
    case "admin-external-production":
    case "admin-commercial":
    case "admin-technical":
    case "admin-formulas":
    case "admin-products":
    case "admin-access":
    case "admin-people":
    case "admin-person":
    case "admin-workcenters":
    case "admin-workcenter":
    case "admin-machine":
      return { layout: "ADMIN_MASTER_DETAIL" };
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}

export function densityForLayout(layout: StructuralLayoutId): PageDensity {
  switch (layout) {
    case "OPERATIONAL":
      return "operational";
    case "OBJECT_DETAIL":
    case "WORKBENCH":
      return "standard";
    case "START_CONTINUATION":
    case "REGISTRY":
    case "ADMIN_MASTER_DETAIL":
      return "compact";
    default: {
      const exhaustive: never = layout;
      return exhaustive;
    }
  }
}

export function loadingFloorForRoute(name: AppRoute["name"]): LoadingFloorKind {
  if (name === "job") {
    return "traveler";
  }
  const selection = layoutForRouteName(name);
  switch (selection.layout) {
    case "START_CONTINUATION":
    case "REGISTRY":
      return "registry";
    case "OBJECT_DETAIL":
      return "object";
    case "WORKBENCH":
      return "form";
    case "OPERATIONAL":
      return "operational";
    case "ADMIN_MASTER_DETAIL":
      return "admin";
    default: {
      const exhaustive: never = selection.layout;
      return exhaustive;
    }
  }
}
