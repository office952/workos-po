import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./PageHeader";

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
  });

  it("does not repeat an eyebrow that matches the title", () => {
    render(<PageHeader eyebrow="Cereri" title="Cereri" lead="Deschide cererea." />);
    expect(screen.getByRole("heading", { name: "Cereri" })).toBeInTheDocument();
    expect(document.querySelector(".page-header__eyebrow")).toBeNull();
  });
});
