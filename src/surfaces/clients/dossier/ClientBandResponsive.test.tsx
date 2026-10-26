import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 design final · the client header on tablet (588:7090) and phone (649:14364, sheet
 * 588:8844): Alte acțiuni by server permission, the contacts panel, the section navigation, focus
 * and closing; and the photo actions menu.
 */
function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function viewport(mode: "tablet" | "phone") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: mode === "phone" ? query.includes("max-width: 767px") : query.includes("min-width: 768px"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

const quote = {
  quoteSnapshotId: "q1", kind: "PRODUCT", kindLabel: "Produs", assemblyId: null, sectionCount: 1, superseded: false, grossDisplay: null, currency: null,
  productCode: "P", productLabel: "Litere", reference: "OF-1", inscription: "", customerDisplayName: "Alpha", stage: "QUOTE_CREATED", stageLabel: "Creată",
  createdAt: null, nextAction: "ACCEPT_QUOTE", nextActionLabel: "Marchează acceptată", needsAttention: true, attentionLabel: "Urmează acceptarea",
  requestId: "r1", requestReference: "CER-1", orderSnapshotId: null,
};

const workspace = {
  workspace: {
    customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE", cui: "RO1", contactName: "Ana Pop", phone: "0700 000 111", email: null },
    canCreateRequest: true,
    summary: { requestCount: 3, openRequestCount: 3, quoteCount: 4, jobCount: 2, historicalWorkCount: 3, workCount: 5 },
    requests: [],
    quotes: [quote, { ...quote, quoteSnapshotId: "q2", reference: "OF-2" }],
    jobs: [],
  },
};

const photo = {
  documentId: "d1", title: "Releveu fațadă", kind: "PHOTO", kindLabel: "Fotografie", photoStage: "BEFORE", photoStageLabel: "Înainte", documentNumber: null,
  documentDate: "2026-10-22", description: "Imagine ilustrativă", originalFileName: "r.png", sizeBytes: 1, preview: "IMAGE", uploadedAt: "2026-10-22T00:00:00.000Z",
  revision: 1, links: [], viewHref: "/v/d1", downloadHref: "/d/d1",
};

const dossier = {
  dossier: {
    customerId: "cus-1",
    permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: { documentKinds: [], photoStages: [{ value: "BEFORE", label: "Înainte" }], historyStates: [], maxFileBytes: 1 },
    sites: [], siteAssignments: [], documents: [photo], historicalWorks: [], linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  },
};

const entry = {
  entryId: "project:r1", kind: "PROJECT", title: "Casetă depozit", reference: null, eventDateLabel: "23 oct. 2026", year: 2026, state: "OFERTARE", stateLabel: "Ofertare",
  provenance: "WORKOS", provenanceLabel: "În WorkOS", site: null, siteAtTimeLabel: null, description: null,
  request: { requestId: "r1", reference: "CER-1", title: "Casetă", statusLabel: "Deschisă" }, historicalWorkId: null, states: ["OFERTARE"], branches: [],
  documents: [photo], photoCount: 1, matchedOn: [],
};

const history = {
  history: {
    total: 1, page: 1, pageCount: 1, entries: [entry],
    totals: { entries: 8, projects: 3, historicalWorks: 3, uploads: 2, documents: 9, photos: 10 },
    facets: { years: [2026], yearCounts: [{ year: 2026, count: 1 }], states: [], provenances: [], sites: [] },
  },
};

function serve() {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
    const url = String(input);
    if (url.endsWith("/workspace")) return json(200, workspace);
    if (url.endsWith("/dossier")) return json(200, dossier);
    if (url.includes("/history")) return json(200, history);
    return json(404, {});
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

describe("client header on tablet and phone (N-020 design final)", () => {
  it("tablet (588:7090): Alte acțiuni by permission, Escape and a click elsewhere close it, the focus returns", async () => {
    viewport("tablet");
    serve();
    render(<ClientDetailPage customerId="cus-1" search="" />);
    await screen.findByRole("heading", { level: 1, name: "Alpha Clima" });
    const more = await screen.findByRole("button", { name: "Alte acțiuni" });
    await userEvent.click(more);
    const menu = screen.getByRole("list", { name: "Alte acțiuni" });
    expect(within(menu).getAllByRole("button").map((item) => item.textContent)).toEqual(["Adaugă lucrare istorică", "Încarcă document", "Adaugă sediu", "Modifică datele comerciale"]);
    // Opening moves the focus into the menu; Escape closes it and gives the focus back.
    expect(within(menu).getAllByRole("button")[0]).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();
    await userEvent.click(more);
    await userEvent.click(screen.getByRole("heading", { level: 1, name: "Alpha Clima" }));
    expect(screen.queryByRole("list", { name: "Alte acțiuni" })).toBeNull();
    // The contact on one line, its panel opened apart from the menu.
    await userEvent.click(screen.getByRole("button", { name: "Toate (1)" }));
    expect(screen.getByRole("region", { name: "Contactele clientului" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Alte acțiuni" })).toBeNull();
    // The tabs keep the current section in sight and put the others under "+ 4 secțiuni".
    const nav = screen.getByRole("navigation", { name: "Secțiuni client" });
    expect(within(nav).getByRole("link", { name: /^Istoric/ })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("button", { name: "+ 4 secțiuni" }));
    expect(within(screen.getByRole("list", { name: "Alte secțiuni" })).getAllByRole("link").map((link) => link.textContent?.replace(/\d.*$/, "").trim())).toEqual(["Documente", "Fotografii", "Sedii", "Date comerciale"]);
    expect(screen.getAllByRole("button", { name: "Cerere nouă" })).toHaveLength(1);
  });

  it("phone (649:14364): the way back, the contact card, Alte acțiuni and Secțiunea · Schimbă", async () => {
    viewport("phone");
    serve();
    render(<ClientDetailPage customerId="cus-1" search="" />);
    await screen.findByRole("heading", { level: 1, name: "Alpha Clima" });
    // The way back is a visible control with a clear name.
    expect(screen.getByRole("link", { name: /^Clienți · litera A · rândul Alpha Clima/ })).toHaveAttribute("href", "/clienti?client=cus-1");
    // The contact card: the principal contact and its phone; the panel lists the contacts and what is empty.
    const contacts = screen.getByRole("button", { name: "Toate (1)" });
    await userEvent.click(contacts);
    const panel = screen.getByRole("region", { name: "Contactele clientului" });
    expect(within(panel).getByRole("link", { name: "0700 000 111" })).toHaveAttribute("href", "tel:0700000111");
    expect(within(panel).getByText("Necompletat în fișa clientului: e-mail, adresă, localitate.")).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: /cereri deschise/ })).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(contacts).toHaveAttribute("aria-expanded", "false");
    expect(contacts).toHaveFocus();
    await userEvent.click(contacts);
    await userEvent.click(screen.getByRole("heading", { level: 1, name: "Alpha Clima" }));
    expect(screen.queryByRole("region", { name: "Contactele clientului" })).toBeNull();
    // Alte acțiuni: its own menu.
    const actions = screen.getByRole("button", { name: "Alte acțiuni" });
    await userEvent.click(actions);
    expect(within(screen.getByRole("list", { name: "Alte acțiuni" })).getByRole("button", { name: "Adaugă lucrare istorică" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Contactele clientului" })).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(actions).toHaveFocus();
    expect(screen.getAllByRole("button", { name: "Cerere nouă" })).toHaveLength(1);
    // Secțiunea · Schimbă opens the list of sections (R1: what each holds, no counts); closing returns the focus.
    const nav = screen.getByRole("navigation", { name: "Secțiuni client" });
    expect(within(nav).getByText("Istoric")).toBeInTheDocument();
    const change = within(nav).getByRole("button", { name: /Schimbă/ });
    await userEvent.click(change);
    const sheet = screen.getByRole("dialog", { name: "Alpha Clima · secțiuni" });
    expect(within(sheet).getByRole("link", { name: /^Istoric/ })).toHaveAttribute("aria-current", "page");
    expect(within(sheet).getByRole("link", { name: /^Cereri și oferte/ })).toHaveTextContent("necesită atenție");
    expect(within(sheet).getByRole("link", { name: /^Lucrări/ })).toHaveTextContent("În WorkOS și înregistrări istorice");
    await userEvent.click(within(sheet).getByRole("button", { name: "Închide" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(change).toHaveFocus();
  });

  it("phone: without the permission to record, Alte acțiuni does not offer it", async () => {
    viewport("phone");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/workspace")) return json(200, workspace);
      if (url.endsWith("/dossier")) return json(200, { dossier: { ...dossier.dossier, permissions: { ...dossier.dossier.permissions, recordHistoricalWork: false } } });
      if (url.includes("/history")) return json(200, history);
      return json(404, {});
    }));
    render(<ClientDetailPage customerId="cus-1" search="" />);
    await screen.findByRole("heading", { level: 1, name: "Alpha Clima" });
    await userEvent.click(await screen.findByRole("button", { name: "Alte acțiuni" }));
    const menu = screen.getByRole("list", { name: "Alte acțiuni" });
    expect(within(menu).getByRole("button", { name: "Încarcă document" })).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: /lucrare istorică/ })).toBeNull();
  });

  it("photos: download, associate and edit sit in one menu per photo", async () => {
    viewport("tablet");
    serve();
    render(<ClientDetailPage customerId="cus-1" search="?sectiune=fotografii" />);
    const button = await screen.findByRole("button", { name: "Acțiuni pentru Releveu fațadă" });
    expect(screen.queryByRole("link", { name: "Descarcă" })).toBeNull();
    await userEvent.click(button);
    const menu = screen.getByRole("group", { name: "Acțiuni pentru Releveu fațadă" });
    expect(within(menu).getByRole("link", { name: /Descarcă/ })).toHaveAttribute("href", "/d/d1");
    expect(within(menu).getByRole("button", { name: /Asociază/ })).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: /Modifică/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(button).toHaveFocus();
  });
});
