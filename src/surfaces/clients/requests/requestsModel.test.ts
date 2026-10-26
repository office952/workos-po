import { describe, expect, it } from "vitest";
import type { JobListItemTransport, QuoteListItemTransport, RequestListItemTransport } from "../../../api/types";
import { buildRequestsView, commercialProgress } from "./requestsModel";

const request = (id: string, overrides: Partial<RequestListItemTransport> = {}): RequestListItemTransport => ({
  requestId: id, title: `Cerere ${id}`, reference: `CER-${id}`, customerId: "cus-1", customerDisplayName: "Alpha", status: "NEW", statusLabel: "Nouă",
  contextLabel: null, commercialProgress: null, createdAt: "2026-10-23T10:00:00.000Z", nextAction: "OPEN_REQUEST", nextActionLabel: "", nextActionHref: null,
  needsAttention: false, attentionLabel: null, linkedQuoteSnapshotId: null, linkedQuoteProductCode: null, linkedAssemblyId: null, ...overrides,
});
const quote = (id: string, requestId: string | null, overrides: Partial<QuoteListItemTransport> = {}): QuoteListItemTransport => ({
  quoteSnapshotId: id, kind: "PRODUCT", kindLabel: "Produs", assemblyId: null, sectionCount: 1, superseded: false, grossDisplay: "605,00", currency: "EUR",
  productCode: "P", productLabel: "Panou", reference: `OF-${id}`, inscription: "ALPHA", customerDisplayName: "Alpha", stage: "QUOTE_CREATED", stageLabel: "Creată",
  createdAt: "2026-10-23T10:00:00.000Z", nextAction: "ACCEPT_QUOTE", nextActionLabel: "", needsAttention: false, attentionLabel: null, requestId,
  requestReference: requestId ? `CER-${requestId}` : null, orderSnapshotId: null, ...overrides,
});
const job = (id: string, requestId: string, orderSnapshotId: string, stageLabel = "În lucru"): JobListItemTransport =>
  ({ jobId: id, requestId, orderSnapshotId, stageLabel, progressLabel: "0 / 12 finalizate" }) as unknown as JobListItemTransport;

const waiting = { needsAttention: true, attentionLabel: "Urmează acceptarea" };
// The Alpha Clima shape (8899): one request with two offers waiting, two with an ordered offer each.
const workspace = {
  requests: [request("a"), request("b", { createdAt: "2026-10-23T09:00:00.000Z" }), request("c", { title: "Showroom", createdAt: "2025-10-01T07:00:00.000Z" })],
  quotes: [
    quote("q1", "a", waiting),
    quote("q2", "a", waiting),
    quote("q3", "b", { stage: "ORDER_CREATED", stageLabel: "Cu comandă", orderSnapshotId: "o3" }),
    quote("q4", "c", { stage: "ORDER_CREATED", stageLabel: "Cu comandă", orderSnapshotId: "o4", createdAt: "2025-10-01T12:00:00.000Z" }),
  ],
  jobs: [job("j3", "b", "o3"), job("j4", "c", "o4", "Finalizată")],
};
const sites: Record<string, { siteId: string; name: string }> = { a: { siteId: "s1", name: "Depozit Ghimbav" }, b: { siteId: "s2", name: "Sediu central" }, c: { siteId: "s3", name: "Showroom" } };
const siteOf = (requestId: string) => sites[requestId] ?? null;
const none = { q: "", site: "", year: "", attention: false, mode: "cereri" as const };

describe("Cereri și oferte · the view of the workspace (N-020, 640:11188)", () => {
  it("counts fixed totals and the offers the server marks as waiting, whatever is shown", () => {
    const all = buildRequestsView(workspace, siteOf, none);
    const filtered = buildRequestsView(workspace, siteOf, { ...none, attention: true, q: "showroom" });
    expect(all.totals).toEqual({ requests: 3, offers: 4, waiting: 2 });
    expect(filtered.totals).toEqual(all.totals);
  });

  it("În așteptare keeps a waiting request whole and names the requests it leaves out (640:11601)", () => {
    const view = buildRequestsView(workspace, siteOf, { ...none, attention: true });
    expect(view.groups.map((group) => group.request.requestId)).toEqual(["a"]);
    expect(view.groups[0]!.offers.map((offer) => offer.quote.reference)).toEqual(["OF-q1", "OF-q2"]);
    expect(view.waitingShown).toBe(2);
    expect(view.withoutWaiting.map((item) => item.reference)).toEqual(["CER-b", "CER-c"]);
    // Toate ofertele + În așteptare (640:11942): the waiting offers only, each once.
    expect(view.offers.map((offer) => offer.quote.reference)).toEqual(["OF-q1", "OF-q2"]);
  });

  it("gives each offer once with the job of its order, and the request's site", () => {
    const view = buildRequestsView(workspace, siteOf, none);
    expect(view.offers.map((offer) => [offer.quote.reference, offer.job?.jobId ?? null, offer.site?.name ?? null])).toEqual([
      ["OF-q1", null, "Depozit Ghimbav"],
      ["OF-q2", null, "Depozit Ghimbav"],
      ["OF-q3", "j3", "Sediu central"],
      ["OF-q4", "j4", "Showroom"],
    ]);
    expect(new Set(view.groups.flatMap((group) => group.offers.map((offer) => offer.quote.quoteSnapshotId))).size).toBe(4);
  });

  it("keeps a request without an offer in Pe cereri unless a filter excludes it", () => {
    const lonely = { ...workspace, requests: [...workspace.requests, request("d", { title: "Totem" })] };
    expect(buildRequestsView(lonely, siteOf, none).groups.map((group) => group.request.requestId)).toContain("d");
    expect(buildRequestsView(lonely, siteOf, { ...none, attention: true }).groups.map((group) => group.request.requestId)).not.toContain("d");
  });

  it("filters by site and year from the server's data, with choices counted from the requests", () => {
    const bySite = buildRequestsView(workspace, siteOf, { ...none, site: "s3" });
    expect(bySite.groups.map((group) => group.request.requestId)).toEqual(["c"]);
    expect(bySite.offers.map((offer) => offer.quote.reference)).toEqual(["OF-q4"]);
    const byYear = buildRequestsView(workspace, siteOf, { ...none, year: "2025" });
    expect(byYear.groups.map((group) => group.request.requestId)).toEqual(["c"]);
    expect(byYear.years).toEqual([{ value: "2026", label: "2026", count: 2 }, { value: "2025", label: "2025", count: 1 }]);
  });

  describe("the year belongs to the mode: the request's in Pe cereri, the offer's in Toate ofertele", () => {
    // A request of December 2025 answered by an offer of January 2026, and an offer with no request.
    const across = {
      requests: [request("dec", { createdAt: "2025-12-18T09:00:00.000Z" })],
      quotes: [
        quote("jan", "dec", { ...waiting, createdAt: "2026-01-12T09:00:00.000Z" }),
        quote("solo", null, { createdAt: "2024-05-02T09:00:00.000Z" }),
      ],
      jobs: [],
    };

    it("offers the request years in Pe cereri and the offer years — with the loose offer — in Toate ofertele", () => {
      expect(buildRequestsView(across, siteOf, { ...none, mode: "cereri" }).years).toEqual([{ value: "2025", label: "2025", count: 1 }]);
      expect(buildRequestsView(across, siteOf, { ...none, mode: "oferte" }).years).toEqual([
        { value: "2026", label: "2026", count: 1 },
        { value: "2024", label: "2024", count: 1 },
      ]);
    });

    it("Anul cererii 2025 keeps the December request whole, with its January offer", () => {
      const view = buildRequestsView(across, siteOf, { ...none, mode: "cereri", year: "2025" });
      expect(view.groups.map((group) => group.request.requestId)).toEqual(["dec"]);
      expect(view.groups[0]!.offers.map((offer) => offer.quote.reference)).toEqual(["OF-jan"]);
      // An offer without a request has no request year: it is named, and found in Toate ofertele.
      expect(view.loose).toEqual([]);
      expect(view.looseWithoutYear).toBe(1);
    });

    it("Anul ofertei 2026 finds the January offer, 2024 the offer without a request", () => {
      expect(buildRequestsView(across, siteOf, { ...none, mode: "oferte", year: "2026" }).offers.map((offer) => offer.quote.reference)).toEqual(["OF-jan"]);
      expect(buildRequestsView(across, siteOf, { ...none, mode: "oferte", year: "2024" }).offers.map((offer) => offer.quote.reference)).toEqual(["OF-solo"]);
    });

    it("keeps an active year with no results as a choice of its own, counted 0, in either mode", () => {
      const offers2025 = buildRequestsView(across, siteOf, { ...none, mode: "oferte", year: "2025" });
      expect(offers2025.offers).toEqual([]);
      expect(offers2025.years).toContainEqual({ value: "2025", label: "2025", count: 0 });
      const requests2026 = buildRequestsView(across, siteOf, { ...none, mode: "cereri", year: "2026" });
      expect(requests2026.groups).toEqual([]);
      expect(requests2026.years.map((year) => year.value)).toEqual(["2026", "2025"]);
    });
  });

  it("searches titles, references and products, and keeps an offer without a request apart", () => {
    const loose = { ...workspace, quotes: [...workspace.quotes, quote("q9", null, { productLabel: "Totem" })] };
    const view = buildRequestsView(loose, siteOf, { ...none, q: "totem" });
    expect(view.groups).toEqual([]);
    expect(view.loose.map((offer) => offer.quote.reference)).toEqual(["OF-q9"]);
    expect(buildRequestsView(loose, siteOf, { ...none, q: "cer-a" }).groups.map((group) => group.request.requestId)).toEqual(["a"]);
  });
});

describe("Progres comercial (640:11188, 608:9487)", () => {
  const view = buildRequestsView(workspace, siteOf, none);
  it("counts the offers by what the server says of each and names the work by its own stage", () => {
    expect(commercialProgress(view.groups[0]!)).toBe("2 oferte în așteptare · fără lucrare");
    expect(commercialProgress(view.groups[1]!)).toBe("1 ofertă cu comandă · lucrarea e în lucru");
  });

  it("never reads a superseded version as waiting or current, and says when there is no offer", () => {
    const versions = buildRequestsView(
      { requests: [request("v")], quotes: [quote("v2", "v", waiting), quote("v1", "v", { superseded: true, attentionLabel: "Înlocuită de o versiune mai nouă" })], jobs: [] },
      siteOf,
      none,
    );
    expect(commercialProgress(versions.groups[0]!)).toBe("1 ofertă în așteptare · 1 înlocuită · fără lucrare");
    expect(commercialProgress({ offers: [], jobs: [] })).toBe("Fără ofertă încă");
  });
});
