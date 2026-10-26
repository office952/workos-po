import { describe, expect, it } from "vitest";
import type { JobOverviewItem, JobStage } from "../jobs/overview.js";
import type { QuoteOverviewItem, QuoteOverviewStage } from "../quotes/overview.js";
import type { RequestOverviewItem } from "../requests/overview.js";
import { projectCustomerHistory, readCustomerHistoryQuery, type CustomerHistoryInput } from "./history.js";

/**
 * N-020 review regressions: the history state follows the canonical job stage, and a request
 * with several quotes and jobs keeps every branch exactly once.
 */
const request = (requestId: string, title: string, status = "NEW"): RequestOverviewItem =>
  ({ requestId, reference: `CER-${requestId}`, customerId: "c", title, createdAt: "2026-10-01T08:00:00.000Z", status, statusLabel: status }) as unknown as RequestOverviewItem;

const quote = (quoteSnapshotId: string, requestId: string | null, stage: QuoteOverviewStage, orderSnapshotId: string | null, createdAt = "2026-10-02T08:00:00.000Z"): QuoteOverviewItem =>
  ({
    quoteSnapshotId,
    kind: "PRODUCT",
    productCode: "P",
    productLabel: "Litere",
    inscription: quoteSnapshotId.toUpperCase(),
    reference: `OF-${quoteSnapshotId}`,
    requestId,
    customerId: "c",
    createdAt,
    stage,
    stageLabel: stage,
    superseded: false,
    orderSnapshotId,
  }) as unknown as QuoteOverviewItem;

const job = (jobId: string, requestId: string | null, orderSnapshotId: string, stage: JobStage): JobOverviewItem =>
  ({ jobId, requestId, orderSnapshotId, stage, stageLabel: stage, productLabel: "Litere", inscription: jobId, progressLabel: null, createdAt: "2026-10-03T08:00:00.000Z" }) as unknown as JobOverviewItem;

function input(parts: Partial<CustomerHistoryInput>): CustomerHistoryInput {
  return {
    requests: [],
    quotes: [],
    jobs: [],
    historicalWorks: [],
    documents: [],
    documentLinks: new Map(),
    sites: [],
    siteAssignments: [],
    documentContentHref: (id) => `/doc/${id}`,
    ...parts,
  };
}

const all = (data: CustomerHistoryInput, params: Record<string, string> = {}) =>
  projectCustomerHistory(data, readCustomerHistoryQuery({ pageSize: "50", ...params }));

describe("history state follows the canonical job stage", () => {
  const cases: Array<[JobStage, string, string]> = [
    ["ORDER_CREATED", "COMANDA_CREATA", "Comandă creată"],
    ["RELEASED", "ELIBERATA", "Eliberată în producție"],
    ["EXECUTION_PLANNED", "PLAN_PREGATIT", "Plan de execuție pregătit"],
    ["EXECUTION_IN_PROGRESS", "IN_EXECUTIE", "Execuție în curs"],
    ["EXECUTION_COMPLETED", "FINALIZAT", "Finalizată"],
  ];
  it.each(cases)("a job in %s is shown as %s", (stage, state, label) => {
    const data = input({
      requests: [request("r1", "Litere")],
      quotes: [quote("q1", "r1", "ORDER_CREATED", "o1")],
      jobs: [job("j1", "r1", "o1", stage)],
    });
    const entry = all(data).entries[0];
    expect(entry?.state).toBe(state);
    expect(entry?.stateLabel).toBe(label);
    if (stage !== "EXECUTION_IN_PROGRESS") expect(entry?.stateLabel).not.toBe("În execuție");
    expect(all(data, { state }).total).toBe(1);
  });

  it("an accepted quote without an order and an open quote keep their commercial state", () => {
    const accepted = all(input({ requests: [request("r1", "A")], quotes: [quote("q1", "r1", "QUOTE_ACCEPTED", null)] })).entries[0];
    expect(accepted?.state).toBe("OFERTA_ACCEPTATA");
    const open = all(input({ requests: [request("r1", "A")], quotes: [quote("q1", "r1", "QUOTE_CREATED", null)] })).entries[0];
    expect(open?.state).toBe("OFERTARE");
    const empty = all(input({ requests: [request("r1", "A")] })).entries[0];
    expect(empty?.state).toBe("OFERTARE");
  });
});

describe("a request keeps every branch exactly once", () => {
  const twoQuotesTwoJobs = input({
    requests: [request("r1", "Litere sediu")],
    quotes: [quote("q1", "r1", "ORDER_CREATED", "o1", "2026-10-02T08:00:00.000Z"), quote("q2", "r1", "ORDER_CREATED", "o2", "2026-10-04T08:00:00.000Z")],
    jobs: [job("j1", "r1", "o1", "EXECUTION_COMPLETED"), job("j2", "r1", "o2", "RELEASED")],
  });

  it("two quotes and two jobs: one entry, two branches, no repeated quote", () => {
    const history = all(twoQuotesTwoJobs);
    expect(history.total).toBe(1);
    const entry = history.entries[0];
    expect(entry?.branches.map((branch) => [branch.quote?.quoteSnapshotId, branch.orderSnapshotId, branch.job?.jobId, branch.state])).toEqual([
      ["q1", "o1", "j1", "FINALIZAT"],
      ["q2", "o2", "j2", "ELIBERATA"],
    ]);
    const quoteAppearances = history.entries.flatMap((item) => item.branches.map((branch) => branch.quote?.quoteSnapshotId)).filter(Boolean);
    expect(quoteAppearances).toEqual(["q1", "q2"]);
    // A finished branch does not make the whole request look finished.
    expect(entry?.state).toBeNull();
    expect(entry?.states).toEqual(["ELIBERATA", "FINALIZAT"]);
    expect(entry?.stateLabel).toBe("Ramuri în stări diferite");
  });

  it("each branch state is found by the state filter, and text finds the second branch", () => {
    expect(all(twoQuotesTwoJobs, { state: "FINALIZAT" }).total).toBe(1);
    expect(all(twoQuotesTwoJobs, { state: "ELIBERATA" }).total).toBe(1);
    expect(all(twoQuotesTwoJobs, { state: "OFERTARE" }).total).toBe(0);
    const found = all(twoQuotesTwoJobs, { q: "OF-q2" });
    expect(found.total).toBe(1);
    expect(found.entries[0]?.matchedOn).toContain("Ofertă OF-q2");
  });

  it("an unaccepted quote next to a finished job stays visible and keeps the request open", () => {
    const history = all(
      input({
        requests: [request("r1", "Casetă")],
        quotes: [quote("q1", "r1", "ORDER_CREATED", "o1"), quote("q2", "r1", "QUOTE_CREATED", null, "2026-10-05T08:00:00.000Z")],
        jobs: [job("j1", "r1", "o1", "EXECUTION_COMPLETED")],
      }),
    );
    expect(history.total).toBe(1);
    const entry = history.entries[0];
    expect(entry?.branches.map((branch) => branch.state)).toEqual(["FINALIZAT", "OFERTARE"]);
    expect(entry?.state).toBeNull();
    expect(all(input({ requests: [request("r1", "Casetă")], quotes: [quote("q1", "r1", "ORDER_CREATED", "o1"), quote("q2", "r1", "QUOTE_CREATED", null)], jobs: [job("j1", "r1", "o1", "EXECUTION_COMPLETED")] }), { state: "OFERTARE" }).total).toBe(1);
  });

  it("jobs reached only through their order and loose quotes are never repeated", () => {
    const history = all(
      input({
        requests: [request("r1", "Cerere")],
        quotes: [quote("q1", "r1", "ORDER_CREATED", "o1"), quote("q9", null, "QUOTE_CREATED", null)],
        // j1 has no request id on the job: it belongs to r1 through the order of q1.
        jobs: [job("j1", null, "o1", "ORDER_CREATED"), job("j8", null, "o8", "EXECUTION_PLANNED")],
      }),
    );
    const branches = history.entries.flatMap((entry) => entry.branches);
    expect(branches.map((branch) => branch.job?.jobId ?? branch.quote?.quoteSnapshotId).sort()).toEqual(["j1", "j8", "q9"]);
    expect(history.entries.find((entry) => entry.request?.requestId === "r1")?.branches.map((branch) => branch.job?.jobId)).toEqual(["j1"]);
  });
});
