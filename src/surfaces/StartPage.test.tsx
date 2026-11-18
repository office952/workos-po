import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { StartPage } from "./StartPage";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
});

type Row = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function entry(overrides: Row): Row {
  return {
    key: "job:1",
    level: "ATTENTION",
    objectKind: "JOB",
    objectKindLabel: "Lucrare",
    reference: null,
    reasonLabel: "Termen depășit",
    title: "Meadow Café SRL — Logo luminos „MEADOW”",
    detail: "Plan de execuție · termen țintă 14.11.2026",
    since: "2026-11-10T10:00:00.000Z",
    actionLabel: "Vezi operațiile",
    actionNote: "Fișa lucrării",
    target: { kind: "JOB", jobId: "ord:meadow", section: "OPERATIONS" },
    ...overrides,
  };
}

const approvalEntry = entry({
  key: "approval:1",
  level: "ACTION",
  objectKind: "PRICE_APPROVAL",
  objectKindLabel: "Aprobare de preț",
  reference: "CER-7AB1CD73",
  reasonLabel: "Așteaptă aprobarea Proprietarului",
  title: "Quartz Dental SRL — Casetă luminoasă ACM",
  detail: "Valoarea netă depășește limita fără aprobare. Solicitată de comercial@pilot-demo.test.",
  actionLabel: "Deschide solicitarea",
  actionNote: "Ofertare · numai rolul Proprietar",
  target: { kind: "PRICE_APPROVALS" },
});

const quoteEntry = entry({
  key: "quote:1",
  objectKind: "QUOTE",
  objectKindLabel: "Ofertă",
  reference: "OF-3B592B0E",
  reasonLabel: "Acceptată · fără comandă",
  title: "Nord Market SRL — Litere volumetrice „NORD MARKET”",
  detail: "Oferta este acceptată. Comanda nu este încă confirmată.",
  actionLabel: "Deschide oferta",
  actionNote: "4.820,00 EUR · pas permis rolului tău",
  target: { kind: "QUOTE", quoteKind: "PRODUCT", productCode: "PRD-L", quoteSnapshotId: "qts:PRD-L:abc" },
});

function watchEntry(index: number): Row {
  return entry({
    key: `job:watch:${index}`,
    level: "WATCH",
    reasonLabel: "Problemă semnalată",
    title: `Client ${index} SRL — Casetă ACM`,
    detail: "În lucru · 3 / 9 finalizate · o problemă raportată, încă nepreluată",
    actionLabel: "Urmărește producția",
    target: { kind: "JOB", jobId: `ord:watch:${index}`, section: "OPERATIONS" },
  });
}

function stage(id: string, label: string, overrides: Row = {}): Row {
  return {
    id,
    label,
    status: "READY",
    total: 3,
    unitLabel: "unități",
    segments: [{ id: "A", label: "În lucru", count: 3, tone: "progress" }],
    highlight: { label: "Nimic de semnalat", tone: "quiet" },
    emptyLabel: `Nicio ${label.toLowerCase()} încă`,
    emptyHint: "Apare după prima înregistrare.",
    target: { kind: id === "REQUESTS" ? "REQUESTS_REGISTER" : id === "QUOTES" ? "QUOTES_REGISTER" : "JOBS_REGISTER" },
    ...overrides,
  };
}

const READY_SOURCES = [
  { id: "REQUESTS", label: "Cererile", status: "READY" },
  { id: "QUOTES", label: "Ofertele", status: "READY" },
  { id: "JOBS", label: "Lucrările", status: "READY" },
  { id: "PRICE_APPROVALS", label: "Aprobările de preț", status: "READY" },
  { id: "SETUP", label: "Setările organizației", status: "READY" },
];

function startBody(overrides: Row = {}, entries: Row[] = []): { start: Row } {
  const count = (level: string) => entries.filter((item) => item.level === level).length;
  return {
    start: {
      readAt: "2026-11-17T06:42:00.000Z",
      sources: READY_SOURCES,
      attention: {
        entries,
        counts: { ACTION: count("ACTION"), ATTENTION: count("ATTENTION"), WATCH: count("WATCH") },
        incompleteLevels: [],
      },
      continueWork: {
        status: "READY",
        total: 1,
        items: [
          {
            requestId: "crq:1",
            reference: "CER-5F70F872",
            title: "Reclamă fațadă showroom",
            statusLabel: "Gata de ofertă",
            contextLabel: "Lumen Signs SRL · fără ofertă",
            nextActionLabel: "Alege produsul",
            target: { kind: "REQUEST_PRODUCT", requestId: "crq:1" },
          },
        ],
      },
      flow: [
        stage("REQUESTS", "Cereri", { total: 14, unitLabel: "cereri deschise" }),
        stage("QUOTES", "Oferte", { total: 8, unitLabel: "oferte active" }),
        stage("JOBS", "Lucrări", { total: 6, unitLabel: "lucrări active" }),
        stage("EXECUTION", "Execuție", { total: 33, unitLabel: "operații, în 3 lucrări în lucru" }),
      ],
      activity: "PRESENT",
      setup: { enabledProductCount: 2, canManage: true, optionalNotes: [] },
      canCreateRequest: true,
      ...overrides,
    },
  };
}

function stubStart(body: () => unknown, status: () => number = () => 200) {
  const fetchMock = vi.fn((input: RequestInfo) => {
    if (String(input).includes("/api/start")) return jsonResponse(body(), status());
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("StartPage", () => {
  it("names the step only the actor's role can take, and every row opens its real object", async () => {
    stubStart(() => startBody({}, [approvalEntry, quoteEntry, entry({}), watchEntry(1)]));
    render(<StartPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "O aprobare de preț cere acțiunea ta" })).toBeInTheDocument();
    expect(screen.getByText(/Două situații necesită atenție\. O lucrare cu probleme raportate este de urmărit\./)).toBeInTheDocument();
    expect(screen.getByText(/Date citite la/)).toBeInTheDocument();

    const action = screen.getByRole("region", { name: "Cer acțiunea ta" });
    expect(within(action).getByRole("link", { name: /Deschide solicitarea/ })).toHaveAttribute("href", "/admin/offering");
    expect(within(action).getByText("Ofertare · numai rolul Proprietar")).toBeInTheDocument();

    const attention = screen.getByRole("region", { name: "Necesită atenție" });
    expect(within(attention).getByRole("link", { name: /Deschide oferta/ })).toHaveAttribute(
      "href",
      "/oferte/produs/PRD-L/qts%3APRD-L%3Aabc",
    );
    expect(within(attention).getByRole("link", { name: /Vezi operațiile/ })).toHaveAttribute(
      "href",
      "/lucrari/ord%3Ameadow?sectiune=operatii",
    );
    // Permitted is not assigned: the accepted offer is not under "Cer acțiunea ta".
    expect(within(action).queryByText(/Nord Market/)).not.toBeInTheDocument();

    const watch = screen.getByRole("region", { name: "De urmărit" });
    expect(within(watch).getByRole("link", { name: /Client 1 SRL/ })).toHaveAttribute(
      "href",
      "/lucrari/ord%3Awatch%3A1?sectiune=operatii",
    );

    expect(screen.getByRole("link", { name: /Alege produsul: Reclamă fațadă showroom/ })).toHaveAttribute(
      "href",
      "/cereri/crq%3A1?alege-produs=1#alege-produs",
    );
    expect(screen.getByRole("link", { name: /Cereri: 14 cereri deschise/ })).toHaveAttribute("href", "/cereri");
    expect(screen.getByRole("link", { name: /Oferte: 8 oferte active/ })).toHaveAttribute("href", "/oferte");
    expect(screen.getByRole("link", { name: /Execuție: 33 operații/ })).toHaveAttribute("href", "/lucrari");
    expect(screen.queryByText(/DTO|API|org:|hash/i)).not.toBeInTheDocument();
  });

  it("says there is no personal intervention while still naming the reported problems", async () => {
    stubStart(() => startBody({}, [watchEntry(1)]));
    render(<StartPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Nu ai intervenții în așteptare" })).toBeInTheDocument();
    expect(screen.getByText("Nimic nu cere acțiunea ta. O lucrare cu probleme raportate este de urmărit.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Cer acțiunea ta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Necesită atenție" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "De urmărit" })).toBeInTheDocument();
    expect(screen.queryByText(/activitate normală|totul este în regulă/i)).not.toBeInTheDocument();
  });

  it("shows operational attention as attention, without inventing a blocker", async () => {
    stubStart(() =>
      startBody({}, [
        entry({ key: "job:machine", reasonLabel: "Utilajul alocat nu mai este eligibil", title: "Quartz Dental SRL — Casetă ACM „QUARTZ”" }),
      ]),
    );
    render(<StartPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "O lucrare necesită atenție" })).toBeInTheDocument();
    expect(screen.getByText("Utilajul alocat nu mai este eligibil")).toBeInTheDocument();
    expect(screen.queryByText(/blocaj|blocat/i)).not.toBeInTheDocument();
  });

  it("opens at most five rows and gives explicit access to the rest", async () => {
    const entries = [approvalEntry, quoteEntry, entry({}), ...[1, 2, 3, 4, 5].map(watchEntry)];
    stubStart(() => startBody({}, entries));
    render(<StartPage />);

    const watch = await screen.findByRole("region", { name: "De urmărit" });
    expect(within(watch).getAllByRole("link")).toHaveLength(2);
    expect(screen.getByText(/Sunt afișate 5 din 8 situații\./)).toBeInTheDocument();
    expect(within(watch).getByText("Încă 3 situații, mai noi.")).toBeInTheDocument();

    await userEvent.click(within(watch).getByRole("button", { name: "Arată și celelalte 3" }));
    expect(within(watch).getAllByRole("link")).toHaveLength(5);
    expect(screen.getByText(/Sunt afișate toate cele 8 situații\./)).toBeInTheDocument();
    expect(within(watch).queryByRole("button")).not.toBeInTheDocument();
  });

  it("starts a new organization from the first request and keeps optional settings optional", async () => {
    stubStart(() =>
      startBody(
        {
          activity: "NONE",
          continueWork: { status: "READY", total: 0, items: [] },
          setup: {
            enabledProductCount: 0,
            canManage: true,
            optionalNotes: ["Oameni, zone și utilaje (necesare doar pentru Atelier)"],
          },
          flow: [
            stage("REQUESTS", "Cereri", { total: 0, segments: [], emptyLabel: "Nicio cerere încă" }),
            stage("QUOTES", "Oferte", { total: 0, segments: [], emptyLabel: "Nicio ofertă încă" }),
            stage("JOBS", "Lucrări", { total: 0, segments: [], emptyLabel: "Nicio lucrare încă" }),
            stage("EXECUTION", "Execuție", { total: 0, segments: [], emptyLabel: "Nimic în execuție" }),
          ],
        },
        [],
      ),
    );
    render(<StartPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Începe cu prima cerere" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cerere nouă" })).toHaveAttribute("href", "/cereri/noua");
    expect(screen.getByRole("link", { name: "Deschide produsele oferite" })).toHaveAttribute("href", "/admin/products");
    expect(screen.getByText(/Opțional, nu împiedică lucrul: Oameni, zone și utilaje/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Setările organizației/ })).toHaveAttribute("href", "/admin");
    expect(screen.getByText("Nicio cerere încă")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /De continuat/ })).not.toBeInTheDocument();
    // An empty stage is described in words, not as a number.
    expect(document.querySelector(".start-stage__number")).toBeNull();
  });

  it("marks a failed source as unavailable instead of zero and offers recovery", async () => {
    const failing = { current: true };
    const fetchMock = stubStart(() =>
      failing.current
        ? startBody(
            {
              sources: READY_SOURCES.map((source) =>
                source.id === "QUOTES" ? { ...source, status: "UNAVAILABLE" } : source,
              ),
              attention: {
                entries: [entry({})],
                counts: { ACTION: 0, ATTENTION: 1, WATCH: 0 },
                incompleteLevels: ["ATTENTION"],
              },
              flow: [
                stage("REQUESTS", "Cereri", { total: 14, unitLabel: "cereri deschise" }),
                stage("QUOTES", "Oferte", { status: "UNAVAILABLE", total: 0, segments: [], highlight: null }),
              ],
            },
            [],
          )
        : startBody({}, [entry({})]),
    );
    render(<StartPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "O lucrare necesită atenție" })).toBeInTheDocument();
    expect(screen.getByText(/Citire parțială la/)).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Ofertele nu au putut fi citite.")).toBeInTheDocument();
    expect(screen.getByText("Indisponibil")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oferte: indisponibil. Deschide registrul." })).toBeInTheDocument();
    expect(screen.getByText(/„Necesită atenție” poate fi incomplet/)).toBeInTheDocument();
    // The payload carried a total of 0 for the failed stage; it must not be shown.
    expect(screen.queryByText("oferte active")).not.toBeInTheDocument();

    failing.current = false;
    await userEvent.click(within(alert).getByRole("button", { name: "Reîncarcă" }));
    expect(await screen.findByText(/Date citite la/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/start"))).toHaveLength(2);
  });

  it("shows loading, then a recoverable failure, without pretending the organization is empty", async () => {
    const status = { current: 500 };
    stubStart(() => (status.current === 200 ? startBody({}, []) : { error: "unavailable" }), () => status.current);
    render(<StartPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Se citesc datele organizației" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: "Datele nu au putut fi citite" })).toBeInTheDocument();
    expect(screen.queryByText(/Începe cu prima cerere|Nu ai intervenții/)).not.toBeInTheDocument();

    status.current = 200;
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Nu ai intervenții în așteptare" })).toBeInTheDocument();
  });

  it("keeps the last good reading when a refresh fails", async () => {
    const status = { current: 200 };
    stubStart(() => (status.current === 200 ? startBody({}, [approvalEntry]) : { error: "unavailable" }), () => status.current);
    render(<StartPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "O aprobare de preț cere acțiunea ta" })).toBeInTheDocument();
    status.current = 500;
    await userEvent.click(screen.getByRole("button", { name: "Reîncarcă" }));

    expect(await screen.findByText(/Datele nu au putut fi reîmprospătate/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "O aprobare de preț cere acțiunea ta" })).toBeInTheDocument();
    expect(screen.getByText(/Ultima citire la/)).toBeInTheDocument();
  });

  it("renders only what the role received: Producție has no offers and no request steps", async () => {
    stubStart(() =>
      startBody(
        {
          sources: READY_SOURCES.filter((source) => ["REQUESTS", "JOBS", "SETUP"].includes(source.id)),
          continueWork: null,
          canCreateRequest: false,
          flow: [
            stage("REQUESTS", "Cereri", { total: 14, unitLabel: "cereri deschise" }),
            stage("JOBS", "Lucrări", { total: 6, unitLabel: "lucrări active" }),
            stage("EXECUTION", "Execuție", { total: 33, unitLabel: "operații, în 3 lucrări în lucru" }),
          ],
        },
        [entry({})],
      ),
    );
    render(<StartPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "O lucrare necesită atenție" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /De continuat/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Oferte:/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").filter((item) => item.classList.contains("start-stage"))).toHaveLength(3);
  });

  it("refuses a malformed projection as a whole", async () => {
    stubStart(() => ({ start: { readAt: "2026-11-17T06:42:00.000Z", attention: { entries: [{ key: "x" }] } } }));
    render(<StartPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Datele nu au putut fi citite" })).toBeInTheDocument();
  });
});
