import { describe, expect, it } from "vitest";
import {
  PROCESS_GRAPH_WRITE_STATE_LABEL,
  presentCatalogProcessGraph,
} from "./catalogProcessGraphAdapter";

const consultativeEmpty = {
  schemaVersion: "catalog-process-graph.v1",
  readOnly: true,
  mutatesConfiguration: false,
  writeState: "NOT_IMPLEMENTED",
  status: "NO_REFERENCE_SCENARIO",
  productCode: "PRD-TEST",
  productLabel: "Litere test",
  templateVersion: "1",
  canViewFinancialAmounts: false,
  scenario: null,
  scenarios: [],
  graph: null,
};

describe("presentCatalogProcessGraph", () => {
  it("presents a consultative empty graph and labels it as unsaved", () => {
    expect(presentCatalogProcessGraph(consultativeEmpty)).toMatchObject({
      status: "NO_REFERENCE_SCENARIO",
      writeStateLabel: PROCESS_GRAPH_WRITE_STATE_LABEL,
    });
  });

  it("rejects a writable or mutating process-graph contract instead of inventing an editor", () => {
    expect(presentCatalogProcessGraph({ ...consultativeEmpty, writeState: "READY" })).toBeNull();
    expect(presentCatalogProcessGraph({ ...consultativeEmpty, mutatesConfiguration: true })).toBeNull();
    expect(presentCatalogProcessGraph({ ...consultativeEmpty, readOnly: false })).toBeNull();
  });
});
