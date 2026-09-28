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
    expect(screen.queryByLabelText("Aspect")).not.toBeInTheDocument();
    expect(document.querySelector(".app-shell__context")).toBeNull();
    expect(screen.getByRole("link", { name: "Clienți" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("navigation", { name: "Navigare principală" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Cont" }));
    expect(screen.getByText("owner@example.test")).toBeInTheDocument();
    expect(screen.getByLabelText("Aspect")).toBeInTheDocument();
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
    expect(screen.queryByRole("link", { name: "Catalog" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oferte" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Lucrări" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Planificare" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Atelier" })).toBeInTheDocument();
    expect(document.querySelector(".app-shell__nav-kicker")).toBeNull();
    expect(screen.queryByText("Comercial")).not.toBeInTheDocument();
    expect(screen.queryByText("Operațiuni")).not.toBeInTheDocument();
    expect(document.querySelector(".app-shell__bar")).toHaveAttribute(
      "data-shell-contract",
      "fixed-height-multirow",
    );
    expect(screen.queryByRole("button", { name: "Mai multe" })).not.toBeInTheDocument();

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

  it("keeps contextual routes current without putting Catalog in the primary row", () => {
    const { rerender } = render(
      <AppShell contextLabel="Cereri" mode="slice" currentHref="/cereri/req-1">
        <div>conținut</div>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Cereri" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Clienți" })).not.toHaveAttribute("aria-current");

    rerender(
      <AppShell contextLabel="Client" mode="slice" currentHref="/clienti/cus-1">
        <div>conținut</div>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Clienți" })).toHaveAttribute("aria-current", "page");

    rerender(
      <AppShell contextLabel="Execuție" mode="slice" currentHref="/executie/plan-1">
        <div>conținut</div>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Atelier" })).toHaveAttribute("aria-current", "page");

    rerender(
      <AppShell contextLabel="Catalog" mode="slice" currentHref="/catalog?customer=cus-1&request=req-1">
        <div>conținut</div>
      </AppShell>,
    );
    expect(screen.queryByRole("link", { name: "Catalog" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cereri" })).not.toHaveAttribute("aria-current");
  });

  it("opens Mai multe from ArrowDown only when items exceed the fixed wrap capacity", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("app-shell__nav-row") ? 200 : 0;
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-nav-probe") || this.hasAttribute("data-nav-more-probe")) {
        return 80;
      }
      return 0;
    });

    render(
      <AppShell contextLabel="Clienți" mode="slice" currentHref="/oferte">
        <div>conținut</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Clienți" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cereri" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Oferte" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lucrări" })).not.toBeInTheDocument();
    const more = screen.getByRole("button", { name: "Mai multe" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    more.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Lucrări" })).toHaveFocus();
    expect(screen.queryByRole("menuitem", { name: "Catalog" })).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Planificare" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Administrare" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("menuitem", { name: "Lucrări" })).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "Administrare" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();
  });

  it("keeps a fixed multi-row shell height contract", () => {
    render(
      <AppShell contextLabel="Clienți" mode="slice" currentHref="/clienti">
        <div>conținut</div>
      </AppShell>,
    );
    const bar = document.querySelector(".app-shell__bar");
    expect(bar).toHaveAttribute("data-shell-contract", "fixed-height-multirow");
    expect(document.querySelector(".app-shell")).toHaveAttribute("data-nav-mode", "wrap");
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
