import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
