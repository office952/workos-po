import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("places organization, account, and aspect together", async () => {
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
    expect(screen.getByText("Proprietar")).toBeInTheDocument();
    expect(screen.queryByText("org:a")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cont" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ieși din cont" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Schimbă prezentarea WorkOS" })).not.toBeInTheDocument();
    expect(document.querySelector(".app-shell__context")).toBeNull();
    expect(screen.getByRole("link", { name: "Clienți" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Navigare principală" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cont" }));
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Schimbă prezentarea WorkOS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ieși din cont" })).toBeInTheDocument();
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

  it("keeps mid-width overflow destinations under Mai multe", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) =>
        ({
          matches: query === "(max-width: 1151px)",
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
          onchange: null,
        }) as MediaQueryList,
      ),
    });

    render(
      <AppShell contextLabel="Clienți" mode="slice" currentHref="/catalog">
        <div>conținut</div>
      </AppShell>,
    );

    expect(document.querySelector(".app-shell__nav-compact")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Clienți" })).toBeInTheDocument();
    const more = screen.getByRole("button", { name: "Mai multe" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Catalog" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("menuitem", { name: "Oferte" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();
  });

  it("keeps only the current destination plus overflow on phone", async () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: vi.fn((query: string) =>
        ({
          matches: true,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
          onchange: null,
        }) as MediaQueryList,
      ),
    });

    render(
      <AppShell contextLabel="Cereri" mode="slice" currentHref="/cereri">
        <div>conținut</div>
      </AppShell>,
    );

    expect(document.querySelector(".app-shell__nav-mobile")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Cereri" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Clienți" })).not.toBeInTheDocument();

    const more = screen.getByRole("button", { name: "Mai multe" });
    await userEvent.click(more);
    expect(screen.getByRole("menuitem", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Atelier" })).toBeInTheDocument();
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
