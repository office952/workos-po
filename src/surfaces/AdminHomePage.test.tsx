import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { CloudSessionProvider } from "../session/CloudSessionContext";
import { AdminHomePage } from "./AdminHomePage";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
});

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

function stubOperatingFetch(offerMode: string | null = "SERVICE_DISABLED") {
  return vi.fn((input: RequestInfo) => {
    const url = String(input);
    if (url.includes("/api/cloud/session")) {
      return jsonResponse({
        mode: "cloud",
        user: { userId: "usr:1", email: "owner@example.test" },
        organization: {
          organizationId: "org:a",
          displayName: "Atelier Alpha",
          slug: "alpha",
          role: "owner",
        },
        memberships: [],
      });
    }
    if (url.includes("/api/people")) {
      return jsonResponse({ canEdit: true, people: [], skills: [], registry: { people: [] } });
    }
    if (url.includes("/api/workcenters")) {
      return jsonResponse({ canEdit: true, workcenters: [], machines: [], capabilities: [] });
    }
    if (url.includes("/api/admin/product-enablement")) {
      return jsonResponse({
        canEdit: true,
        resolutionOk: true,
        source: "CODE_DEFAULT",
        products: [
          { templateCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06", label: "Litere volumetrice față plexi", enabled: true },
        ],
        history: [],
      });
    }
    if (url.includes("/api/operational-services")) {
      return jsonResponse({
        canWrite: true,
        services: {
          capabilities: [
            {
              capabilityId: "SITE_INSTALLATION",
              label: "Montaj la locație",
              selectable: true,
              reserved: false,
              offerMode,
            },
          ],
        },
      });
    }
    if (url.includes("/api/admin/material-readiness")) {
      return jsonResponse({ canWrite: true, mode: "DISABLED", modeLabel: "Oprit", source: "CODE_DEFAULT", version: 0 });
    }
    if (url.includes("/api/admin/external-production")) {
      return jsonResponse({
        canWrite: true,
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

describe("AdminHomePage", () => {
  it("maps the five domains with the read state under each page, without calling an empty Atelier a new organization", async () => {
    vi.stubGlobal("fetch", stubOperatingFetch());

    render(
      <CloudSessionProvider>
        <AdminHomePage />
      </CloudSessionProvider>,
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Administrare" })).toBeInTheDocument();
    const map = screen.getByRole("navigation", { name: "Domeniile administrării" });
    for (const domain of ["Firma", "Ce oferi", "Cum calculezi", "Echipa și atelierul", "Execuția", "Accesul"]) {
      expect(within(map).getByRole("heading", { name: domain })).toBeInTheDocument();
    }
    expect(within(map).getAllByRole("link")).toHaveLength(14);
    expect(await within(map).findAllByText("Dezactivat explicit")).not.toHaveLength(0);
    expect(screen.queryByText("Organizație nouă")).not.toBeInTheDocument();
    expect(screen.queryByText("Pregătit")).not.toBeInTheDocument();
    // One product is offered and every read succeeded: nothing asks for attention.
    expect(screen.queryByText(/Niciun produs nu este oferit/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nu s-au putut citi/)).not.toBeInTheDocument();
    expect(within(map).getByRole("link", { name: /^Produse oferite/ })).toHaveAttribute("href", "/admin/products");
    expect(within(map).getByRole("link", { name: /^Oameni/ })).toHaveAttribute("href", "/admin/people");
    expect(within(map).getByRole("link", { name: /^Zone și utilaje/ })).toHaveAttribute("href", "/admin/workcenters");
    expect(within(map).getByRole("link", { name: /^Acces organizație/ })).toHaveAttribute("href", "/admin/access");
    expect(within(map).getByRole("link", { name: /^Costuri de producție/ })).toHaveAttribute("href", "/admin/resources");
    expect(within(map).getByRole("link", { name: /^Materiale execuție/ })).toHaveAttribute(
      "href",
      "/admin/material-readiness",
    );
    expect(document.querySelector("[data-floorplan='admin-settings']")).not.toBeNull();
    expect(screen.queryByText("org:a")).not.toBeInTheDocument();
  });

  it("labels an unset installation as unknown configuration, not as disabled", async () => {
    vi.stubGlobal("fetch", stubOperatingFetch(null));

    render(
      <CloudSessionProvider>
        <AdminHomePage />
      </CloudSessionProvider>,
    );

    const services = await screen.findByRole("link", { name: /^Servicii operaționale/ });
    expect(await within(services).findByText("Nu este setat")).toBeInTheDocument();
    expect(services).not.toHaveTextContent("Dezactivat explicit");
  });
});
