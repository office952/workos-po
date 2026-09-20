import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("places organization and account on the right of the slice bar", () => {
    render(
      <AppShell
        contextLabel="Clienți"
        mode="slice"
        currentHref="/clienti"
        account={{
          organizationName: "Atelier Alpha",
          userLabel: "owner@example.test",
          memberships: [{ organizationId: "org:a", displayName: "Atelier Alpha" }],
          currentOrganizationId: "org:a",
          onLogout: vi.fn(),
        }}
      >
        <div>conținut</div>
      </AppShell>,
    );

    const bar = document.querySelector(".app-shell__bar");
    const account = document.querySelector(".app-shell__account");
    expect(bar).not.toBeNull();
    expect(account).not.toBeNull();
    expect(bar?.contains(account)).toBe(true);
    expect(screen.getByText("Atelier Alpha")).toBeInTheDocument();
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ieși din cont" })).toBeInTheDocument();
    expect(document.querySelector(".app-shell__context")).toBeNull();
    expect(screen.getByRole("link", { name: "Clienți" })).toBeInTheDocument();
  });

  it("keeps one Administrare L1 entry for both admin routes", () => {
    const { rerender } = render(
      <AppShell contextLabel="Administrare" mode="slice" currentHref="/admin/commercial">
        <div>conținut</div>
      </AppShell>,
    );

    const administration = screen.getByRole("link", { name: "Administrare" });
    expect(administration).toHaveAttribute("href", "/admin/resources");
    expect(administration).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Resurse" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Comercial" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cereri" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Catalog" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Configurator" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oferte" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lucrări" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Atelier" })).toBeInTheDocument();

    rerender(
      <AppShell contextLabel="Administrare" mode="slice" currentHref="/admin/resources">
        <div>conținut</div>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Administrare" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    rerender(
      <AppShell contextLabel="Clienți" mode="slice" currentHref="/clienti">
        <div>conținut</div>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Administrare" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
