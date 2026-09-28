import type { PageWorkspace } from "./SlicePage";

export type FloorplanId =
  | "authentication"
  | "launchpad"
  | "list-report"
  | "object-detail"
  | "master-detail"
  | "form-configuration"
  | "admin-settings"
  | "operational-workspace";

export function floorplanForWorkspace(workspace: PageWorkspace): FloorplanId {
  switch (workspace) {
    case "stack":
      return "list-report";
    case "collection-with-rail":
      return "master-detail";
    case "object":
    case "traveler":
      return "object-detail";
    case "configuration":
    case "catalog":
      return "form-configuration";
    case "operational":
    case "operational-gate":
      return "operational-workspace";
    case "admin":
      return "admin-settings";
    case "launchpad":
      return "launchpad";
    default: {
      const exhaustive: never = workspace;
      return exhaustive;
    }
  }
}
