import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WorklistRow } from "./WorklistRow";

describe("WorklistRow", () => {
  it("keeps identity, context, and action in one row", () => {
    render(
      <WorklistRow
        href="/cereri/1"
        identity="Litere recepție"
        identityDetail="Atelier Nord"
        context="Produs neales"
        actionLabel="Completează"
      />,
    );
    const row = screen.getByRole("link", { name: /Litere recepție/ });
    expect(row).toHaveAttribute("href", "/cereri/1");
    expect(row).toHaveTextContent("Produs neales");
    expect(row).toHaveTextContent("Completează");
  });

  it("exposes optional support and meta slots on registry rows", () => {
    render(
      <WorklistRow
        variant="registry"
        href="/cereri/1"
        identity="Litere recepție"
        context="Atelier Nord"
        support="Produs neales"
        meta="17.09.2026, 10:00"
        actionLabel="Completează"
      />,
    );
    const row = screen.getByRole("link", { name: /Litere recepție/ });
    expect(row).toHaveTextContent("Produs neales");
    expect(row).toHaveTextContent("17.09.2026, 10:00");
  });

  it("uses aria-current only for a navigation current destination", () => {
    render(
      <WorklistRow
        href="/clienti/1"
        current
        identity="Atelier Nord"
        context="Cluj"
        actionLabel="Deschide"
      />,
    );

    expect(screen.getByRole("link", { name: /Atelier Nord/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("uses aria-pressed for in-page selection, not aria-current", () => {
    render(
      <WorklistRow
        variant="compact"
        selected
        onSelect={() => undefined}
        identity="Profil aluminiu"
        context="3,00 EUR"
      />,
    );

    const row = screen.getByRole("button", { name: /Profil aluminiu/ });
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(row).not.toHaveAttribute("aria-current");
  });

  it("separates object identity from the named next action without nesting", () => {
    render(
      <WorklistRow
        variant="registry"
        detailHref="/cereri/req-1"
        actionHref="/quotes/PRD/q-1"
        identity="CRQ-104"
        context="Atelier Nord"
        actionLabel="Deschide oferta"
      />,
    );

    const objectLink = screen.getByRole("link", { name: "CRQ-104" });
    const actionLink = screen.getByRole("link", { name: "Deschide oferta" });
    expect(objectLink).toHaveAttribute("href", "/cereri/req-1");
    expect(actionLink).toHaveAttribute("href", "/quotes/PRD/q-1");
    expect(objectLink.contains(actionLink)).toBe(false);
    expect(actionLink.contains(objectLink)).toBe(false);
  });

  it("keeps a command action as a button, not a second destination", async () => {
    const onAction = vi.fn();
    render(
      <WorklistRow
        detailHref="/oferte/q-1"
        actionCommand={onAction}
        identity="OF-1"
        actionLabel="Marchează acceptată"
      />,
    );

    expect(screen.getByRole("link", { name: "OF-1" })).toHaveAttribute("href", "/oferte/q-1");
    await userEvent.setup().click(screen.getByRole("button", { name: "Marchează acceptată" }));
    expect(onAction).toHaveBeenCalledOnce();
  });
});
