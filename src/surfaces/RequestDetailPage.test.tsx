import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { RequestDetailPage } from "./RequestDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
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
  it("keeps request identity in the header and a single catalog continuation", async () => {
    stubDetail(requestDetail());

    render(<RequestDetailPage requestId="req-1" />);
    expect(await screen.findByRole("heading", { name: "Litere vitrină" })).toBeInTheDocument();
    expect(screen.getByText(/Atelier Nord/)).toBeInTheDocument();
    expect(screen.getByText(/CRQ-104/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alege produs" })).toHaveAttribute(
      "href",
      "/catalog?customer=cus-1&request=req-1",
    );
    expect(screen.queryByRole("heading", { name: "Cerere", level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByText(/Nu adăuga montaj/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Montajul nu face parte/i)).not.toBeInTheDocument();
  });

  it("does not show catalog when OPEN_QUOTE is the primary action", async () => {
    stubDetail(
      requestDetail({
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        commercialProgressLabel: "Ofertă creată",
        linkedOffers: [
          {
            quoteSnapshotId: "q-1",
            productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
            reference: "OF-1",
          },
        ],
      }),
    );

    render(<RequestDetailPage requestId="req-1" />);
    expect(await screen.findByRole("link", { name: "Deschide oferta" })).toHaveAttribute(
      "href",
      "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    );
    expect(screen.queryByRole("link", { name: /catalog/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deschide oferta OF-1" })).toBeInTheDocument();
  });

  it("uses linked offers as OPEN_QUOTE when the envelope omits nextAction", async () => {
    stubDetail(
      requestDetail({
        nextAction: undefined,
        nextActionLabel: undefined,
        commercialProgressLabel: "Ofertă creată",
        linkedOffers: [
          {
            quoteSnapshotId: "q-1",
            productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
            reference: "OF-1",
          },
        ],
      }),
    );

    render(<RequestDetailPage requestId="req-1" />);
    expect(await screen.findByRole("link", { name: "Deschide oferta" })).toHaveAttribute(
      "href",
      "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    );
    expect(screen.queryByRole("link", { name: "Alege produs" })).not.toBeInTheDocument();
  });

  it("shows the empty attachments state and hides upload when forbidden", async () => {
    stubDetail(
      requestDetail({
        canUploadAttachments: false,
        attachments: [],
      }),
    );

    render(<RequestDetailPage requestId="req-1" />);
    expect(await screen.findByText("Nu există atașamente.")).toBeInTheDocument();
    expect(screen.getByText("Încărcarea nu este permisă pe această cerere.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Încarcă fișier")).not.toBeInTheDocument();
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

    render(<RequestDetailPage requestId="req-1" />);
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
    render(<RequestDetailPage requestId="req-1" />);
    const input = await screen.findByLabelText("Încarcă fișier");
    await userEvent.setup().upload(input, file);
    await userEvent.setup().click(screen.getByRole("button", { name: "Încarcă" }));
    expect(await screen.findByRole("link", { name: "nou.pdf" })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]).endsWith("/attachments") && call[1]?.method === "POST",
      ),
    ).toBe(true);
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

    render(<RequestDetailPage requestId="req-1" />);
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

    render(<RequestDetailPage requestId="req-1" />);
    expect(await screen.findByRole("button", { name: "Salvează datele de montaj" })).toBeEnabled();
    expect(screen.getByLabelText("Stradă")).toBeInTheDocument();
  });

  it("does not offer add installation when the service is unconfigured", async () => {
    stubDetail(requestDetail());

    render(<RequestDetailPage requestId="req-1" />);
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

    render(<RequestDetailPage requestId="req-1" />);
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

    render(<RequestDetailPage requestId="req-1" />);
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

    render(<RequestDetailPage requestId="req-1" />);
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

    render(<RequestDetailPage requestId="req-1" />);
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

    render(<RequestDetailPage requestId="req-1" />);
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

    render(<RequestDetailPage requestId="req-1" />);
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

    render(<RequestDetailPage requestId="req-1" />);
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

    render(<RequestDetailPage requestId="req-1" />);
    expect(await screen.findByText("Montajul păstrat pe cerere rămâne vizibil.")).toBeInTheDocument();
    expect(screen.getAllByText("Montaj la locație").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Adaugă montaj" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimină montaj" })).toBeEnabled();
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
