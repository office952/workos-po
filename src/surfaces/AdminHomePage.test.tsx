import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudSessionProvider } from "../session/CloudSessionContext";
import { AdminHomePage } from "./AdminHomePage";

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

function stubOperatingFetch() {
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
              offerMode: "SERVICE_DISABLED",
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
  it("groups settings and does not treat cost evidence as the only admin destination", async () => {
    vi.stubGlobal("fetch", stubOperatingFetch());

    render(
      <CloudSessionProvider>
        <AdminHomePage />
      </CloudSessionProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Organizație" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ce poți folosi acum" })).toBeInTheDocument();
    expect(await screen.findByText("Organizație nouă")).toBeInTheDocument();
    expect(screen.queryByText("Pregătit")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comercial și calcul" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Execuție" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Produse oferite/ }).every((link) => link.getAttribute("href") === "/admin/products"),
    ).toBe(true);
    expect(
      screen.getAllByRole("link", { name: /Oameni/ }).every((link) => link.getAttribute("href") === "/admin/people"),
    ).toBe(true);
    expect(
      screen.getAllByRole("link", { name: /Zone și utilaje/ }).every((link) => link.getAttribute("href") === "/admin/workcenters"),
    ).toBe(true);
    expect(
      screen.getAllByRole("link", { name: /Acces/ }).every((link) => link.getAttribute("href") === "/admin/access"),
    ).toBe(true);
    expect(screen.getByRole("link", { name: /Dovezi de cost/ })).toHaveAttribute(
      "href",
      "/admin/resources",
    );
    expect(document.querySelector("[data-floorplan='admin-settings']")).not.toBeNull();
    expect(screen.queryByText("org:a")).not.toBeInTheDocument();
  });
});
