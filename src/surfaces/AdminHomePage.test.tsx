import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudSessionProvider } from "../session/CloudSessionContext";
import { AdminHomePage } from "./AdminHomePage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AdminHomePage", () => {
  it("groups settings and does not treat cost evidence as the only admin destination", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          mode: "cloud",
          user: { userId: "usr:1", email: "owner@example.test" },
          organization: {
            organizationId: "org:a",
            displayName: "Atelier Alpha",
            slug: "alpha",
            role: "owner",
          },
          memberships: [],
        }),
      }),
    );

    render(
      <CloudSessionProvider>
        <AdminHomePage />
      </CloudSessionProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Organizație" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Comercial și calcul" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Execuție" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Produse oferite/ })).toHaveAttribute(
      "href",
      "/admin/products",
    );
    expect(screen.getByRole("link", { name: /Oameni/ })).toHaveAttribute("href", "/admin/people");
    expect(screen.getByRole("link", { name: /Zone și utilaje/ })).toHaveAttribute(
      "href",
      "/admin/workcenters",
    );
    expect(screen.getByRole("link", { name: /Acces/ })).toHaveAttribute("href", "/admin/access");
    expect(screen.getByRole("link", { name: /Dovezi de cost/ })).toHaveAttribute(
      "href",
      "/admin/resources",
    );
    expect(document.querySelector("[data-floorplan='admin-settings']")).not.toBeNull();
    expect(screen.queryByText("org:a")).not.toBeInTheDocument();
  });
});
