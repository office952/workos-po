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

  it("keeps one Administrare entry and uses Lucrări for workshop overview", () => {
    const { rerender } = render(
      <AppShell contextLabel="Administrare" mode="slice" currentHref="/admin/commercial">
        <div>conținut</div>
      </AppShell>,
    );

    const administration = screen.getByRole("link", { name: "Administrare" });
    expect(administration).toHaveAttribute("href", "/admin");
    expect(administration).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Planificare" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lucrări" })).toHaveAttribute("href", "/lucrari");
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

  it("switches modules on tablet from one sheet with every module, grouped", async () => {
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
      <AppShell contextLabel="Catalog" mode="slice" currentHref="/catalog">
        <div>conținut</div>
      </AppShell>,
    );

    expect(screen.queryByRole("navigation", { name: "Navigare principală" })).not.toBeInTheDocument();
    const switcher = screen.getByRole("button", { name: /Catalog/ });
    expect(switcher).toHaveTextContent("06");
    expect(switcher).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(switcher);
    expect(switcher).toHaveAttribute("aria-expanded", "true");
    const sheet = screen.getByRole("navigation", { name: "Navigare principală" });
    expect(sheet).toHaveTextContent("Comercial");
    expect(sheet).toHaveTextContent("Operațiuni");
    expect(sheet).toHaveTextContent("Administrare");
    expect(screen.getByRole("link", { name: "Catalog" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Oferte" })).toHaveAttribute("href", "/oferte");
    await userEvent.keyboard("{Escape}");
    expect(switcher).toHaveAttribute("aria-expanded", "false");
    expect(switcher).toHaveFocus();
  });

  it("keeps the phone band to the current module and opens all modules on demand", async () => {
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

    expect(screen.queryByRole("link", { name: "Clienți" })).not.toBeInTheDocument();
    const switcher = screen.getByRole("button", { name: /Cereri/ });
    await userEvent.keyboard("{Tab}");
    switcher.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("link", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Atelier" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cereri" })).toHaveAttribute("aria-current", "page");
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
