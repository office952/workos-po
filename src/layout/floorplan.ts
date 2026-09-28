import type { StructuralLayoutId } from "./pageLayout";

/** Compatibility attribute derived from the canonical layout. Not a second selector. */
export type FloorplanId =
  | "authentication"
  | "launchpad"
  | "list-report"
  | "object-detail"
  | "master-detail"
  | "form-configuration"
  | "admin-settings"
  | "operational-workspace";

export function floorplanForLayout(layout: StructuralLayoutId): FloorplanId {
  switch (layout) {
    case "START_CONTINUATION":
      return "launchpad";
    case "REGISTRY":
      return "list-report";
    case "OBJECT_DETAIL":
      return "object-detail";
    case "WORKBENCH":
      return "form-configuration";
    case "OPERATIONAL":
      return "operational-workspace";
    case "ADMIN_MASTER_DETAIL":
      return "admin-settings";
    default: {
      const exhaustive: never = layout;
      return exhaustive;
    }
  }
}
