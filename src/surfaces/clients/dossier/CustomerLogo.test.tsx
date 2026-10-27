import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-023 · „Alte acțiuni” → „Sigla clientului”, through the server's routes (mocked): choose, preview,
 * confirm with the revision read, replace, back to the monogram, cancel, unsaved selection, retry
 * after an error, a 409 that keeps the selection, the header updated without a manual refresh, and no
 * action without the permission. The browser decoding is replaced by a stub (jsdom does not decode).
 */
// Files named "slow-<letter>" stay "being read" until the test answers for them.
const decoding = vi.hoisted(() => new Map<string, { resolve: (size: { width: number; height: number }) => void; reject: (error: Error) => void }>());

vi.mock("./logoModel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./logoModel")>()),
  readImageSize: vi.fn(async (url: string) => {
    const slow = /slow-[a-z]/.exec(url)?.[0];
    if (slow) return new Promise((resolve, reject) => decoding.set(slow, { resolve, reject }));
    if (url.includes("broken")) throw new Error("decode");
    if (url.includes("huge")) return { width: 5000, height: 100 };
    return { width: 320, height: 120 };
  }),
}));

type Reply = { status: number; body?: unknown };
const reply = ({ status, body = null }: Reply) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body, headers: new Headers() });

type Logo = { revision: number; contentHref: string; width: number; height: number } | null;
let state: { logo: Logo; revision: number };
let canEdit: boolean;
let scripted: Reply[];
let calls: Array<{ method: string; url: string; expectedRevision: string | null; fileName: string | null }>;
let workspaceReads: number;
let objectUrls: string[];
let revoked: string[];

const logoAt = (revision: number): Logo => ({ revision, contentHref: `/api/customers/cus-1/logo/content?revision=${revision}`, width: 320, height: 120 });

beforeEach(() => {
  state = { logo: null, revision: 0 };
  canEdit = true;
  scripted = [];
  calls = [];
  workspaceReads = 0;
  objectUrls = [];
  revoked = [];
  decoding.clear();
  sessionStorage.clear();
  let counter = 0;
  vi.stubGlobal("URL", Object.assign(URL, {
    createObjectURL: (file: File) => {
      counter += 1;
      const url = `blob:${file.name}#${counter}`;
      objectUrls.push(url);
      return url;
    },
    revokeObjectURL: (url: string) => void revoked.push(url),
  }));
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/workspace")) {
      workspaceReads += 1;
      return reply({ status: 200, body: { workspace: { customer: { customerId: "cus-1", displayName: "Alpha Clima SRL", status: "ACTIVE" }, logo: state.logo, logoRevision: state.revision, canCreateRequest: true, summary: { requestCount: 0, openRequestCount: 0, quoteCount: 0, jobCount: 0, historicalWorkCount: 0, workCount: 0 }, requests: [], quotes: [], jobs: [] } } });
    }
    if (url.endsWith("/dossier")) {
      return reply({ status: 200, body: { dossier: { customerId: "cus-1", permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true, editLogo: canEdit }, vocabulary: { documentKinds: [], photoStages: [], historyStates: [], maxFileBytes: 1 }, sites: [], siteAssignments: [], documents: [], historicalWorks: [], linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] } } } });
    }
    if (url.includes("/history")) return reply({ status: 200, body: { history: { total: 0, page: 1, pageCount: 1, entries: [], totals: { entries: 0, projects: 0, historicalWorks: 0, uploads: 0, documents: 0, photos: 0 }, facets: { years: [], yearCounts: [], states: [], provenances: [], sites: [] } } } });
    if (url.includes("/logo")) {
      const form = init?.body instanceof FormData ? init.body : null;
      const expectedRevision = form ? String(form.get("expectedRevision")) : new URL(url, "http://x").searchParams.get("expectedRevision");
      const file = form?.get("file");
      calls.push({ method, url, expectedRevision, fileName: file instanceof File ? file.name : null });
      const next = scripted.shift();
      if (next) return reply(next);
      if (Number(expectedRevision) !== state.revision) return reply({ status: 409, body: { error: "stale_revision", logo: state.logo, logoRevision: state.revision } });
      state = { revision: state.revision + 1, logo: method === "PUT" ? logoAt(state.revision + 1) : null };
      return reply({ status: 200, body: { logo: state.logo, logoRevision: state.revision, alreadyApplied: false } });
    }
    return reply({ status: 404, body: {} });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

async function openLogoDialog() {
  window.history.replaceState({}, "", "/clienti/cus-1");
  render(<ClientDetailPage customerId="cus-1" search="" />);
  await userEvent.click(await screen.findByRole("button", { name: "Alte acțiuni" }));
  await userEvent.click(await screen.findByRole("button", { name: "Sigla clientului" }));
  return screen.findByRole("dialog", { name: "Sigla clientului" });
}

const png = (name = "sigla.png", type = "image/png") => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type });
const headerMark = () => document.querySelector(".cdh__mono .client-mark");

describe("Sigla clientului (N-023)", () => {
  it("chooses, previews and confirms a logo; the header shows it without a manual refresh", async () => {
    const dialog = await openLogoDialog();
    expect(within(dialog).getByText("Fără siglă: se afișează monograma.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Folosește monograma" })).toBeNull();
    expect(headerMark()).toHaveTextContent("AC");
    // The file control is reachable by keyboard and named.
    const input = within(dialog).getByLabelText("Alege fișier");
    input.focus();
    expect(input).toHaveFocus();
    await userEvent.upload(input, png());
    expect(await within(dialog).findByText("sigla.png · 320 × 120 px")).toBeInTheDocument();
    expect(dialog.querySelector("[data-preview] img")).toHaveAttribute("src", objectUrls[0]);
    expect(calls).toEqual([]); // nothing sent before confirming
    const reads = workspaceReads;
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmă sigla" }));
    expect(await within(dialog).findByText("Modificarea a fost salvată.")).toBeInTheDocument();
    expect(calls).toEqual([{ method: "PUT", url: "/api/customers/cus-1/logo", expectedRevision: "0", fileName: "sigla.png" }]);
    expect(within(dialog).getByText("Sigla încărcată · 320 × 120 px")).toBeInTheDocument();
    // The temporary preview URL is released once the selection is gone.
    expect(revoked).toContain(objectUrls[0]);
    await waitFor(() => expect(workspaceReads).toBeGreaterThan(reads));
    await waitFor(() => expect(headerMark()?.querySelector("img")).toHaveAttribute("src", "/api/customers/cus-1/logo/content?revision=1"));
    // The answer took the focus; nothing technical is shown.
    expect(dialog.querySelector(".dlogo__result")).toHaveFocus();
    expect(dialog.textContent).not.toMatch(/expectedRevision|storageKey|image\/png|stale_revision/);
    // Closing returns the focus to „Alte acțiuni” (the menu item that opened the dialog is gone).
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Alte acțiuni" })).toHaveFocus());
  });

  it("replaces the logo, then goes back to the monogram", async () => {
    state = { logo: logoAt(3), revision: 3 };
    const dialog = await openLogoDialog();
    await userEvent.upload(within(dialog).getByLabelText("Alege fișier"), png("noua.webp", "image/webp"));
    await within(dialog).findByText("noua.webp · 320 × 120 px");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmă sigla" }));
    await within(dialog).findByText("Modificarea a fost salvată.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Folosește monograma" }));
    expect(await within(dialog).findByText(/Clientul folosește din nou monograma/)).toBeInTheDocument();
    expect(calls.map((call) => [call.method, call.expectedRevision])).toEqual([["PUT", "3"], ["DELETE", "4"]]);
    expect(within(dialog).getByText("Fără siglă: se afișează monograma.")).toBeInTheDocument();
    await waitFor(() => expect(headerMark()?.querySelector("img")).toBeNull());
  });

  it("cancels an unsaved selection, and asks before closing with one", async () => {
    const dialog = await openLogoDialog();
    await userEvent.upload(within(dialog).getByLabelText("Alege fișier"), png());
    await within(dialog).findByText("sigla.png · 320 × 120 px");
    await userEvent.click(within(dialog).getByRole("button", { name: "Anulează" }));
    expect(within(dialog).getByText("Alege un fișier ca să vezi cum va arăta.")).toBeInTheDocument();
    expect(revoked).toContain(objectUrls[0]);
    await userEvent.upload(within(dialog).getByLabelText("Alege fișier"), png("a-doua.png"));
    await within(dialog).findByText("a-doua.png · 320 × 120 px");
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide formularul" }));
    expect(await within(dialog).findByText("Ai valori nesalvate")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Continuă completarea" }));
    expect(within(dialog).getByText("a-doua.png · 320 × 120 px")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("refuses wrong files before sending, with the reason in plain words", async () => {
    const dialog = await openLogoDialog();
    const input = within(dialog).getByLabelText("Alege fișier");
    await userEvent.upload(input, new File(["<svg/>"], "sigla.svg", { type: "image/svg+xml" }), { applyAccept: false });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("SVG și GIF nu sunt acceptate");
    await userEvent.upload(input, png("broken.png"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("nu poate fi afișat ca imagine");
    await userEvent.upload(input, png("huge.png"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("4096 px");
    expect(within(dialog).queryByRole("button", { name: "Confirmă sigla" })).toBeNull();
    expect(calls).toEqual([]);
  });

  it("keeps the selection after an error and retries; a server refusal is explained", async () => {
    scripted = [{ status: 503, body: { error: "storage_unavailable" } }, { status: 422, body: { error: "invalid_logo", reason: "MALFORMED" } }];
    const dialog = await openLogoDialog();
    await userEvent.upload(within(dialog).getByLabelText("Alege fișier"), png());
    await within(dialog).findByText("sigla.png · 320 × 120 px");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmă sigla" }));
    expect(await within(dialog).findByText("Modificarea nu s-a salvat.")).toBeInTheDocument();
    expect(within(dialog).getByText("sigla.png · 320 × 120 px")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Reîncearcă" }));
    expect(await within(dialog).findByText("Fișierul nu a fost acceptat.")).toBeInTheDocument();
    expect(within(dialog).getByText(/deteriorat sau incomplet/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmă sigla" }));
    expect(await within(dialog).findByText("Modificarea a fost salvată.")).toBeInTheDocument();
    expect(calls).toHaveLength(3);
  });

  it("on a conflict saves nothing, shows the current logo, keeps the selection and confirms on the new revision", async () => {
    const dialog = await openLogoDialog();
    await userEvent.upload(within(dialog).getByLabelText("Alege fișier"), png());
    await within(dialog).findByText("sigla.png · 320 × 120 px");
    // Meanwhile someone else set a logo.
    state = { logo: logoAt(1), revision: 1 };
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmă sigla" }));
    expect(await within(dialog).findByText("Sigla a fost schimbată între timp de altcineva.")).toBeInTheDocument();
    expect(within(dialog).getByText(/fișierul ales de tine a rămas selectat/)).toBeInTheDocument();
    expect(within(dialog).getByText("Sigla încărcată · 320 × 120 px")).toBeInTheDocument();
    expect(within(dialog).getByText("sigla.png · 320 × 120 px")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmă sigla" }));
    expect(await within(dialog).findByText("Modificarea a fost salvată.")).toBeInTheDocument();
    expect(calls.map((call) => call.expectedRevision)).toEqual(["0", "1"]);
  });

  // r1 · independent audit (N023_LOCAL_REVIEW_HOLD_UX_S2): a new choice replaces the earlier one,
  // only the latest read can become the selection, and every temporary URL is released.
  const fileInput = (dialog: HTMLElement) => dialog.querySelector<HTMLInputElement>("input[type=file]")!;
  const urlOf = (name: string) => objectUrls.find((url) => url.startsWith(`blob:${name}#`))!;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const finishReading = async (key: string, size = { width: 320, height: 120 }) => {
    await waitFor(() => expect(decoding.has(key)).toBe(true));
    decoding.get(key)!.resolve(size);
    decoding.delete(key);
  };

  it("A · a valid file followed by an invalid one leaves nothing to confirm", async () => {
    const dialog = await openLogoDialog();
    await userEvent.upload(fileInput(dialog), png("a.png"));
    await within(dialog).findByText("a.png · 320 × 120 px");
    await userEvent.upload(fileInput(dialog), png("broken.png"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("nu poate fi afișat ca imagine");
    expect(within(dialog).queryByRole("button", { name: "Confirmă sigla" })).toBeNull();
    expect(within(dialog).queryByText("a.png · 320 × 120 px")).toBeNull();
    expect(dialog.querySelector("[data-preview]")).toBeNull();
    expect(revoked).toEqual(expect.arrayContaining([urlOf("a.png"), urlOf("broken.png")]));
    // Same with a file refused before reading (format), and with one too large once read.
    await userEvent.upload(fileInput(dialog), png("a2.png"));
    await within(dialog).findByText("a2.png · 320 × 120 px");
    await userEvent.upload(fileInput(dialog), new File(["<svg/>"], "b.svg", { type: "image/svg+xml" }), { applyAccept: false });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("SVG și GIF nu sunt acceptate");
    expect(within(dialog).queryByRole("button", { name: "Confirmă sigla" })).toBeNull();
    await userEvent.upload(fileInput(dialog), png("a3.png"));
    await within(dialog).findByText("a3.png · 320 × 120 px");
    await userEvent.upload(fileInput(dialog), png("huge.png"));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("4096 px");
    expect(within(dialog).queryByRole("button", { name: "Confirmă sigla" })).toBeNull();
    expect(revoked).toEqual(expect.arrayContaining(objectUrls));
    expect(calls).toEqual([]);
  });

  it("B · while another file is read, nothing can be confirmed until it is validated", async () => {
    const dialog = await openLogoDialog();
    await userEvent.upload(fileInput(dialog), png("a.png"));
    await within(dialog).findByText("a.png · 320 × 120 px");
    await userEvent.upload(fileInput(dialog), png("slow-b.png"));
    expect(await within(dialog).findByText("Se citește imaginea…")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Confirmă sigla" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Folosește monograma" })).toBeNull();
    expect(within(dialog).queryByText("a.png · 320 × 120 px")).toBeNull();
    expect(revoked).toContain(urlOf("a.png"));
    await finishReading("slow-b");
    expect(await within(dialog).findByText("slow-b.png · 320 × 120 px")).toBeInTheDocument();
    expect(dialog.querySelector("[data-preview] img")).toHaveAttribute("src", urlOf("slow-b.png"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmă sigla" }));
    await within(dialog).findByText("Modificarea a fost salvată.");
    expect(calls.map((call) => call.fileName)).toEqual(["slow-b.png"]);
  });

  it("C · closing or cancelling while a file is read drops the read and releases its URL", async () => {
    const dialog = await openLogoDialog();
    // „Anulează” during the read.
    await userEvent.upload(fileInput(dialog), png("slow-c.png"));
    await within(dialog).findByText("Se citește imaginea…");
    await userEvent.click(within(dialog).getByRole("button", { name: "Anulează" }));
    expect(revoked).toContain(urlOf("slow-c.png"));
    await finishReading("slow-c");
    await settle();
    expect(within(dialog).getByText("Alege un fișier ca să vezi cum va arăta.")).toBeInTheDocument();
    expect(dialog.querySelector("[data-preview]")).toBeNull();
    // Closing during the read: it counts as unsaved work, then the dialog goes and the URL is released.
    await userEvent.upload(fileInput(dialog), png("slow-d.png"));
    await within(dialog).findByText("Se citește imaginea…");
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide formularul" }));
    expect(await within(dialog).findByText("Ai valori nesalvate")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide fără salvare" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Sigla clientului" })).toBeNull());
    expect(revoked).toContain(urlOf("slow-d.png"));
    // The answer arriving after the close changes nothing and creates no new URL.
    const created = objectUrls.length;
    await finishReading("slow-d");
    await settle();
    expect(screen.queryByRole("dialog", { name: "Sigla clientului" })).toBeNull();
    expect(objectUrls).toHaveLength(created);
    expect(calls).toEqual([]);
  });

  it("D · when two reads finish out of order, only the latest choice can become active", async () => {
    const dialog = await openLogoDialog();
    // The newer read finishes first; the older one finishes afterwards and is ignored.
    await userEvent.upload(fileInput(dialog), png("slow-x.png"));
    await userEvent.upload(fileInput(dialog), png("slow-y.png"));
    await finishReading("slow-y");
    expect(await within(dialog).findByText("slow-y.png · 320 × 120 px")).toBeInTheDocument();
    await finishReading("slow-x", { width: 999, height: 99 });
    await settle();
    expect(within(dialog).getByText("slow-y.png · 320 × 120 px")).toBeInTheDocument();
    expect(within(dialog).queryByText(/slow-x\.png/)).toBeNull();
    expect(revoked).toContain(urlOf("slow-x.png"));
    expect(revoked).not.toContain(urlOf("slow-y.png"));
    // The older read finishes first: still reading, nothing to confirm, until the newer one ends.
    await userEvent.upload(fileInput(dialog), png("slow-z.png"));
    await userEvent.upload(fileInput(dialog), png("slow-w.png"));
    await finishReading("slow-z");
    await settle();
    expect(within(dialog).getByText("Se citește imaginea…")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Confirmă sigla" })).toBeNull();
    await finishReading("slow-w");
    expect(await within(dialog).findByText("slow-w.png · 320 × 120 px")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmă sigla" }));
    await within(dialog).findByText("Modificarea a fost salvată.");
    expect(calls.map((call) => call.fileName)).toEqual(["slow-w.png"]);
    // Every temporary URL has been released once the logo is saved.
    expect(revoked).toEqual(expect.arrayContaining(objectUrls));
  });

  it("E · a valid file kept through a server error is the one sent again by „Reîncearcă”", async () => {
    scripted = [{ status: 503, body: { error: "storage_unavailable" } }];
    const dialog = await openLogoDialog();
    await userEvent.upload(fileInput(dialog), png("pastrat.png"));
    await within(dialog).findByText("pastrat.png · 320 × 120 px");
    await userEvent.click(within(dialog).getByRole("button", { name: "Confirmă sigla" }));
    expect(await within(dialog).findByText("Modificarea nu s-a salvat.")).toBeInTheDocument();
    expect(within(dialog).getByText("pastrat.png · 320 × 120 px")).toBeInTheDocument();
    expect(dialog.querySelector("[data-preview] img")).toHaveAttribute("src", urlOf("pastrat.png"));
    expect(revoked).not.toContain(urlOf("pastrat.png"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Reîncearcă" }));
    expect(await within(dialog).findByText("Modificarea a fost salvată.")).toBeInTheDocument();
    expect(calls.map((call) => [call.fileName, call.expectedRevision])).toEqual([["pastrat.png", "0"], ["pastrat.png", "0"]]);
    expect(revoked).toContain(urlOf("pastrat.png"));
  });

  it("F · the unsaved-changes guard follows the selection and the read, through closing and cancelling", async () => {
    const leaving = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const dialog = await openLogoDialog();
    expect(leaving()).toBe(false);
    await userEvent.upload(fileInput(dialog), png("slow-f.png"));
    await within(dialog).findByText("Se citește imaginea…");
    expect(leaving()).toBe(true); // a read in progress is unsaved work
    await finishReading("slow-f");
    await within(dialog).findByText("slow-f.png · 320 × 120 px");
    expect(leaving()).toBe(true);
    // Closing asks; „Continuă completarea” keeps the selection and the guard.
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide formularul" }));
    await within(dialog).findByText("Ai valori nesalvate");
    await userEvent.click(within(dialog).getByRole("button", { name: "Continuă completarea" }));
    expect(within(dialog).getByText("slow-f.png · 320 × 120 px")).toBeInTheDocument();
    expect(leaving()).toBe(true);
    // „Anulează” leaves nothing unsaved: the guard is released.
    await userEvent.click(within(dialog).getByRole("button", { name: "Anulează" }));
    expect(leaving()).toBe(false);
    // An invalid new choice also leaves nothing unsaved; closing then does not ask.
    await userEvent.upload(fileInput(dialog), png("g.png"));
    await within(dialog).findByText("g.png · 320 × 120 px");
    await userEvent.upload(fileInput(dialog), png("broken.png"));
    await within(dialog).findByRole("alert");
    expect(leaving()).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Închide formularul" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Sigla clientului" })).toBeNull());
    expect(revoked).toEqual(expect.arrayContaining(objectUrls));
    expect(calls).toEqual([]);
  });

  it("offers no logo action without the permission", async () => {
    canEdit = false;
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<ClientDetailPage customerId="cus-1" search="" />);
    await userEvent.click(await screen.findByRole("button", { name: "Alte acțiuni" }));
    const menu = await screen.findByRole("list", { name: "Alte acțiuni" });
    expect(within(menu).getByRole("button", { name: "Adaugă lucrare istorică" })).toBeInTheDocument();
    expect(within(menu).queryByRole("button", { name: "Sigla clientului" })).toBeNull();
  });
});
