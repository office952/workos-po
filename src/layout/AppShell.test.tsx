import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("places organization, account, and aspect together", () => {
    render(
      <AppShell
        contextLabel="Clienți"
        mode="slice"
        currentHref="/clienti"
        account={{
          organizationName: "Atelier Alpha",
          userLabel: "owner@example.test",
          membershipRole: "owner",
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
    expect(screen.getByText("Proprietar")).toBeInTheDocument();
    expect(screen.queryByText("org:a")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ieși din cont" })).toBeInTheDocument();
    expect(screen.getByLabelText("Aspect")).toBeInTheDocument();
    expect(document.querySelector(".app-shell__context")).toBeNull();
    expect(screen.getByRole("link", { name: "Clienți" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Navigare principală" })).toBeInTheDocument();
  });

  it("keeps one Administrare entry and discovers Planificare", () => {
    const { rerender } = render(
      <AppShell contextLabel="Administrare" mode="slice" currentHref="/admin/commercial">
        <div>conținut</div>
      </AppShell>,
    );

    const administration = screen.getByRole("link", { name: "Administrare" });
    expect(administration).toHaveAttribute("href", "/admin");
    expect(administration).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Planificare" })).toHaveAttribute("href", "/planificare");
    expect(screen.queryByRole("link", { name: "Configurator" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Foundation|fundament/i })).not.toBeInTheDocument();
    expect(
      Array.from(document.querySelectorAll("a")).some((a) => a.getAttribute("href") === "/foundation"),
    ).toBe(false);
    expect(screen.getByRole("link", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cereri" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Catalog" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oferte" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lucrări" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Atelier" })).toBeInTheDocument();

    rerender(
      <AppShell contextLabel="Administrare" mode="slice" currentHref="/admin/products">
        <div>conținut</div>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Administrare" })).toHaveAttribute("href", "/admin");
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

  it("moves through the shell from the keyboard", async () => {
    render(
      <AppShell contextLabel="Clienți" mode="slice" currentHref="/clienti">
        <div>conținut</div>
      </AppShell>,
    );

    const user = userEvent.setup();
    await user.tab();
    expect(screen.getByRole("link", { name: "Sari la conținut" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "WorkOS" })).toHaveFocus();
  });
});
