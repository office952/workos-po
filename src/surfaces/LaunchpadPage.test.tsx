import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudSessionProvider } from "../session/CloudSessionContext";
import { LaunchpadPage } from "./LaunchpadPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
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

function stubOperatingFetch(role: "owner" | "member") {
  return vi.fn((input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/cloud/session")) {
      return jsonResponse(sessionBody(role));
    }
    if (url.includes("/api/people")) {
      return jsonResponse({
        canEdit: role === "owner",
        people: [],
        skills: [],
        registry: { people: [] },
      });
    }
    if (url.includes("/api/workcenters")) {
      return jsonResponse({
        canEdit: role === "owner",
        workcenters: [],
        machines: [],
        capabilities: [],
      });
    }
    if (url.includes("/api/admin/product-enablement")) {
      return jsonResponse({
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
      });
    }
    if (url.includes("/api/operational-services")) {
      return jsonResponse({
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
      });
    }
    if (url.includes("/api/admin/material-readiness")) {
      return jsonResponse({
        canWrite: role === "owner",
        mode: "DISABLED",
        modeLabel: "Oprit",
        source: "CODE_DEFAULT",
        version: 0,
      });
    }
    if (url.includes("/api/admin/external-production")) {
      return jsonResponse({
        canWrite: role === "owner",
        mode: "DISABLED",
        modeLabel: "Oprit",
        source: "CODE_DEFAULT",
        version: 0,
        providers: [],
      });
    }
    return jsonResponse({});
  });
}

describe("LaunchpadPage", () => {
  it("orients the owner of an empty organization without claiming it is ready", async () => {
    vi.stubGlobal("fetch", stubOperatingFetch("owner"));
    render(
      <CloudSessionProvider>
        <LaunchpadPage />
      </CloudSessionProvider>,
    );

    expect(await screen.findByText("Atelier Alpha · Proprietar")).toBeInTheDocument();
    expect(await screen.findByText("Organizație nouă")).toBeInTheDocument();
    expect(screen.queryByText("Pregătit")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ce poți folosi acum" })).toBeInTheDocument();
    expect(screen.getByText(/fără oameni, PIN sau utilaje/)).toBeInTheDocument();
    expect(screen.getByText(/Nu este nevoie să configurezi Atelierul/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Continuă" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Planificare/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Lucrări/ })[0]).toHaveAttribute("href", "/lucrari");
    expect(screen.getByRole("heading", { name: "Comercial" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operațiuni" })).toBeInTheDocument();
    expect(screen.getByText("Poți modifica setările pentru lucrările noi.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Configurator/ })).not.toBeInTheDocument();
    expect(
      Array.from(document.querySelectorAll("a")).some((a) => a.getAttribute("href") === "/foundation"),
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
      screen.getByText("Modificările sunt rezervate proprietarului organizației."),
    ).toBeInTheDocument();
  });
});
