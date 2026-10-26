import { useEffect, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 etapa 6 · Fotografii: groups and distinct counts, the filters with the viewer's set, the
 * one viewer in the address (next / previous, close back on the tile), its unavailable and failed
 * states, the phone controls and a photo upload — through the server's routes (mocked here).
 */
type Reply = { status: number; body?: unknown };
const reply = ({ status, body = null }: Reply) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, blob: async () => new Blob(["img"], { type: "image/jpeg" }), headers: new Headers() });

const photo = (id: string, stage: "BEFORE" | "SIMULATION" | "AFTER", date: string, links: unknown[] = []) => ({
  documentId: id, title: `Foto ${id}`, kind: "PHOTO", kindLabel: "Fotografie", photoStage: stage, photoStageLabel: { BEFORE: "Înainte", SIMULATION: "Simulare", AFTER: "După montaj" }[stage],
  documentNumber: null, documentDate: date, description: null, originalFileName: `${id}.jpg`, sizeBytes: 2048, preview: "IMAGE", uploadedAt: "2026-10-24T00:00:00.000Z", revision: 1, links,
  viewHref: `/api/customers/cus-1/documents/${id}/content?disposition=inline`, downloadHref: `/api/customers/cus-1/documents/${id}/content?disposition=attachment`,
});

const r1 = { kind: "REQUEST", kindLabel: "Cerere", subjectId: "r1", label: "CER-1 · Casetă depozit" };
const r2 = { kind: "REQUEST", kindLabel: "Cerere", subjectId: "r2", label: "CER-2 · Litere recepție" };
// "shared" is attached to two requests: shown in both groups, counted once.
const shared = photo("shared", "BEFORE", "2026-10-20", [r1, r2]);
const sim = photo("sim", "SIMULATION", "2026-10-21", [r1]);
const after = photo("after", "AFTER", "2026-10-25", [r1]);
const old = photo("old", "AFTER", "2021-07-01", [{ kind: "HISTORICAL_WORK", kindLabel: "Lucrare istorică", subjectId: "h1", label: "Litere 2021" }]);

const entry = (over: Record<string, unknown>) => ({
  entryId: "e", kind: "PROJECT", title: "Proiect", reference: null, eventDateLabel: "", year: 2026, state: "OFERTARE", stateLabel: "Ofertare", provenance: "WORKOS", provenanceLabel: "În WorkOS",
  site: null, siteAtTimeLabel: null, description: null, request: null, historicalWorkId: null, states: [], branches: [], documents: [], photoCount: 0, matchedOn: [], ...over,
});

let photos: Array<ReturnType<typeof photo>>;
let entries: Array<ReturnType<typeof entry>>;
let content: number[];
let calls: Array<{ method: string; url: string }>;

const dossierBody = () => ({
  dossier: {
    customerId: "cus-1",
    permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: { documentKinds: [{ value: "PHOTO", label: "Fotografie" }, { value: "OTHER", label: "Alt document" }], photoStages: [{ value: "BEFORE", label: "Înainte" }, { value: "SIMULATION", label: "Simulare" }, { value: "AFTER", label: "După montaj" }], historyStates: [], maxFileBytes: 50 * 1024 * 1024 },
    sites: [{ siteId: "s1", name: "Depozit Ghimbav", status: "ACTIVE", statusLabel: "Activ", address: "DN1 km 7", city: "Ghimbav", revision: 1, usage: { requests: 1, jobs: 0, historicalWorks: 0, documents: 0 } }],
    siteAssignments: [],
    documents: photos,
    historicalWorks: [],
    linkTargets: { requests: [{ subjectId: "r1", label: "CER-1 · Casetă depozit" }, { subjectId: "r2", label: "CER-2 · Litere recepție" }], jobs: [], historicalWorks: [], sites: [{ subjectId: "s1", label: "Depozit Ghimbav" }] },
  },
});

function Harness() {
  const [, setLocation] = useState(() => window.location.search);
  useEffect(() => {
    const update = () => setLocation(window.location.search);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return <ClientDetailPage customerId="cus-1" search={window.location.search} />;
}

beforeEach(() => {
  photos = [shared, sim, after, old];
  entries = [
    entry({ entryId: "p1", title: "Casetă depozit", request: { requestId: "r1", reference: "CER-1", title: "Casetă", statusLabel: "" }, site: { siteId: "s1", name: "Depozit Ghimbav", line: "", active: true }, documents: [after, sim, shared] }),
    entry({ entryId: "p2", title: "Litere recepție", request: { requestId: "r2", reference: "CER-2", title: "Litere", statusLabel: "" }, documents: [shared] }),
    entry({ entryId: "h1", kind: "HISTORICAL_WORK", title: "Litere 2021", reference: "AC-2021-014", year: 2021, stateLabel: "Finalizată", provenance: "HISTORICAL_RECORD", historicalWorkId: "h1", documents: [old] }),
  ];
  content = [];
  calls = [];
  sessionStorage.clear();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:photo", revokeObjectURL: () => undefined }));
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (url.endsWith("/workspace")) {
        return reply({ status: 200, body: { workspace: { customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE" }, canCreateRequest: true, summary: { requestCount: 2, openRequestCount: 2, quoteCount: 0, jobCount: 0, historicalWorkCount: 1, workCount: 1 }, requests: [], quotes: [], jobs: [] } } });
      }
      if (url.endsWith("/dossier")) return reply({ status: 200, body: dossierBody() });
      if (url.includes("/history")) {
        return reply({ status: 200, body: { customerId: "cus-1", history: { total: entries.length, page: 1, pageCount: 1, entries, totals: { entries: entries.length, projects: 2, historicalWorks: 1, uploads: 0, documents: 0, photos: photos.length }, facets: { years: [], yearCounts: [], states: [], provenances: [], sites: [] } } } });
      }
      if (url.includes("/content")) return reply({ status: content.shift() ?? 200 });
      if (method === "POST" && url.endsWith("/documents")) return reply({ status: 201, body: { documentId: "new" } });
      return reply({ status: 404, body: {} });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

const search = () => new URLSearchParams(window.location.search);
const tiles = (group: HTMLElement) => within(group).getAllByRole("button", { name: /^Deschide fotografia/ });

describe("Fotografii · gallery (675:18371)", () => {
  it("shows a photo attached to two requests in both groups and counts it once", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii");
    render(<Harness />);
    expect(await screen.findByText("4 fotografii · 3 grupuri")).toBeInTheDocument();
    const p1 = screen.getByRole("region", { name: "Casetă depozit" });
    const p2 = screen.getByRole("region", { name: "Litere recepție" });
    expect(tiles(p1).map((tile) => tile.getAttribute("aria-label"))).toEqual(["Deschide fotografia 1 din 3: Înainte · Foto shared", "Deschide fotografia 2 din 3: Simulare · Foto sim", "Deschide fotografia 3 din 3: După montaj · Foto after"]);
    expect(within(p1).getByText("Apare și la: Litere recepție")).toBeInTheDocument();
    expect(within(p2).getByText("Apare și la: Casetă depozit")).toBeInTheDocument();
    expect(within(p1).getByRole("link", { name: /Deschide cererea CER-1/ })).toHaveAttribute("href", expect.stringContaining("r1"));
    // Filtered on Înainte: the shared photo is in two groups and counts once.
    await userEvent.click(screen.getByRole("button", { name: /^Etapă/ }));
    await userEvent.click(within(screen.getByRole("list", { name: "Etapă" })).getByRole("button", { name: /^Înainte/ }));
    expect(await screen.findByText("1 din 4 fotografii · 2 grupuri")).toBeInTheDocument();
    expect(search().get("etapa")).toBe("BEFORE");
  });

  it("opens a photo in the address, moves inside its filtered group and closes back on the tile shown last (route 1)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii&an=2026");
    render(<Harness />);
    const p1 = await screen.findByRole("region", { name: "Casetă depozit" });
    await userEvent.click(tiles(p1)[0]!);
    const viewer = await screen.findByRole("dialog");
    expect(search().get("fotografie")).toBe("shared");
    expect(search().get("grup")).toBe("p1");
    expect(within(viewer).getByText("Foto shared · Casetă depozit · 1 din 3")).toBeInTheDocument();
    expect(within(viewer).getByRole("link", { name: /Deschide cererea CER-1/ })).toBeInTheDocument();
    expect(await within(viewer).findByRole("img", { name: "Foto shared" })).toHaveAttribute("src", "blob:photo");
    await userEvent.click(within(viewer).getByRole("button", { name: "Fotografia următoare" }));
    expect(within(viewer).getByText(/2 din 3/)).toBeInTheDocument();
    await waitFor(() => expect(search().get("fotografie")).toBe("sim"));
    await userEvent.keyboard("{ArrowLeft}");
    await userEvent.keyboard("{ArrowLeft}");
    expect(within(viewer).getByText(/3 din 3/)).toBeInTheDocument();
    fireEvent(viewer, new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(search().get("fotografie")).toBeNull();
    expect(search().get("an")).toBe("2026");
    await waitFor(() => expect(tiles(screen.getByRole("region", { name: "Casetă depozit" }))[2]).toHaveFocus());
  });

  it("says when an image cannot be shown, and retries a failed read (675:19286)", async () => {
    content = [410];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii&fotografie=shared&grup=p2");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog");
    expect(await within(viewer).findByText("Imaginea nu mai poate fi afișată")).toBeInTheDocument();
    expect(within(viewer).getByText("Foto shared · Litere recepție · 1 din 1")).toBeInTheDocument();
    expect(within(viewer).getByRole("button", { name: "Închide · Esc" })).toBeInTheDocument();
  });

  it("retries a failed read of the image", async () => {
    content = [503, 200];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii&fotografie=old&grup=h1");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog");
    expect(await within(viewer).findByText("Imaginea nu a putut fi citită")).toBeInTheDocument();
    expect(within(viewer).getByRole("link", { name: /Deschide înregistrarea AC-2021-014/ })).toBeInTheDocument();
    await userEvent.click(within(viewer).getByRole("button", { name: "Încearcă din nou" }));
    expect(await within(viewer).findByRole("img", { name: "Foto old" })).toBeInTheDocument();
  });

  it("keeps the set to the group, closes with „Închide” on a phone, with buttons for previous and next", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("max-width: 767px"), media: query, addEventListener() {}, removeEventListener() {} }));
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii&fotografie=sim&grup=p1");
    render(<Harness />);
    const viewer = await screen.findByRole("dialog");
    expect(within(viewer).getByText("2 din 3 · Casetă depozit")).toBeInTheDocument();
    expect(within(viewer).queryByRole("list", { name: "Fotografiile setului" })).toBeNull();
    await userEvent.click(within(viewer).getByRole("button", { name: "Următoarea →" }));
    expect(within(viewer).getByText("3 din 3 · Casetă depozit")).toBeInTheDocument();
    await userEvent.click(within(viewer).getByRole("button", { name: "← Anterioara" }));
    expect(within(viewer).getByText("2 din 3 · Casetă depozit")).toBeInTheDocument();
    await userEvent.click(within(viewer).getByRole("button", { name: "Închide" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("uploads a photo with its stage and says in which group it appears (677:19575)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii");
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: /Încarcă fotografie/ }));
    const dialog = await screen.findByRole("dialog", { name: "Încarcă fotografie" });
    expect(dialog).toHaveAttribute("data-frame");
    await userEvent.upload(within(dialog).getByLabelText("Fișier *"), new File(["img"], "fatada.jpg", { type: "image/jpeg" }));
    expect(within(dialog).getByRole("button", { name: "Încarcă" })).toBeDisabled();
    await userEvent.selectOptions(within(dialog).getByLabelText("Etapă *"), "BEFORE");
    await userEvent.click(within(dialog).getByLabelText("CER-1 · Casetă depozit"));
    expect(within(dialog).queryByLabelText("Număr (dacă se știe)")).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "Încarcă" }));
    expect(await within(dialog).findByText("Fotografia a fost încărcată")).toBeInTheDocument();
    expect(within(dialog).getByText(/apare în grupul „CER-1 · Casetă depozit”, etapa Înainte/)).toBeInTheDocument();
  });

  it("gives the focus back to the tile's „⋯” after a dialog opened from it", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii");
    render(<Harness />);
    const group = await screen.findByRole("region", { name: "Litere 2021" });
    const more = within(group).getByRole("button", { name: "Acțiuni pentru Foto old" });
    await userEvent.click(more);
    await userEvent.click(within(group).getByRole("button", { name: "Modifică datele" }));
    const form = await screen.findByRole("dialog", { name: "Modifică datele documentului" });
    expect(within(form).getByLabelText("Etapă *")).toHaveValue("AFTER");
    await userEvent.click(within(form).getByRole("button", { name: "Renunță" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Acțiuni pentru Foto old" })).toHaveFocus());
  });

  it("says when the client has no photos", async () => {
    photos = [];
    entries = [];
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii");
    render(<Harness />);
    expect(await screen.findByText("Nu există fotografii")).toBeInTheDocument();
  });
});
