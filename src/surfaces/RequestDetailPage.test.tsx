import { render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { RequestDetailPage } from "./RequestDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

function requestDetail(overrides: Record<string, unknown> = {}) {
  return {
    request: {
      requestId: "req-1",
      title: "Litere vitrină",
      reference: "CRQ-104",
      description: "Față plexi",
      customerId: "cus-1",
      status: "READY_FOR_QUOTE",
      createdAt: "2026-09-01T10:00:00.000Z",
    },
    customerDisplayName: "Atelier Nord",
    statusLabel: "Gata de ofertă",
    commercialProgressLabel: null,
    nextAction: "CHOOSE_PRODUCT",
    nextActionLabel: "Alege produs",
    canUploadAttachments: true,
    linkedOffers: [],
    attachments: [],
    installationOffer: {
      capabilityId: "SITE_INSTALLATION",
      selected: false,
      label: "Montaj la locație",
      mode: null,
      orgConfigured: false,
      orgOfferMode: null,
      canSelectNew: false,
      canChangeSelection: false,
      canChangeMode: false,
      selectionLocked: false,
      showModeControl: false,
      availableModes: [],
      persistedSelectionPreserved: false,
      persistedModeIncompatible: false,
    },
    installationScope: null,
    installationFacts: null,
    canWriteInstallationFacts: false,
    canWriteInstallationPrice: false,
    ...overrides,
  };
}

function journey(partial: Record<string, unknown> = {}) {
  return {
    offerSummary: { count: 0, awaitingCustomer: 0, acceptedWithoutOrder: 0, ordered: 0, declined: 0, notPursued: 0, superseded: 0, undecided: 0, summaryLabel: "Fără ofertă" },
    actionable: [],
    waiting: [],
    actionableCount: 0,
    waitingCount: 0,
    orderCount: 0,
    nextAction: "OPEN_REQUEST",
    nextActionLabel: "Deschide cererea",
    nextActionHref: "/requests/req-1",
    needsAttention: false,
    attentionLabel: null,
    phase: "OPEN",
    phaseLabel: "Deschisă",
    phaseAt: null,
    administrativeNote: null,
    ...partial,
  };
}

function journeyItem(partial: Record<string, unknown> = {}) {
  return {
    kind: "CONFIRM_ORDER",
    key: "offer:q-1",
    quoteSnapshotId: "q-1",
    quoteKind: "PRODUCT",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    assemblyId: null,
    title: "Confirmarea comenzii",
    detail: "Litere · OF-1",
    hint: null,
    actionLabel: "Confirmă comanda",
    href: "/quotes/q-1",
    action: "OPEN_QUOTE",
    ...partial,
  };
}

async function chooseMore(label: string): Promise<void> {
  await userEvent.click(await screen.findByRole("button", { name: /Mai multe/ }));
  await userEvent.click(screen.getByRole("button", { name: label }));
}

function RoutedRequest({ requestId = "req-1" }: { requestId?: string }) {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const sync = () => setSearch(window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return <RequestDetailPage requestId={requestId} search={search} />;
}

async function selectBranch(name: RegExp): Promise<HTMLElement> {
  const list = await screen.findByRole("list", { name: "Ramuri comerciale" });
  await userEvent.click(within(list).getByRole("button", { name }));
  return screen.findByTestId("branch-detail");
}

function stubDetail(detail: unknown, extra?: (url: string, init?: RequestInit) => Response | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const extraResponse = extra?.(url, init);
      if (extraResponse) {
        return Promise.resolve(extraResponse);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ detail }),
      });
    }),
  );
}

describe("RequestDetailPage", () => {
  it("opened from the client page, offers the way back to that page and tab; after a direct link, the request list (N-018)", async () => {
    stubDetail(requestDetail());
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri");
    window.history.pushState({}, "", "/cereri/req-1");
    window.history.replaceState({ workosKey: "k", workosIndex: 1, workosFrom: "/clienti/cus-1?sectiune=cereri", workosFromIndex: 0 }, "", "/cereri/req-1");
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    const { unmount } = render(<RoutedRequest />);
    const back = await screen.findByRole("link", { name: "← Fișa clientului" });
    expect(back).toHaveAttribute("href", "/clienti/cus-1?sectiune=cereri");
    await userEvent.click(back);
    expect(go).toHaveBeenCalledWith(-1);
    unmount();
    go.mockRestore();
    window.history.replaceState({}, "", "/cereri/req-1");
    render(<RoutedRequest />);
    expect(await screen.findByRole("link", { name: "← Toate cererile" })).toHaveAttribute("href", "/cereri");
  });

  it("keeps request identity in the header and product continuation inside the request", async () => {
    stubDetail(requestDetail({ journey: journey({ phase: "NEW", phaseLabel: "Nouă", nextAction: "CHOOSE_PRODUCT", nextActionLabel: "Alege produsul" }) }));

    render(<RoutedRequest />);
    expect(await screen.findByRole("heading", { name: "Litere vitrină" })).toBeInTheDocument();
    expect(screen.getByText("Cerere · CRQ-104")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Atelier Nord" })).toHaveAttribute(
      "href",
      "/clienti/cus-1",
    );
    expect(screen.getByText(/Înregistrată/)).toBeInTheDocument();
    expect(screen.getByTestId("request-commercial-status")).toHaveTextContent("Nouă");
    expect(screen.getByTestId("request-obligations")).toHaveTextContent("Nimic de rezolvat acum");
    const empty = screen.getByTestId("request-branches-empty");
    expect(empty).toHaveTextContent("Cererea nu are încă oferte");
    expect(within(empty).queryByRole("link", { name: /Alege produsul/ })).not.toBeInTheDocument();
    expect(document.getElementById("branch-detail")).toBeNull();
    expect(screen.getByRole("heading", { name: "Ce dorește clientul" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Continuare" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cerere", level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nu adăuga montaj/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Montajul nu face parte/i)).not.toBeInTheDocument();
  });

  it("chooses a product for a reopened NEW undecided request using the server action", async () => {
    const detail = requestDetail({
      request: { ...requestDetail().request, requestId: "req-new", status: "NEW" },
      statusLabel: "Nouă",
      journey: journey({ phase: "REOPENED", phaseLabel: "Redeschisă", nextAction: "CHOOSE_PRODUCT", nextActionLabel: "Alege produsul" }),
    });
    stubDetail(detail, (url) => {
      if (url.endsWith("/product-catalog")) {
        return new Response(JSON.stringify({ tree: [{ kind: "product", code: "PRD-TEST", label: "Litere test" }] }), { status: 200 });
      }
      if (url.includes("/assemblies")) {
        return new Response(JSON.stringify({ canCreate: false, offerings: [], assemblies: [] }), { status: 200 });
      }
      return null;
    });
    render(<RequestDetailPage requestId="req-new" />);
    await screen.findByRole("heading", { name: "Alege produsul pentru această cerere" });
    expect(screen.queryAllByRole("link", { name: /Alege produsul/ }).length).toBeLessThanOrEqual(1);
    for (const link of screen.queryAllByRole("link", { name: /Alege produsul/ })) {
      expect(link).toHaveAttribute("href", "/cereri/req-new?alege-produs=1#alege-produs");
    }
    expect(screen.queryByText("Nicio acțiune disponibilă")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Litere test.*Configurează/ })).toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /Alege produsul/ })).toHaveLength(0);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    expect(window.location.pathname).toBe("/configurator");
    const params = new URLSearchParams(window.location.search);
    expect(params.get("request")).toBe("req-new");
    expect(params.get("customer")).toBe("cus-1");
    expect(params.get("product")).toBe("PRD-TEST");
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("lists the server's obligations apart from the customer's waiting, each opening its own offer", async () => {
    stubDetail(
      requestDetail({
        nextAction: "OPEN_QUOTE",
        linkedOffers: [
          { quoteSnapshotId: "q-1", productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06", reference: "OF-1", commercialStatus: "ACCEPTED_WITHOUT_ORDER", commercialStatusLabel: "Acceptată · fără comandă", obligationKind: "ACTIONABLE", followUp: true },
          { quoteSnapshotId: "q-2", productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06", reference: "OF-2", commercialStatus: "AWAITING_CUSTOMER", commercialStatusLabel: "Urmează acceptarea", obligationKind: "WAITING", followUp: true },
        ],
        journey: journey({
          nextAction: "OPEN_QUOTE",
          nextActionLabel: "Confirmă comanda",
          nextActionHref: "/quotes/q-1",
          needsAttention: true,
          actionable: [journeyItem()],
          waiting: [journeyItem({ kind: "AWAIT_CUSTOMER", key: "offer:q-2", quoteSnapshotId: "q-2", title: "Răspunsul clientului", detail: "Litere · OF-2", actionLabel: "Deschide oferta", href: "/quotes/q-2" })],
          actionableCount: 1,
          waitingCount: 1,
        }),
      }),
    );

    render(<RoutedRequest />);
    const panel = await screen.findByTestId("request-obligations");
    expect(panel).toHaveTextContent("De rezolvat · 1");
    expect(panel).toHaveTextContent("o acțiune a ta · una în așteptarea clientului");
    expect(within(screen.getByTestId("obligation-CONFIRM_ORDER")).getByRole("link", { name: /Confirmă comanda/ })).toHaveAttribute(
      "href",
      "/oferte/produs/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    );
    expect(within(screen.getByTestId("obligation-AWAIT_CUSTOMER")).getByRole("link", { name: /Deschide oferta/ })).toHaveAttribute(
      "href",
      "/oferte/produs/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-2",
    );
    const list = screen.getByRole("list", { name: "Ramuri comerciale" });
    expect(within(list).getByRole("link", { name: /Confirmarea comenzii/ })).toHaveAttribute("href", "/oferte/produs/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1");
    expect(screen.queryByRole("link", { name: /Alege produs/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /catalog/i })).not.toBeInTheDocument();
  });

  function assemblyWork(overrides: Record<string, unknown> = {}) {
    return {
      assemblyId: "asm:1",
      label: "Panou ACM + litere volumetrice",
      stage: "QUOTE_CREATED",
      stageLabel: "Ofertă creată",
      quoteSnapshotId: "asmq:1",
      quoteGrossPrice: 766.34,
      currency: "EUR",
      orderSnapshotId: null,
      productionSnapshotId: null,
      executionPlanId: null,
      revisionPending: false,
      membersEditable: true,
      ...overrides,
    };
  }

  it("after an assembly quote, continues the assembly instead of offering a product choice", async () => {
    stubDetail(
      requestDetail({
        request: { ...requestDetail().request, status: "NEW" },
        statusLabel: "Nouă",
        nextAction: "OPEN_ASSEMBLY",
        nextActionLabel: "Deschide ansamblul",
        commercialProgressLabel: "Ofertă creată",
        linkedAssemblyId: "asm:1",
        assemblies: [assemblyWork()],
        journey: journey({ nextAction: "OPEN_ASSEMBLY", nextActionLabel: "Deschide ansamblul", nextActionHref: "/assemblies/asm%3A1" }),
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByText("766,34 EUR")).toBeInTheDocument();
    const panel = await selectBranch(/Panou ACM/);
    expect(within(panel).getByRole("link", { name: /Deschide oferta comună/ })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3A1");
    for (const link of within(panel).getAllByRole("link", { name: /ansamblul/i })) {
      expect(link).toHaveAttribute("href", "/ansamblu?assembly=asm%3A1");
    }
    expect(screen.queryByRole("link", { name: "Alege produs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Alege produsul pentru această cerere" })).not.toBeInTheDocument();
    expect(screen.queryByText("Adaugă altă lucrare la această cerere")).not.toBeInTheDocument();
  });

  it("after the assembly order and production release, links the order and keeps members consult-only", async () => {
    stubDetail(
      requestDetail({
        request: { ...requestDetail().request, status: "NEW" },
        statusLabel: "Nouă",
        nextAction: "OPEN_ASSEMBLY",
        nextActionLabel: "Deschide ansamblul",
        commercialProgressLabel: "Comandă creată",
        linkedAssemblyId: "asm:1",
        canStartAdditionalWork: true,
        assemblies: [
          assemblyWork({
            stage: "PRODUCTION_RELEASED",
            stageLabel: "Eliberat în producție",
            orderSnapshotId: "asmo:1",
            productionSnapshotId: "asmp:1",
            executionPlanId: "plan:1",
            membersEditable: false,
          }),
        ],
        journey: journey({ administrativeNote: "Administrativ: nouă", orderCount: 1 }),
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByTestId("request-administrative-status")).toHaveTextContent("Administrativ: nouă");
    expect(screen.getByTestId("request-commercial-status")).toHaveTextContent("Deschisă");
    const panel = await selectBranch(/Panou ACM/);
    expect(within(panel).getByRole("link", { name: /Deschide fișa lucrării/ })).toHaveAttribute("href", "/lucrari/asmo%3A1");
    expect(within(panel).getByRole("link", { name: "Deschide în Atelier" })).toHaveAttribute("href", expect.stringContaining("plan%3A1"));
    expect(within(panel).getByText(/doar consultare \(comandă acceptată\)/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Deschide comanda");
    expect(screen.queryByRole("heading", { name: "Alege produsul pentru această cerere" })).not.toBeInTheDocument();
    expect(screen.getByText("Adaugă altă lucrare la această cerere")).toBeInTheDocument();
  });

  it("lists product and assembly offers together, keeps the historical version and opens each by kind", async () => {
    stubDetail(
      requestDetail({
        request: { ...requestDetail().request, status: "NEW" },
        statusLabel: "Nouă",
        nextAction: "OPEN_ASSEMBLY",
        nextActionLabel: "Deschide ansamblul",
        commercialProgressLabel: "Comandă creată",
        linkedAssemblyId: "asm:1",
        linkedOffers: [
          {
            quoteSnapshotId: "q-1",
            kind: "PRODUCT",
            kindLabel: "Produs",
            productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
            productLabel: "Litere volumetrice",
            reference: "OF-1",
            stageLabel: "Creată",
            superseded: false,
            attentionLabel: "Urmează acceptarea",
            orderSnapshotId: null,
          },
          {
            quoteSnapshotId: "asmq:new",
            kind: "ASSEMBLY",
            kindLabel: "Ansamblu",
            assemblyId: "asm:1",
            productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
            productLabel: "Panou ACM + litere volumetrice",
            reference: "OF-NOU",
            stageLabel: "Cu comandă",
            superseded: false,
            attentionLabel: null,
            orderSnapshotId: "asmo:1",
          },
          {
            quoteSnapshotId: "asmq:old",
            kind: "ASSEMBLY",
            kindLabel: "Ansamblu",
            assemblyId: "asm:1",
            productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
            productLabel: "Panou ACM + litere volumetrice",
            reference: "OF-VECHI",
            stageLabel: "Creată",
            superseded: true,
            attentionLabel: "Înlocuită de o versiune mai nouă",
            orderSnapshotId: null,
          },
        ],
        assemblies: [
          assemblyWork({
            stage: "ORDER_CREATED",
            stageLabel: "Comandă creată",
            quoteSnapshotId: "asmq:new",
            orderSnapshotId: "asmo:1",
            membersEditable: false,
          }),
        ],
      }),
    );

    render(<RoutedRequest />);
    const list = await screen.findByRole("list", { name: "Ramuri comerciale" });
    expect(within(list).getAllByRole("button")).toHaveLength(2);
    const assemblyPanel = await selectBranch(/Panou ACM/);
    expect(within(assemblyPanel).getByRole("link", { name: /Deschide fișa lucrării/ })).toHaveAttribute("href", "/lucrari/asmo%3A1");
    expect(within(assemblyPanel).getByRole("link", { name: "Deschide oferta OF-NOU" })).toHaveAttribute(
      "href",
      "/oferte/ansamblu/asmq%3Anew",
    );
    expect(within(assemblyPanel).getByText(/Ofertă anterioară · OF-VECHI/)).toBeInTheDocument();
    const productPanel = await selectBranch(/Litere volumetrice/);
    expect(within(productPanel).getByRole("link", { name: /Deschide oferta OF-1/ })).toHaveAttribute(
      "href",
      "/oferte/produs/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    );
    expect(document.querySelectorAll('a[href^="/oferte/produs/SIGN_ASSEMBLY"]')).toHaveLength(0);
    expect(document.body.textContent).not.toContain("asmq:");
  });

  it("keeps the linked offers panel absent when the request has no quotes", async () => {
    stubDetail(requestDetail({ linkedOffers: [] }));
    render(<RoutedRequest />);
    expect(await screen.findByRole("heading", { name: "Litere vitrină" })).toBeInTheDocument();
    expect(screen.getByText("Cerere · CRQ-104")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Oferte legate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Ramuri comerciale" })).not.toBeInTheDocument();
    expect(screen.getByTestId("request-branches-empty")).toHaveTextContent("Cererea nu are încă oferte");
  });

  it("does not invent an obligation, a phase or a product choice when the server sent no journey", async () => {
    stubDetail(
      requestDetail({
        nextAction: "CHOOSE_PRODUCT",
        status: "READY_FOR_QUOTE",
        statusLabel: "Gata de ofertă",
        linkedOffers: [
          {
            quoteSnapshotId: "q-1",
            productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
            reference: "OF-1",
          },
        ],
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByRole("heading", { name: "Litere vitrină" })).toBeInTheDocument();
    expect(screen.queryByTestId("request-obligations")).not.toBeInTheDocument();
    expect(screen.queryByTestId("request-commercial-status")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Alege produs/ })).not.toBeInTheDocument();
    const panel = await selectBranch(/OF-1/);
    expect(within(panel).getByRole("link", { name: /Deschide oferta OF-1/ })).toBeInTheDocument();
  });

  it("offers no product choice on an empty request unless the journey names it", async () => {
    stubDetail(requestDetail({ linkedOffers: [], journey: journey() }));

    render(<RoutedRequest />);
    expect(await screen.findByRole("heading", { name: "Litere vitrină" })).toBeInTheDocument();
    expect(screen.getByTestId("request-branches-empty")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Alege produs/ })).not.toBeInTheDocument();
  });

  it("shows the empty attachments state and hides upload when forbidden", async () => {
    stubDetail(
      requestDetail({
        canUploadAttachments: false,
        attachments: [],
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByText("Nu există fișiere atașate.")).toBeInTheDocument();
    expect(screen.getByText("Încărcarea nu este permisă pe această cerere.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Alege fișier")).not.toBeInTheDocument();
  });

  it("lists attachments and keeps the server download href", async () => {
    stubDetail(
      requestDetail({
        attachments: [
          {
            attachmentId: "att-1",
            originalFileName: "brief.pdf",
            sizeLabel: "2.0 KB",
            createdAt: "2026-09-01T10:00:00.000Z",
            downloadHref: "/api/requests/req-1/attachments/att-1/download",
          },
        ],
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByRole("link", { name: "brief.pdf" })).toHaveAttribute(
      "href",
      "/api/requests/req-1/attachments/att-1/download",
    );
  });

  it("uploads when the server allows it", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/attachments") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            detail: requestDetail({
              attachments: [
                {
                  attachmentId: "att-2",
                  originalFileName: "nou.pdf",
                  sizeLabel: "1 KB",
                  createdAt: "2026-09-01T11:00:00.000Z",
                  downloadHref: "/api/requests/req-1/attachments/att-2/download",
                },
              ],
            }),
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ detail: requestDetail() }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["x"], "nou.pdf", { type: "application/pdf" });
    render(<RoutedRequest />);
    const input = await screen.findByLabelText("Alege fișier");
    await userEvent.setup().upload(input, file);
    expect(screen.getByText("nou.pdf")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Încarcă" }));
    expect(await screen.findByRole("link", { name: "nou.pdf" })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]).endsWith("/attachments") && call[1]?.method === "POST",
      ),
    ).toBe(true);
  });

  it("presents Romanian file-picker labels instead of native browser copy", async () => {
    stubDetail(requestDetail({ canUploadAttachments: true, attachments: [] }));

    render(<RoutedRequest />);
    expect(await screen.findByLabelText("Alege fișier")).toBeInTheDocument();
    expect(screen.getByText("Niciun fișier selectat")).toBeInTheDocument();
    expect(screen.queryByText(/Choose File/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No file chosen/i)).not.toBeInTheDocument();
  });

  it("shows selected installation facts as editable and frozen when locked", async () => {
    stubDetail(
      requestDetail({
        installationOffer: {
          selected: true,
          label: "Montaj la locație",
          mode: "INTERNAL",
          selectionLocked: true,
        },
        installationScope: {
          label: "Montaj la locație",
          incompleteReasons: [{ id: "SITE_ADDRESS_INCOMPLETE", label: "Adresa locului de execuție este incompletă." }],
        },
        installationFacts: {
          version: 1,
          siteName: "Sediu Nord",
          street: "Str. Fabricii 1",
          city: "Cluj",
          county: null,
          postalCode: null,
          contactName: "Ana",
          contactPhone: "0722",
          accessNotes: null,
          measurementStatus: "UNCONFIRMED",
          mountingSurfaceWidthMm: null,
          mountingSurfaceHeightMm: null,
          installationElevationMm: null,
          facadeType: "UNCONFIRMED",
          fixingMethod: "UNCONFIRMED",
          siteElectrical: "UNCONFIRMED",
          crewSize: null,
          plannedDurationHours: null,
        },
        canWriteInstallationFacts: false,
    canWriteInstallationPrice: false,
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByText("Montaj la locație")).toBeInTheDocument();
    expect(screen.getByText("Sediu Nord")).toBeInTheDocument();
    expect(screen.getByText("Datele de montaj nu mai pot fi editate.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvează datele de montaj" })).not.toBeInTheDocument();
  });

  it("lets permitted installation facts be edited", async () => {
    stubDetail(
      requestDetail({
        installationOffer: selectableOffer({
          selected: true,
          mode: "INTERNAL",
          canSelectNew: true,
          canChangeSelection: true,
          canChangeMode: false,
          showModeControl: false,
          availableModes: ["INTERNAL"],
        }),
        canWriteInstallationFacts: true,
    canWriteInstallationPrice: false,
        installationFacts: null,
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByRole("button", { name: "Salvează datele de montaj" })).toBeEnabled();
    expect(screen.getByLabelText("Stradă")).toBeInTheDocument();
  });

  it("does not offer add installation when the service is unconfigured", async () => {
    stubDetail(requestDetail());

    render(<RoutedRequest />);
    expect(
      await screen.findByText("Montajul la locație nu este selectat pe această cerere."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă montaj" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mod montaj")).not.toBeInTheDocument();
  });

  it("selects installation with a single available mode", async () => {
    const selectedDetail = requestDetail({
      installationOffer: selectableOffer({
        selected: true,
        mode: "INTERNAL",
        canChangeMode: false,
        showModeControl: false,
        availableModes: ["INTERNAL"],
      }),
      canWriteInstallationFacts: true,
    canWriteInstallationPrice: false,
    });
    const fetchMock = stubOfferMutation(requestDetail({
      installationOffer: selectableOffer({
        selected: false,
        canChangeMode: false,
        showModeControl: false,
        availableModes: ["INTERNAL"],
      }),
    }), selectedDetail);

    render(<RoutedRequest />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Adaugă montaj" }));
    expect(await screen.findByRole("button", { name: "Salvează datele de montaj" })).toBeEnabled();
    expect(readPatchBodies(fetchMock)).toEqual([
      { optionalScopeIds: ["SITE_INSTALLATION"] },
    ]);
  });

  it("sends the server-projected mode when multiple modes are offered", async () => {
    const fetchMock = stubOfferMutation(
      requestDetail({
        installationOffer: selectableOffer({
          selected: false,
          canChangeMode: false,
          showModeControl: true,
          availableModes: ["INTERNAL", "SUBCONTRACTED"],
        }),
      }),
      requestDetail({
        installationOffer: selectableOffer({
          selected: true,
          mode: "SUBCONTRACTED",
          canChangeMode: true,
          showModeControl: true,
          availableModes: ["INTERNAL", "SUBCONTRACTED"],
        }),
        canWriteInstallationFacts: true,
    canWriteInstallationPrice: false,
      }),
    );

    render(<RoutedRequest />);
    await userEvent.setup().selectOptions(await screen.findByLabelText("Mod montaj"), "SUBCONTRACTED");
    await userEvent.setup().click(screen.getByRole("button", { name: "Adaugă montaj" }));
    expect((await screen.findAllByText("Subcontractat")).length).toBeGreaterThan(0);
    expect(readPatchBodies(fetchMock)).toEqual([
      {
        optionalScopeIds: ["SITE_INSTALLATION"],
        siteInstallationMode: "SUBCONTRACTED",
      },
    ]);
  });

  it("changes mode only among availableModes when canChangeMode", async () => {
    const fetchMock = stubOfferMutation(
      requestDetail({
        installationOffer: selectableOffer({
          selected: true,
          mode: "INTERNAL",
          canChangeMode: true,
          showModeControl: true,
          availableModes: ["INTERNAL", "SUBCONTRACTED"],
        }),
        canWriteInstallationFacts: true,
    canWriteInstallationPrice: false,
      }),
      requestDetail({
        installationOffer: selectableOffer({
          selected: true,
          mode: "SUBCONTRACTED",
          canChangeMode: true,
          showModeControl: true,
          availableModes: ["INTERNAL", "SUBCONTRACTED"],
        }),
        canWriteInstallationFacts: true,
    canWriteInstallationPrice: false,
      }),
    );

    render(<RoutedRequest />);
    await userEvent.setup().selectOptions(await screen.findByLabelText("Mod montaj"), "SUBCONTRACTED");
    expect(readPatchBodies(fetchMock)).toEqual([{ siteInstallationMode: "SUBCONTRACTED" }]);
    expect(screen.queryByRole("option", { name: "Dezactivat" })).not.toBeInTheDocument();
  });

  it("does not expose mode mutation when canChangeMode is false", async () => {
    stubDetail(
      requestDetail({
        installationOffer: selectableOffer({
          selected: true,
          mode: "INTERNAL",
          canChangeMode: false,
          showModeControl: false,
          availableModes: ["INTERNAL"],
        }),
        canWriteInstallationFacts: true,
    canWriteInstallationPrice: false,
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByText("Echipă internă")).toBeInTheDocument();
    expect(screen.queryByLabelText("Mod montaj")).not.toBeInTheDocument();
  });

  it("deselects installation without facts immediately", async () => {
    const fetchMock = stubOfferMutation(
      requestDetail({
        installationOffer: selectableOffer({
          selected: true,
          mode: "INTERNAL",
          availableModes: ["INTERNAL"],
        }),
        canWriteInstallationFacts: true,
    canWriteInstallationPrice: false,
      }),
      requestDetail({
        installationOffer: selectableOffer({
          selected: false,
          availableModes: ["INTERNAL"],
        }),
      }),
    );

    render(<RoutedRequest />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Elimină montaj" }));
    expect(
      await screen.findByText("Montajul la locație nu este selectat pe această cerere."),
    ).toBeInTheDocument();
    expect(readPatchBodies(fetchMock)).toEqual([{ optionalScopeIds: [] }]);
    expect(screen.queryByText("Datele de montaj vor fi șterse")).not.toBeInTheDocument();
  });

  it("requires confirmation before deleting persisted installation facts", async () => {
    const fetchMock = stubOfferMutation(
      requestDetail({
        installationOffer: selectableOffer({
          selected: true,
          mode: "INTERNAL",
          availableModes: ["INTERNAL"],
        }),
        canWriteInstallationFacts: true,
    canWriteInstallationPrice: false,
        installationFacts: {
          version: 1,
          siteName: "Sediu Nord",
          street: "Str. Fabricii 1",
          city: "Cluj",
          county: null,
          postalCode: null,
          contactName: "Ana",
          contactPhone: "0722",
          accessNotes: null,
          measurementStatus: "UNCONFIRMED",
          mountingSurfaceWidthMm: null,
          mountingSurfaceHeightMm: null,
          installationElevationMm: null,
          facadeType: "UNCONFIRMED",
          fixingMethod: "UNCONFIRMED",
          siteElectrical: "UNCONFIRMED",
          crewSize: null,
          plannedDurationHours: null,
        },
      }),
      requestDetail({
        installationOffer: selectableOffer({
          selected: false,
          availableModes: ["INTERNAL"],
        }),
      }),
    );

    render(<RoutedRequest />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Elimină montaj" }));
    expect(await screen.findByText("Datele de montaj vor fi șterse")).toBeInTheDocument();
    expect(readPatchBodies(fetchMock)).toEqual([]);
    await userEvent.setup().click(
      screen.getByRole("button", { name: "Șterge datele și elimină montajul" }),
    );
    expect(
      await screen.findByText("Montajul la locație nu este selectat pe această cerere."),
    ).toBeInTheDocument();
    expect(readPatchBodies(fetchMock)).toEqual([
      { optionalScopeIds: [], confirmDeleteInstallationFacts: true },
    ]);
  });

  it("keeps locked installation read-only", async () => {
    stubDetail(
      requestDetail({
        installationOffer: selectableOffer({
          selected: true,
          mode: "INTERNAL",
          canSelectNew: false,
          canChangeSelection: false,
          canChangeMode: false,
          selectionLocked: true,
          showModeControl: false,
          availableModes: ["INTERNAL"],
        }),
        canWriteInstallationFacts: false,
    canWriteInstallationPrice: false,
        installationFacts: {
          version: 1,
          siteName: "Sediu Nord",
          street: "Str. Fabricii 1",
          city: "Cluj",
          county: null,
          postalCode: null,
          contactName: "Ana",
          contactPhone: "0722",
          accessNotes: null,
          measurementStatus: "UNCONFIRMED",
          mountingSurfaceWidthMm: null,
          mountingSurfaceHeightMm: null,
          installationElevationMm: null,
          facadeType: "UNCONFIRMED",
          fixingMethod: "UNCONFIRMED",
          siteElectrical: "UNCONFIRMED",
          crewSize: null,
          plannedDurationHours: null,
        },
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByText("Selecția de montaj nu mai poate fi modificată.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă montaj" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Elimină montaj" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mod montaj")).not.toBeInTheDocument();
  });

  it("keeps a persisted selection visible when new selection is no longer offered", async () => {
    stubDetail(
      requestDetail({
        installationOffer: {
          capabilityId: "SITE_INSTALLATION",
          selected: true,
          label: "Montaj la locație",
          mode: "INTERNAL",
          orgConfigured: false,
          orgOfferMode: null,
          canSelectNew: false,
          canChangeSelection: true,
          canChangeMode: false,
          selectionLocked: false,
          showModeControl: false,
          availableModes: [],
          persistedSelectionPreserved: true,
          persistedModeIncompatible: false,
        },
        canWriteInstallationFacts: true,
    canWriteInstallationPrice: false,
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByText("Montajul păstrat pe cerere rămâne vizibil.")).toBeInTheDocument();
    expect(screen.getAllByText("Montaj la locație").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Adaugă montaj" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimină montaj" })).toBeEnabled();
  });

  it("saves a populated facade other note and hides it for a normal facade", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFactsSave(editableInstallationDetail({
      facadeType: "OTHER",
      facadeOtherNote: "Panou compozit existent pe structură metalică",
    }));

    render(<RoutedRequest />);
    expect(await screen.findByLabelText("Tip suprafață — detalii")).toHaveValue(
      "Panou compozit existent pe structură metalică",
    );
    await user.click(screen.getByRole("button", { name: "Salvează datele de montaj" }));
    await waitFor(() => expect(readFactsPatches(fetchMock)).toHaveLength(1));
    expect(readFactsPatches(fetchMock)[0]).toMatchObject({
      facadeType: "OTHER",
      facadeOtherNote: "Panou compozit existent pe structură metalică",
      fixingOtherNote: null,
    });

    await user.selectOptions(screen.getByLabelText("Fațadă"), "CONCRETE");
    expect(screen.queryByLabelText("Tip suprafață — detalii")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvează datele de montaj" }));
    await waitFor(() => expect(readFactsPatches(fetchMock)).toHaveLength(2));
    expect(readFactsPatches(fetchMock)[1]).toMatchObject({
      facadeType: "CONCRETE",
      facadeOtherNote: null,
      fixingMethod: "MECHANICAL_ANCHOR",
      fixingOtherNote: null,
    });
  });

  it("saves a populated fixing other note", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFactsSave(editableInstallationDetail({
      fixingMethod: "OTHER",
      fixingOtherNote: "Bride speciale existente",
    }));

    render(<RoutedRequest />);
    expect(await screen.findByLabelText("Metodă de fixare — detalii")).toHaveValue(
      "Bride speciale existente",
    );
    await user.click(screen.getByRole("button", { name: "Salvează datele de montaj" }));
    await waitFor(() => expect(readFactsPatches(fetchMock)).toHaveLength(1));
    expect(readFactsPatches(fetchMock)[0]).toMatchObject({
      fixingMethod: "OTHER",
      fixingOtherNote: "Bride speciale existente",
    });
  });

  it("explains a missing other-option detail instead of a generic save failure", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFactsSave(editableInstallationDetail());

    render(<RoutedRequest />);
    await user.selectOptions(await screen.findByLabelText("Fațadă"), "OTHER");
    await user.click(screen.getByRole("button", { name: "Salvează datele de montaj" }));
    expect(screen.getAllByText("Completează detaliile pentru opțiunea „Altul”.").length).toBeGreaterThan(0);
    expect(screen.queryByText("Datele de montaj nu au putut fi salvate.")).not.toBeInTheDocument();
    expect(readFactsPatches(fetchMock)).toHaveLength(0);
  });

  it("shows crew only for internal installation and omits it after subcontracting", async () => {
    const user = userEvent.setup();
    const fetchMock = stubFactsSave(
      editableInstallationDetail({
        canChangeMode: true,
        availableModes: ["INTERNAL", "SUBCONTRACTED"],
        crewSize: 2,
        plannedDurationHours: 3,
      }),
      editableInstallationDetail({
        mode: "SUBCONTRACTED",
        canChangeMode: true,
        availableModes: ["INTERNAL", "SUBCONTRACTED"],
        crewSize: 2,
        plannedDurationHours: 3,
      }),
    );

    render(<RoutedRequest />);
    expect(await screen.findByLabelText("Echipă")).toHaveValue("2");
    expect(screen.getByLabelText("Durată planificată (ore)")).toHaveValue("3");
    await user.selectOptions(screen.getByLabelText("Mod montaj"), "SUBCONTRACTED");
    await waitFor(() => expect(screen.queryByLabelText("Echipă")).not.toBeInTheDocument());
    expect(screen.queryByLabelText("Durată planificată (ore)")).not.toBeInTheDocument();
    expect(screen.getAllByText("Subcontractat").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Salvează datele de montaj" }));
    await waitFor(() => expect(readFactsPatches(fetchMock)).toHaveLength(1));
    const body = readFactsPatches(fetchMock)[0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("crewSize");
    expect(body).not.toHaveProperty("plannedDurationHours");
  });
});

function selectableOffer(overrides: Record<string, unknown> = {}) {
  return {
    capabilityId: "SITE_INSTALLATION",
    selected: false,
    label: "Montaj la locație",
    mode: null,
    orgConfigured: true,
    orgOfferMode: "INTERNAL",
    canSelectNew: true,
    canChangeSelection: true,
    canChangeMode: false,
    selectionLocked: false,
    showModeControl: false,
    availableModes: ["INTERNAL"],
    persistedSelectionPreserved: false,
    persistedModeIncompatible: false,
    ...overrides,
  };
}

function readPatchBodies(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(
      (call) =>
        String(call[0]).endsWith("/api/requests/req-1") && call[1]?.method === "PATCH",
    )
    .map((call) => JSON.parse(String(call[1]?.body ?? "{}")));
}

function editableInstallationDetail(overrides: Record<string, unknown> = {}) {
  const mode = overrides.mode;
  const canChangeMode = overrides.canChangeMode;
  const availableModes = overrides.availableModes;
  const facts = { ...overrides };
  delete facts.mode;
  delete facts.canChangeMode;
  delete facts.availableModes;
  return requestDetail({
    installationOffer: selectableOffer({
      selected: true,
      mode: mode ?? "INTERNAL",
      canChangeMode: canChangeMode ?? false,
      showModeControl: false,
      availableModes: availableModes ?? ["INTERNAL"],
    }),
    canWriteInstallationFacts: true,
    installationFacts: {
      version: 1,
      siteName: null,
      street: "Strada Sintetică 1",
      city: "Oraș Sintetic",
      county: null,
      postalCode: null,
      contactName: null,
      contactPhone: null,
      accessNotes: null,
      measurementStatus: "CUSTOMER_PROVIDED",
      mountingSurfaceWidthMm: null,
      mountingSurfaceHeightMm: null,
      installationElevationMm: null,
      facadeType: "CONCRETE",
      facadeOtherNote: null,
      fixingMethod: "MECHANICAL_ANCHOR",
      fixingOtherNote: null,
      siteElectrical: "EXCLUDED_CUSTOMER_RESPONSIBILITY",
      crewSize: 2,
      plannedDurationHours: 3,
      ...facts,
    },
  });
}

function readFactsPatches(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  return fetchMock.mock.calls
    .filter(
      (call) => String(call[0]).includes("/installation-facts") && call[1]?.method === "PATCH",
    )
    .map((call) => JSON.parse(String(call[1]?.body ?? "{}")));
}

function stubFactsSave(initial: unknown, afterModeChange?: unknown) {
  let current = initial;
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (
      url.endsWith("/api/requests/req-1") &&
      init?.method === "PATCH" &&
      afterModeChange
    ) {
      current = afterModeChange;
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ detail: current }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubOfferMutation(initial: unknown, next: unknown) {
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/requests/req-1") && init?.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request: { requestId: "req-1" }, detail: next }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ detail: initial }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("N-018 · offer preview over the request", () => {
    const offer = (id: string, reference: string) => ({ quoteSnapshotId: id, kind: "PRODUCT", kindLabel: "Produs", productCode: "PRD-TEST", productLabel: "Litere test", reference, stageLabel: "Creată", superseded: false, attentionLabel: null, orderSnapshotId: null });
    const envelope = (id: string, reference: string) => ({ quote: { quoteSnapshotId: id, kind: "PRODUCT", kindLabel: "Produs", productCode: "PRD-TEST", productLabel: "Litere test", reference, inscription: "", stage: "QUOTE_CREATED", stageLabel: "Creată", nextAction: "ACCEPT_QUOTE", nextActionLabel: "Acceptă oferta", needsAttention: false, attentionLabel: null, superseded: false, sectionCount: 1, grossDisplay: null, currency: "EUR", customerDisplayName: "Atelier Nord", requestId: "req-1", requestReference: "CRQ-104", orderSnapshotId: null, assemblyId: null, createdAt: null } });

    function Harness() {
      const [search, setSearch] = useState(window.location.search);
      useEffect(() => {
        const sync = () => setSearch(window.location.search);
        window.addEventListener("popstate", sync);
        return () => window.removeEventListener("popstate", sync);
      }, []);
      return <RequestDetailPage requestId="req-1" search={search} />;
    }

    function serve() {
      stubDetail(requestDetail({ linkedOffers: [offer("q-1", "OF-1"), offer("q-2", "OF-2")] }), (url) => {
        if (url.endsWith("/api/quotes/q-1")) return new Response(JSON.stringify(envelope("q-1", "OF-1")), { status: 200 });
        if (url.endsWith("/api/quotes/q-2")) return new Response(JSON.stringify(envelope("q-2", "OF-2")), { status: 200 });
        return null;
      });
    }

    it("pushes the first preview, replaces on the next offer and closes back with focus on the opener", async () => {
      serve();
      window.history.replaceState({}, "", "/cereri/req-1");
      render(<Harness />);
      const panel = await selectBranch(/OF-1/);
      const opener = within(panel).getByRole("button", { name: "Previzualizează oferta OF-1" });
      const depth = window.history.length;
      await userEvent.click(opener);
      expect(new URLSearchParams(window.location.search).get("oferta")).toBe("q-1");
      expect(new URLSearchParams(window.location.search).get("ramura")).toBe("quote:q-1");
      expect(window.history.length).toBe(depth + 1);
      const dossier = await screen.findByRole("complementary", { name: "Dosarul ofertei" });
      expect(await within(dossier).findByText("1 din 2")).toBeInTheDocument();
      await userEvent.click(within(dossier).getByRole("button", { name: /următoare/i }));
      expect(new URLSearchParams(window.location.search).get("oferta")).toBe("q-2");
      expect(window.history.length).toBe(depth + 1);
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(window.location.search).toBe("?ramura=quote%3Aq-1"));
      expect(window.location.pathname).toBe("/cereri/req-1");
      await waitFor(() => expect(screen.queryByRole("complementary", { name: "Dosarul ofertei" })).toBeNull());
      await waitFor(() => expect(screen.getByRole("button", { name: "Previzualizează oferta OF-1" })).toHaveFocus());
    });

    it("opens from a direct link and closes by replacing, staying on the request", async () => {
      serve();
      window.history.replaceState({}, "", "/cereri/req-1?oferta=q-2");
      render(<Harness />);
      const dossier = await screen.findByRole("complementary", { name: "Dosarul ofertei" });
      const depth = window.history.length;
      await userEvent.click(within(dossier).getByRole("button", { name: /Închide dosarul|Registru/ }));
      expect(window.location.pathname).toBe("/cereri/req-1");
      expect(window.location.search).toBe("");
      expect(window.history.length).toBe(depth);
    });
  });
describe("N-030 · ramuri comerciale", () => {
    it("keeps two offers of the same product as two branches and selects none until the operator does", async () => {
      stubDetail(requestDetail({ nextAction: "OPEN_QUOTE", nextActionLabel: "Deschide oferta", linkedOffers: [
        { quoteSnapshotId: "q-1", productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06", productLabel: "Litere volumetrice", reference: "OF-1" },
        { quoteSnapshotId: "q-2", productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06", productLabel: "Litere volumetrice", reference: "OF-2" },
      ] }));
      render(<RoutedRequest />);
      const list = await screen.findByRole("list", { name: "Ramuri comerciale" });
      const rows = [...list.querySelectorAll<HTMLElement>(":scope > li")];
      expect(rows).toHaveLength(2);
      expect(rows.some((row) => row.hasAttribute("data-selected"))).toBe(false);
      expect(document.getElementById("branch-detail")).toBeNull();
      expect(screen.queryByText("Nicio ramură selectată")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Ce dorește clientul" })).toBeInTheDocument();
      const panel = await selectBranch(/OF-2/);
      expect(rows[1]).toHaveAttribute("data-selected", "true");
      expect(within(panel).getByRole("link", { name: /Deschide oferta OF-2/ })).toHaveAttribute("href", "/oferte/produs/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-2");
    });

    it("keeps the product choice when the server asks for it", async () => {
      stubDetail(requestDetail(), (url) => url.endsWith("/product-catalog")
        ? new Response(JSON.stringify({ tree: [{ kind: "product", code: "PRD-TEST", label: "Litere test" }] }), { status: 200 })
        : url.includes("/assemblies") ? new Response(JSON.stringify({ canCreate: false, offerings: [], assemblies: [] }), { status: 200 }) : null);
      render(<RoutedRequest />);
      expect(await screen.findByRole("button", { name: /Litere test/ })).toBeInTheDocument();
    });

    it("keeps a quoted simple product visible apart from adding another product", async () => {
      stubDetail(requestDetail({
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        canStartAdditionalWork: true,
        linkedOffers: [{ quoteSnapshotId: "q-9", kind: "PRODUCT", kindLabel: "Produs", productCode: "PRD-LETTERS", productLabel: "Litere volumetrice", reference: "OF-9", stageLabel: "Creată", superseded: false, attentionLabel: null, orderSnapshotId: null }],
      }), (url) => url.endsWith("/product-catalog")
        ? new Response(JSON.stringify({ tree: [{ kind: "product", code: "PRD-LOGO", label: "Logo" }] }), { status: 200 })
        : url.includes("/assemblies") ? new Response(JSON.stringify({ canCreate: false, offerings: [], assemblies: [] }), { status: 200 }) : null);
      render(<RoutedRequest />);
      expect(await screen.findByText("Litere volumetrice")).toBeInTheDocument();
      const panel = await selectBranch(/Litere volumetrice/);
      expect(within(panel).getByRole("link", { name: /Deschide oferta OF-9/ })).toHaveAttribute("href", "/oferte/produs/PRD-LETTERS/q-9");
      expect(screen.getByRole("heading", { name: "Produs separat" })).toBeInTheDocument();
      expect(screen.queryByText(/Nu există încă un produs/)).toBeNull();
    });
  });

describe("W2 · registru comercial compact", () => {
  const inscriptions = ["SYN-L01", "SYN-L02", "SYN-L03", "SYN-L04", "SYN-A01", "SYN-A02", "SYN-A03", "SYN-A04"];
  const ordered = new Set([1, 4]);
  const accepted = new Set([0, 2]);
  const statusOf = (index: number) =>
    ordered.has(index)
      ? { commercialStatus: "ORDERED", commercialStatusLabel: "Cu comandă", obligationKind: "NONE", followUp: false }
      : accepted.has(index)
        ? { commercialStatus: "ACCEPTED_WITHOUT_ORDER", commercialStatusLabel: "Acceptată · fără comandă", obligationKind: "ACTIONABLE", followUp: true }
        : { commercialStatus: "AWAITING_CUSTOMER", commercialStatusLabel: "Urmează acceptarea", obligationKind: "WAITING", followUp: true };
  const offers = inscriptions.map((inscription, index) => ({
    quoteSnapshotId: `q-${index + 1}`,
    kind: "PRODUCT",
    kindLabel: "Produs",
    productCode: index < 4 ? "PRD-SYN-LETTERS" : "PRD-SYN-ACM",
    productLabel: index < 4 ? "Litere sintetice" : "Casetă sintetică",
    inscription,
    reference: `OF-${index + 1}`,
    createdAt: `2026-10-0${index + 1}T00:00:00.000Z`,
    stage: ordered.has(index) ? "ORDER_CREATED" : "QUOTE_CREATED",
    stageLabel: ordered.has(index) ? "Cu comandă" : "Creată",
    needsAttention: !ordered.has(index),
    attentionLabel: ordered.has(index) ? null : "Urmează acceptarea",
    grossDisplay: `${100 + index},00`,
    currency: "EUR",
    superseded: false,
    orderSnapshotId: ordered.has(index) ? `ord-${index + 1}` : null,
    ...statusOf(index),
  }));
  const confirm = (index: number) => journeyItem({
    key: `offer:q-${index}`,
    quoteSnapshotId: `q-${index}`,
    productCode: "PRD-SYN-LETTERS",
    detail: `Litere sintetice · OF-${index}`,
    href: `/quotes/q-${index}`,
  });
  const eightBranches = (journeyPartial: Record<string, unknown> = {}) => requestDetail({
    nextAction: "OPEN_QUOTE",
    linkedOffers: offers,
    journey: journey({
      nextAction: "OPEN_QUOTE",
      nextActionLabel: "Confirmă comanda",
      nextActionHref: "/quotes/q-1",
      needsAttention: true,
      actionable: [confirm(1), confirm(3)],
      actionableCount: 2,
      orderCount: 2,
      ...journeyPartial,
    }),
  });

  function Harness() {
    const [search, setSearch] = useState(window.location.search);
    useEffect(() => {
      const sync = () => setSearch(window.location.search);
      window.addEventListener("popstate", sync);
      return () => window.removeEventListener("popstate", sync);
    }, []);
    return <RequestDetailPage requestId="req-1" search={search} />;
  }

  function rows(): HTMLElement[] {
    return [...screen.getByRole("list", { name: "Ramuri comerciale" }).querySelectorAll<HTMLElement>(":scope > li")];
  }

  function rowButton(index: number): HTMLElement {
    return within(rows()[index]!).getByRole("button");
  }

  it("names eight branches by inscription and shows a mixed request as partly ordered (D03 · D07)", async () => {
    stubDetail(eightBranches());
    window.history.replaceState({}, "", "/cereri/req-1");
    render(<Harness />);
    await screen.findByRole("list", { name: "Ramuri comerciale" });
    expect(rows()).toHaveLength(8);
    expect(rows().map((row) => row.querySelector(".ledger__title")?.textContent)).toEqual(inscriptions);
    expect(rows()[0]).toHaveTextContent("Litere sintetice");
    expect(rows()[0]).toHaveTextContent("OF-1");
    expect(rows()[0]).toHaveTextContent("Acceptată · fără comandă");
    expect(rows()[1]).toHaveTextContent("Cu comandă");
    expect(rows()[3]).toHaveTextContent("Urmează acceptarea");
    expect(screen.getByRole("list", { name: "Ramuri comerciale" }).textContent).not.toMatch(/câștigat|închis/i);
    expect(within(rows()[1]!).getByRole("link", { name: /Fișa lucrării/ })).toHaveAttribute("href", "/lucrari/ord-2");
    expect(within(rows()[0]!).getByRole("link", { name: /Confirmarea comenzii/ })).toHaveAttribute("href", "/oferte/produs/PRD-SYN-LETTERS/q-1");
    expect(rows().filter((row) => row.hasAttribute("data-selected"))).toHaveLength(0);
    expect(document.querySelector(".ledger__columns")?.textContent).not.toContain("#");
    expect(document.querySelector(".ledger__index")).toBeNull();
    expect(document.getElementById("branch-detail")).toBeNull();
    expect(screen.queryByText("Rezumatul cererii")).not.toBeInTheDocument();
  });

  it("keeps the request obligations on the server targets, whatever branch is selected (D04)", async () => {
    stubDetail(eightBranches());
    window.history.replaceState({}, "", "/cereri/req-1");
    render(<Harness />);
    const obligations = await screen.findByTestId("request-obligations");
    expect(obligations).toHaveTextContent("De rezolvat · 2");
    const targets = () => within(screen.getByTestId("request-obligations")).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(targets()).toEqual(["/oferte/produs/PRD-SYN-LETTERS/q-1", "/oferte/produs/PRD-SYN-LETTERS/q-3"]);
    const panel = await selectBranch(/SYN-L03/);
    expect(targets()).toEqual(["/oferte/produs/PRD-SYN-LETTERS/q-1", "/oferte/produs/PRD-SYN-LETTERS/q-3"]);
    expect(within(panel).getByRole("link", { name: /Deschide oferta OF-3/ })).toHaveAttribute("href", "/oferte/produs/PRD-SYN-LETTERS/q-3");
    expect(panel).toHaveTextContent("Celelalte 7 oferte rămân în starea lor");
    expect(panel).not.toHaveTextContent("Pasul următor");
  });

  it("gives an ordered branch the job sheet as its own action (D08)", async () => {
    stubDetail(eightBranches());
    window.history.replaceState({}, "", "/cereri/req-1");
    render(<Harness />);
    const panel = await selectBranch(/SYN-L02/);
    expect(within(panel).getByRole("link", { name: /Deschide fișa lucrării/ })).toHaveAttribute("href", "/lucrari/ord-2");
    expect(within(panel).getByRole("link", { name: "Deschide oferta OF-2" })).toHaveAttribute("href", "/oferte/produs/PRD-SYN-LETTERS/q-2");
    expect(panel).toHaveTextContent("Comanda acestei ramuri nu schimbă celelalte 7 oferte");
    expect(document.body.textContent).not.toContain("Deschide comanda");
  });

  it("keeps selection in the address: push on the first choice, replace between branches, Back clears it", async () => {
    stubDetail(eightBranches());
    window.history.replaceState({}, "", "/cereri/req-1");
    render(<Harness />);
    await screen.findByRole("list", { name: "Ramuri comerciale" });
    const depth = window.history.length;
    await userEvent.click(rowButton(2));
    expect(new URLSearchParams(window.location.search).get("ramura")).toBe("quote:q-3");
    expect(window.history.length).toBe(depth + 1);
    await userEvent.click(rowButton(5));
    expect(new URLSearchParams(window.location.search).get("ramura")).toBe("quote:q-6");
    expect(window.history.length).toBe(depth + 1);
    window.history.back();
    await waitFor(() => expect(window.location.search).toBe(""));
    await waitFor(() => expect(document.getElementById("branch-detail")).toBeNull());
    window.history.forward();
    await waitFor(() => expect(screen.getByTestId("branch-detail")).toHaveTextContent("SYN-A02"));
  });

  it("after a direct link, selecting a branch keeps the way back on the request list", async () => {
    stubDetail(eightBranches());
    window.history.replaceState({}, "", "/cereri/req-1");
    render(<Harness />);
    await screen.findByRole("list", { name: "Ramuri comerciale" });
    await userEvent.click(rowButton(2));
    await screen.findByTestId("branch-detail");
    expect(screen.getByRole("link", { name: "← Toate cererile" })).toHaveAttribute("href", "/cereri");
    expect(screen.queryByRole("link", { name: "← Cerere" })).not.toBeInTheDocument();
  });

  it("restores a branch from a direct link and focuses its row", async () => {
    stubDetail(eightBranches());
    window.history.replaceState({}, "", "/cereri/req-1?ramura=quote%3Aq-4");
    render(<Harness />);
    expect(await screen.findByTestId("branch-detail")).toHaveTextContent("SYN-L04");
    await waitFor(() => expect(rowButton(3)).toHaveFocus());
    expect(rows()[3]).toHaveAttribute("data-selected", "true");
  });

  it("says plainly when the branch in the address is no longer on the request", async () => {
    stubDetail(eightBranches());
    window.history.replaceState({}, "", "/cereri/req-1?ramura=quote%3Agone");
    render(<Harness />);
    expect(await screen.findByText("Ramura din adresă nu mai este în această cerere")).toBeInTheDocument();
    expect(document.getElementById("branch-detail")).toBeNull();
  });

  it("moves with arrow keys, opens the branch action with Enter and returns with Escape", async () => {
    stubDetail(eightBranches());
    window.history.replaceState({}, "", "/cereri/req-1?ramura=quote%3Aq-1");
    render(<Harness />);
    await waitFor(() => expect(rowButton(0)).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    expect(new URLSearchParams(window.location.search).get("ramura")).toBe("quote:q-2");
    expect(rowButton(1)).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(new URLSearchParams(window.location.search).get("ramura")).toBe("quote:q-8");
    await userEvent.keyboard("{Home}");
    expect(new URLSearchParams(window.location.search).get("ramura")).toBe("quote:q-1");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("ramura")).toBeNull());
    await userEvent.click(rowButton(1));
    await userEvent.keyboard("{Enter}");
    expect(window.location.pathname).toBe("/lucrari/ord-2");
  });

  it("filters to the branches that need action, keeps registration order and names what is hidden", async () => {
    stubDetail(eightBranches());
    window.history.replaceState({}, "", "/cereri/req-1");
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "De rezolvat · 2" }));
    expect(new URLSearchParams(window.location.search).get("filtru")).toBe("actiune");
    expect(rows().map((row) => row.querySelector(".ledger__title")?.textContent)).toEqual(["SYN-L01", "SYN-L03"]);
    expect(screen.getByText("2 din 8 · ordinea înregistrării păstrată")).toBeInTheDocument();
    expect(screen.getByText(/Ascunse de filtru: SYN-L02/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cu comandă · 2" }));
    expect(rows()).toHaveLength(2);
  });

  it("marks for action only the branches the server journey names", async () => {
    stubDetail(eightBranches({ actionable: [confirm(3)], actionableCount: 1 }));
    window.history.replaceState({}, "", "/cereri/req-1");
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "De rezolvat · 1" }));
    expect(rows().map((row) => row.querySelector(".ledger__title")?.textContent)).toEqual(["SYN-L03"]);
  });
});

describe("W3-D06 · încheiere comercială", () => {
  function commercial(overrides: Record<string, unknown> = {}) {
    return {
      state: "OPEN",
      stateLabel: "Urmărire comercială deschisă",
      revision: 0,
      closedAt: null,
      closedBy: null,
      closeReason: null,
      reopenedAt: null,
      reopenedBy: null,
      reopenReason: null,
      offers: [],
      availableActions: ["CLOSE_OFFERLESS", "CREATE_QUOTE"],
      blockingReasons: [],
      outstandingAcceptedWithoutOrder: [],
      unresolvedQuoteSnapshotIds: [],
      canClose: true,
      canReopen: false,
      canSaveDecisions: false,
      canCreateQuote: true,
      timeline: [],
      ...overrides,
    };
  }

  it("closes an offerless request with a mandatory reason and keeps the administrative status apart", async () => {
    const posts: Array<{ url: string; body: unknown }> = [];
    stubDetail(requestDetail({ commercial: commercial(), journey: journey({ administrativeNote: "Administrativ: gata de ofertă" }) }), (url, init) => {
      if (init?.method === "POST") {
        posts.push({ url, body: JSON.parse(String(init.body ?? "{}")) });
        return new Response(
          JSON.stringify({
            alreadyApplied: false,
            detail: requestDetail({
              commercial: commercial({
                state: "CLOSED",
                stateLabel: "Urmărire comercială încheiată",
                revision: 1,
                canClose: false,
                canReopen: true,
                canCreateQuote: false,
                availableActions: ["REOPEN"],
              }),
            }),
          }),
          { status: 200 },
        );
      }
      return null;
    });
    render(<RoutedRequest />);
    expect(await screen.findByTestId("request-administrative-status")).toHaveTextContent("Administrativ: gata de ofertă");
    await chooseMore("Încheie urmărirea comercială");
    const dialog = await screen.findByRole("dialog", { name: "Închei urmărirea comercială?" });
    expect(within(dialog).getByText(/starea administrativă a cererii rămâne neschimbată/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Încheie urmărirea comercială" })).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Motivul încheierii"), "Nu se mai urmărește");
    await userEvent.click(within(dialog).getByRole("button", { name: "Încheie urmărirea comercială" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]?.url).toContain("/commercial/decisions");
    expect(posts[0]?.body).toMatchObject({
      groups: [],
      close: true,
      closeReason: "Nu se mai urmărește",
      expectedRevision: 0,
    });
  });

  it("notes a reopened request only from the server's reopening facts", async () => {
    stubDetail(requestDetail({
      commercial: commercial({
        reopenedAt: "2026-11-05T09:30:00.000Z",
        reopenedBy: { displayName: "Ana Sintetic", role: "OWNER", roleLabel: "Proprietar", accountId: null },
        reopenReason: "Clientul revine cu o variantă nouă.",
      }),
      journey: journey({ phase: "REOPENED", phaseLabel: "Redeschisă", phaseAt: "2026-11-05T09:30:00.000Z" }),
    }));
    render(<RoutedRequest />);
    const banner = await screen.findByTestId("commercial-reopened-banner");
    expect(banner).toHaveTextContent("Notă · Redeschisă");
    expect(banner).toHaveTextContent("Ana Sintetic");
    expect(banner).toHaveTextContent("Clientul revine cu o variantă nouă.");
    expect(screen.queryByTestId("commercial-closed-banner")).not.toBeInTheDocument();
  });

  it("invents no reopening note when the server has none", async () => {
    stubDetail(requestDetail({ commercial: commercial() }));
    render(<RoutedRequest />);
    await screen.findByRole("button", { name: /Mai multe/ });
    expect(screen.queryByTestId("commercial-reopened-banner")).not.toBeInTheDocument();
    expect(screen.queryByText(/Redeschisă/)).not.toBeInTheDocument();
  });

  it("keeps the rare commercial actions in one 'Mai multe' menu that closes with Escape", async () => {
    stubDetail(requestDetail({ commercial: commercial() }));
    render(<RoutedRequest />);
    const more = await screen.findByRole("button", { name: /Mai multe/ });
    expect(screen.getAllByRole("button", { name: /Mai multe/ })).toHaveLength(1);
    await userEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Încheie urmărirea comercială" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();
  });

  it("keeps the close-confirmation sentences readable and dismisses the dialog from the keyboard", async () => {
    stubDetail(requestDetail({ commercial: commercial() }));
    render(<RoutedRequest />);
    await chooseMore("Încheie urmărirea comercială");
    const dialog = await screen.findByRole("dialog", { name: "Închei urmărirea comercială?" });
    expect(dialog).toHaveAttribute("data-frame");
    expect(within(dialog).getByText(/Cererea nu are oferte/)).toBeInTheDocument();
    expect(within(dialog).getByText(/starea administrativă a cererii rămâne neschimbată/i)).toBeInTheDocument();
    expect(within(dialog).getByText("Comenzile, lucrările și producția existente rămân neschimbate.")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Încheie urmărirea comercială" });
    expect(confirm.className).toMatch(/\bhit\b/);
    expect(within(dialog).getByRole("button", { name: "Închide formularul" })).toHaveAttribute("type", "button");
    dialog.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Închei urmărirea comercială?" })).not.toBeInTheDocument());
  });

  it("shows a server refusal inside the close confirmation without leaving the dialog", async () => {
    stubDetail(requestDetail({ commercial: commercial() }), (_url, init) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            error: "commercial_revision_mismatch",
            reasons: ["Revizia comercială s-a schimbat."],
          }),
          { status: 409 },
        );
      }
      return null;
    });
    render(<RoutedRequest />);
    await chooseMore("Încheie urmărirea comercială");
    const dialog = await screen.findByRole("dialog", { name: "Închei urmărirea comercială?" });
    await userEvent.type(within(dialog).getByLabelText("Motivul încheierii"), "Se închide.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Încheie urmărirea comercială" }));
    expect(await within(dialog).findByText("Revizia comercială s-a schimbat.")).toBeInTheDocument();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Încheierea nu s-a aplicat");
    expect(screen.getByRole("dialog", { name: "Închei urmărirea comercială?" })).toBeInTheDocument();
  });

  it("saves a partial decision while the request stays open and refuses close until every unresolved offer is covered", async () => {
    const posts: unknown[] = [];
    const offers = [
      { quoteSnapshotId: "q-1", kind: "PRODUCT", kindLabel: "Produs", productCode: "PRD-LETTERS", productLabel: "Litere", inscription: "A", reference: "OF-1", stage: "QUOTE_CREATED", stageLabel: "Creată", superseded: false, orderSnapshotId: null, decisionRequired: true },
      { quoteSnapshotId: "q-2", kind: "PRODUCT", kindLabel: "Produs", productCode: "PRD-LETTERS", productLabel: "Litere", inscription: "B", reference: "OF-2", stage: "QUOTE_CREATED", stageLabel: "Creată", superseded: false, orderSnapshotId: null, decisionRequired: true },
      { quoteSnapshotId: "q-3", kind: "PRODUCT", kindLabel: "Produs", productCode: "PRD-LETTERS", productLabel: "Litere", inscription: "C", reference: "OF-3", stage: "ORDER_CREATED", stageLabel: "Cu comandă", superseded: false, orderSnapshotId: "ord-3", decisionRequired: false },
    ];
    stubDetail(
      requestDetail({
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        linkedOffers: offers,
        commercial: commercial({
          canClose: false,
          canSaveDecisions: true,
          availableActions: ["SAVE_DECISIONS"],
          unresolvedQuoteSnapshotIds: ["q-1", "q-2"],
          offers: [
            { quoteSnapshotId: "q-1", decisionRequired: true, resumable: false },
            { quoteSnapshotId: "q-2", decisionRequired: true, resumable: false },
            { quoteSnapshotId: "q-3", decisionRequired: false, resumable: false },
          ],
        }),
      }),
      (_url, init) => {
        if (init?.method === "POST") {
          posts.push(JSON.parse(String(init.body ?? "{}")));
          return new Response(JSON.stringify({ alreadyApplied: false, detail: requestDetail({ linkedOffers: offers, commercial: commercial({ revision: 1, canSaveDecisions: true, unresolvedQuoteSnapshotIds: ["q-2"] }) }) }), { status: 200 });
        }
        return null;
      },
    );
    render(<RoutedRequest />);
    await chooseMore("Încheie urmărirea comercială");
    const workspace = document.querySelector(".request-workspace");
    expect(workspace).toHaveAttribute("data-deciding", "true");
    const panel = await screen.findByTestId("commercial-decision-panel");
    expect(panel.closest(".request-rail")).not.toBeNull();
    expect(within(panel).getByText(/2 oferte cer o decizie/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Salvează și încheie comercial" })).toBeDisabled();
    expect(within(panel).getByText(/este disponibil după ce toate ofertele nerezolvate au o decizie/)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Ramuri comerciale" });
    await userEvent.click(within(list).getByRole("checkbox", { name: /Cere decizie: A/ }));
    await userEvent.type(within(panel).getByLabelText(/Motiv · Nu se mai urmărește/), "Nu mai urmărim A");
    await userEvent.click(within(panel).getByRole("button", { name: "Salvează deciziile" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      close: false,
      groups: [{ disposition: "NOT_PURSUED", quoteSnapshotIds: ["q-1"] }],
    });
  });

  it("distinguishes a closed commercial request from jobs and the administrative status", async () => {
    stubDetail(
      requestDetail({
        nextAction: "OPEN_REQUEST",
        nextActionLabel: "Deschide cererea",
        statusLabel: "Gata de ofertă",
        commercial: commercial({
          state: "CLOSED",
          stateLabel: "Urmărire comercială încheiată",
          closeReason: "Nu se mai urmărește",
          canClose: false,
          canReopen: true,
          canCreateQuote: false,
          availableActions: ["REOPEN"],
          outstandingAcceptedWithoutOrder: [{ quoteSnapshotId: "q-9", label: "Ofertă acceptată, fără comandă" }],
        }),
        journey: journey({ phase: "CLOSED", phaseLabel: "Încheiată comercial", phaseAt: "2026-10-04T10:00:00.000Z", administrativeNote: "Administrativ: gata de ofertă" }),
      }),
    );
    render(<RoutedRequest />);
    expect(await screen.findByTestId("request-administrative-status")).toHaveTextContent("Administrativ: gata de ofertă");
    expect(screen.getByTestId("request-commercial-status")).toHaveTextContent("Încheiată comercial");
    expect(screen.getByTestId("request-commercial-status")).toHaveAttribute("data-phase", "CLOSED");
    expect(screen.getByTestId("commercial-closed-banner")).toHaveTextContent("Comenzile, lucrările și producția existente nu se anulează");
    expect(screen.getByTestId("commercial-closed-banner")).toHaveTextContent("O ofertă acceptată așteaptă comanda");
    await userEvent.click(screen.getByRole("button", { name: /Mai multe/ }));
    expect(screen.getByRole("button", { name: "Redeschide urmărirea comercială" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Încheie urmărirea comercială" })).not.toBeInTheDocument();
  });

  it("does not offer owner mutations when the server withholds them", async () => {
    stubDetail(requestDetail({ commercial: commercial({ canClose: false, canSaveDecisions: false, canReopen: false, availableActions: ["CREATE_QUOTE"] }) }));
    render(<RoutedRequest />);
    await screen.findByRole("heading", { name: "Litere vitrină" });
    expect(screen.queryByRole("button", { name: "Încheie urmărirea comercială" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Redeschide urmărirea comercială" })).not.toBeInTheDocument();
  });
});

