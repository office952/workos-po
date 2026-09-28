import { describe, expect, it } from "vitest";
import { floorplanForWorkspace } from "./floorplan";
import type { PageWorkspace } from "./SlicePage";

const expected: Record<PageWorkspace, string> = {
  stack: "list-report",
  "collection-with-rail": "master-detail",
  object: "object-detail",
  traveler: "object-detail",
  configuration: "form-configuration",
  catalog: "form-configuration",
  operational: "operational-workspace",
  "operational-gate": "operational-workspace",
  admin: "admin-settings",
  launchpad: "launchpad",
};

describe("floorplanForWorkspace", () => {
  it("maps every shared workspace onto the shell vocabulary", () => {
    const workspaces = Object.keys(expected) as PageWorkspace[];
    for (const workspace of workspaces) {
      expect(floorplanForWorkspace(workspace)).toBe(expected[workspace]);
    }
  });
});
