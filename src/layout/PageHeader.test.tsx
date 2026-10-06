import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

function headerGeometry(root: HTMLElement = document.body) {
  const header = root.querySelector(".page-header");
  expect(header).not.toBeNull();
  return {
    contract: header?.getAttribute("data-page-header-contract"),
    className: header?.className ?? "",
    eyebrowEmpty: header?.querySelector(".page-header__eyebrow")?.getAttribute("data-empty"),
    leadEmpty: header?.querySelector(".page-header__lead")?.getAttribute("data-empty"),
    metaEmpty: header?.querySelector(".page-header__meta")?.getAttribute("data-empty"),
    statusEmpty: header?.querySelector(".page-header__status")?.getAttribute("data-empty"),
    actionEmpty: header?.querySelector(".page-header__action")?.getAttribute("data-empty"),
    hasAside: Boolean(header?.querySelector(".page-header__aside")),
  };
}

describe("PageHeader", () => {
  it("keeps one shared chrome with optional eyebrow, status, and a single action", () => {
    render(
      <PageHeader
        eyebrow="Cereri"
        title="Cereri de ofertă"
        lead="Deschide cererea."
        status={<span>Nouă</span>}
        action={<button type="button">Continuă</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Cereri de ofertă" })).toBeInTheDocument();
    expect(screen.getByText("Cereri", { selector: ".page-header__eyebrow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuă" })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(headerGeometry().contract).toBe("fixed");
  });

  it("does not repeat an eyebrow that matches the title", () => {
    render(<PageHeader eyebrow="Cereri" title="Cereri" lead="Deschide cererea." />);
    expect(screen.getByRole("heading", { name: "Cereri" })).toBeInTheDocument();
    expect(document.querySelector(".page-header__eyebrow")).toHaveAttribute("data-empty", "true");
  });

  it("keeps one geometry contract when eyebrow, lead, meta, status, and action are omitted", () => {
    const { rerender } = render(<PageHeader title="Cereri" />);
    const minimal = headerGeometry();
    expect(minimal.contract).toBe("fixed");
    expect(minimal.hasAside).toBe(true);
    expect(minimal.eyebrowEmpty).toBe("true");
    expect(minimal.leadEmpty).toBe("true");
    expect(minimal.metaEmpty).toBe("true");
    expect(minimal.statusEmpty).toBe("true");
    expect(minimal.actionEmpty).toBe("true");

    rerender(
      <PageHeader
        eyebrow="Cerere"
        title="CER-1"
        lead="Se încarcă detaliile."
        meta="Client demo"
        status={<span>Nouă</span>}
        action={<button type="button">Continuă</button>}
        quiet
      />,
    );
    const full = headerGeometry();
    expect(full.contract).toBe("fixed");
    expect(full.hasAside).toBe(true);
    expect(full.eyebrowEmpty).toBeNull();
    expect(full.leadEmpty).toBeNull();
    expect(full.metaEmpty).toBeNull();
    expect(full.statusEmpty).toBeNull();
    expect(full.actionEmpty).toBeNull();
    expect(full.className).toContain("page-header--quiet");
  });

  it("does not switch geometry when only quiet tone is applied", () => {
    const { rerender } = render(<PageHeader title="Planificare" lead="Efort pe zone." />);
    expect(headerGeometry().contract).toBe("fixed");
    rerender(<PageHeader title="Planificare" lead="Efort pe zone." quiet />);
    expect(headerGeometry().contract).toBe("fixed");
    expect(document.querySelector(".page-header")).toHaveClass("page-header--quiet");
  });
});
