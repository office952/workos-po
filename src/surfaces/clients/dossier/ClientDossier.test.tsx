import { useEffect, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

/** Re-renders the page on popstate with the current query, as the app does. */
function Routed({ customerId }: { customerId: string }) {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const update = () => setSearch(window.location.search);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return <ClientDetailPage customerId={customerId} search={search} />;
}

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const workspace = {
  workspace: {
    customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE" },
    canCreateRequest: true,
    summary: { requestCount: 0, openRequestCount: 0, requestNeedsAction: 0, quoteCount: 0, quoteNeedsAction: 0, jobCount: 0, jobNeedsAction: 0 },
    requests: [],
    quotes: [],
    jobs: [],
  },
};

const photo = {
  documentId: "cdoc:1",
  title: "Litere montate depozit",
  kind: "PHOTO",
  kindLabel: "Fotografie",
  photoStage: "AFTER",
  photoStageLabel: "După montaj",
  originalFileName: "dupa.png",
  sizeBytes: 2048,
  preview: "IMAGE",
  uploadedAt: "2026-10-23T10:00:00.000Z",
  revision: 1,
  links: [{ kind: "HISTORICAL_WORK", kindLabel: "Lucrare istorică", subjectId: "hwork:1", label: "Litere depozit" }],
  viewHref: "/api/customers/cus-1/documents/cdoc%3A1/content?disposition=inline",
  downloadHref: "/api/customers/cus-1/documents/cdoc%3A1/content?disposition=attachment",
};

const dossier = (sites: unknown[] = []) => ({
  dossier: {
    customerId: "cus-1",
    permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: {
      documentKinds: [{ value: "INVOICE", label: "Factură" }, { value: "PHOTO", label: "Fotografie" }],
      photoStages: [{ value: "AFTER", label: "După montaj" }],
      historyStates: [],
      maxFileBytes: 52428800,
    },
    sites,
    siteAssignments: [],
    documents: [photo],
    historicalWorks: [],
    linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  },
});

function history(entries: unknown[]) {
  return {
    history: {
      total: entries.length,
      page: 1,
      pageCount: 1,
      entries,
      facets: { years: [2026, 2021], states: [{ state: "FINALIZAT", label: "Finalizat", count: 1 }], sites: [] },
      totals: { entries: 4, projects: 3, historicalWorks: 1, documents: 4, photos: 6 },
    },
  };
}

const work2021 = {
  entryId: "historical:hwork:1",
  kind: "HISTORICAL_WORK",
  title: "Litere depozit",
  reference: "HIST-2021",
  eventDateLabel: "iun. 2021",
  year: 2021,
  state: "FINALIZAT",
  stateLabel: "Finalizat",
  provenance: "HISTORICAL_RECORD",
  provenanceLabel: "Înregistrare istorică — anterioară sistemului",
  site: { siteId: "site:1", name: "Depozit", line: "Depozit · Oradea", active: true },
  siteAtTimeLabel: null,
  description: null,
  request: null,
  states: ["FINALIZAT"],
  branches: [],
  documents: [photo],
  photoCount: 1,
  matchedOn: ["Referință"],
};

describe("client dossier sections", () => {
  it("searches the history and opens the 2021 photo directly from the result", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=istoric");
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/workspace")) return json(200, workspace);
        if (url.endsWith("/dossier")) return json(200, dossier());
        if (url.includes("/history")) return json(200, history(url.includes("q=2021") ? [work2021] : []));
        return json(404, {});
      }),
    );
    render(<Routed customerId="cus-1" />);
    expect(await screen.findByRole("heading", { name: "Istoric" })).toBeInTheDocument();
    await userEvent.type(screen.getByRole("searchbox", { name: "Caută în istoric" }), "2021");
    const item = await screen.findByText("Litere depozit", { selector: "h4" });
    expect(calls.some((url) => url.includes("/history?q=2021"))).toBe(true);
    const entry = item.closest("li") as HTMLElement;
    expect(within(entry).getByText(/^Înregistrare istorică/)).toBeInTheDocument();
    // N-020 · compact on the card, the full server list behind "Detalii potrivire".
    expect(within(entry).getByText(/^Potrivire:/).closest("p")?.textContent).toBe("Potrivire: referință");
    await userEvent.click(within(entry).getByRole("button", { name: "Detalii potrivire" }));
    expect(within(within(entry).getByRole("list", { name: "Unde s-a găsit textul" })).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Referință"]);
    await userEvent.click(within(entry).getByRole("button", { name: "Deschide fotografia Litere montate depozit" }));
    const dialog = await screen.findByRole("dialog");
    // The viewer reads the image through its own request (loading / unavailable states, 675:19198).
    await waitFor(() => expect(calls).toContain(photo.viewHref));
    expect(within(dialog).getByRole("link", { name: "Descarcă" })).toHaveAttribute("href", photo.downloadHref);
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide · Esc" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("creates a site and asks before closing a form with typed values", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=sedii");
    let sites: unknown[] = [];
    const posted: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/workspace")) return json(200, workspace);
        if (url.endsWith("/sites") && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          posted.push(body);
          sites = [{ siteId: "site:9", name: body.name, address: body.address, city: null, status: "ACTIVE", statusLabel: "Activ", revision: 1, usage: { requests: 0, jobs: 0, historicalWorks: 0, documents: 0 } }];
          return json(201, { site: sites[0] });
        }
        if (url.endsWith("/dossier")) return json(200, dossier(sites));
        return json(404, {});
      }),
    );
    render(<ClientDetailPage customerId="cus-1" search="?sectiune=sedii" />);
    expect(await screen.findByText("Niciun sediu")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Adaugă sediu" }));
    await userEvent.type(screen.getByLabelText("Denumire *"), "Showroom Iași");
    await userEvent.click(screen.getByRole("button", { name: "Renunță" }));
    // "Renunță" is an explicit discard; the close (×) button asks first.
    await userEvent.click(screen.getByRole("button", { name: "Adaugă sediu" }));
    await userEvent.type(screen.getByLabelText("Denumire *"), "Showroom Iași");
    await userEvent.click(screen.getByRole("button", { name: "Închide formularul" }));
    expect(await screen.findByText("Ai valori nesalvate")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuă completarea" }));
    await userEvent.type(screen.getByLabelText("Adresă"), "Str. Palat 1");
    await userEvent.click(screen.getByRole("button", { name: "Salvează sediul" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({ name: "Showroom Iași", address: "Str. Palat 1", city: null });
    expect(await screen.findByRole("heading", { name: "Showroom Iași" })).toBeInTheDocument();
  });
});
