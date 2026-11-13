import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { CloudSessionProvider } from "../session/CloudSessionContext";
import { LaunchpadPage } from "./LaunchpadPage";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function sessionBody(role: "owner" | "member") {
  return {
    mode: "cloud",
    user: { userId: "usr:1", email: "owner@example.test" },
    organization: {
      organizationId: "org:a",
      displayName: "Atelier Alpha",
      slug: "alpha",
      role,
    },
    memberships: [
      {
        organizationId: "org:a",
        displayName: "Atelier Alpha",
        slug: "alpha",
        role,
        status: "ACTIVE",
      },
    ],
  };
}

function operatingBodies(role: "owner" | "member") {
  return {
    people: { canEdit: role === "owner", people: [], skills: [], registry: { people: [] } },
    workcenters: { canEdit: role === "owner", workcenters: [], machines: [], capabilities: [] },
    products: {
      canEdit: role === "owner",
      resolutionOk: true,
      source: "CODE_DEFAULT",
      sourceLabel: "Selecție de sistem",
      guidance: "Produsele existente rămân oferite pentru lucrări noi.",
      activeVersion: null,
      products: [
        { templateCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06", label: "Litere volumetrice față plexi", enabled: true },
        { templateCode: "PRD-ACM-CASSETTE-NONE", label: "Panou ACM casetat", enabled: true },
      ],
      history: [],
    },
    services: {
      canWrite: role === "owner",
      services: {
        capabilities: [
          {
            capabilityId: "SITE_INSTALLATION",
            label: "Montaj la locație",
            selectable: true,
            reserved: false,
            offerMode: "SERVICE_DISABLED",
          },
        ],
      },
    },
    materials: { canWrite: role === "owner", mode: "DISABLED", modeLabel: "Oprit", source: "CODE_DEFAULT", version: 0 },
    external: {
      canWrite: role === "owner",
      mode: "DISABLED",
      modeLabel: "Oprit",
      source: "CODE_DEFAULT",
      version: 0,
      providers: [],
    },
  };
}

function stubOperatingFetch(
  role: "owner" | "member",
  options: { failPeople?: { current: boolean } } = {},
) {
  const bodies = operatingBodies(role);
  return vi.fn((input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/cloud/session")) return jsonResponse(sessionBody(role));
    if (url.includes("/api/people")) {
      if (options.failPeople?.current) {
        return jsonResponse({ error: "unavailable" }, 500);
      }
      return jsonResponse(bodies.people);
    }
    if (url.includes("/api/workcenters")) return jsonResponse(bodies.workcenters);
    if (url.includes("/api/admin/product-enablement")) return jsonResponse(bodies.products);
    if (url.includes("/api/operational-services")) return jsonResponse(bodies.services);
    if (url.includes("/api/admin/material-readiness")) return jsonResponse(bodies.materials);
    if (url.includes("/api/admin/external-production")) return jsonResponse(bodies.external);
    return jsonResponse({});
  });
}

describe("LaunchpadPage", () => {
  it("orients a commercially active org without people or machines, without calling it new", async () => {
    vi.stubGlobal("fetch", stubOperatingFetch("owner"));
    render(
      <CloudSessionProvider>
        <LaunchpadPage />
      </CloudSessionProvider>,
    );

    expect(await screen.findByText("Atelier Alpha · Proprietar")).toBeInTheDocument();
    expect(await screen.findByText("Comercial disponibil")).toBeInTheDocument();
    expect(screen.queryByText("Organizație nouă")).not.toBeInTheDocument();
    expect(screen.queryByText("Pregătit")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ce poți folosi acum" })).toBeInTheDocument();
    expect(screen.getByText(/Atelierul \(oameni, utilaje, execuție\) este opțional/)).toBeInTheDocument();
    expect(screen.getByText(/Nu depinde de Atelier/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Setările organizației/ })).toHaveAttribute("href", "/admin");
    expect(screen.queryByRole("link", { name: /Zone și utilaje/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Materiale execuție/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Execuție externă/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Adaugă persoane și PIN pentru Atelier, dacă execuția e internă.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Continuă" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Planificare/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Lucrări/ })[0]).toHaveAttribute("href", "/lucrari");
    expect(screen.getByRole("heading", { name: "Comercial" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operațiuni" })).toBeInTheDocument();
    expect(screen.getByText("Tu poți schimba oferta și execuția pentru toată organizația.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Configurator/ })).not.toBeInTheDocument();
    expect(
      Array.from(document.querySelectorAll("a")).some((anchor) => anchor.getAttribute("href") === "/foundation"),
    ).toBe(false);
    expect(screen.queryByText("org:a")).not.toBeInTheDocument();
    expect(screen.queryByText(/API|DTO|motorul/)).not.toBeInTheDocument();
  });

  it("keeps organization changes reserved for the owner", async () => {
    vi.stubGlobal("fetch", stubOperatingFetch("member"));
    render(
      <CloudSessionProvider>
        <LaunchpadPage />
      </CloudSessionProvider>,
    );

    expect(await screen.findByText("Atelier Alpha · Membru")).toBeInTheDocument();
    expect(
      screen.getByText(/Doar proprietarul schimbă oferta, oamenii, utilajele și politicile de execuție/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Adaugă persoane/)).not.toBeInTheDocument();
  });

  it("retries the six existing admin resources without treating a failed read as disabled", async () => {
    const failPeople = { current: true };
    vi.stubGlobal("fetch", stubOperatingFetch("owner", { failPeople }));
    render(
      <CloudSessionProvider>
        <LaunchpadPage />
      </CloudSessionProvider>,
    );

    expect(await screen.findByText("Unele setări nu s-au putut citi")).toBeInTheDocument();
    expect(screen.queryByText(/lipsa datelor ca dezactivare/i)).toBeInTheDocument();
    failPeople.current = false;
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByText("Comercial disponibil")).toBeInTheDocument();
    expect(screen.queryByText("Unele setări nu s-au putut citi")).not.toBeInTheDocument();
  });
});
