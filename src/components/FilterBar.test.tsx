import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "./FilterBar";

describe("FilterBar", () => {
  it("uses the shared field and filter-chip primitives", async () => {
    const onChipChange = vi.fn();
    render(
      <FilterBar
        searchId="cereri-cauta"
        searchLabel="Caută"
        searchValue=""
        onSearchChange={vi.fn()}
        chips={[
          { id: "all", label: "Toate" },
          { id: "new", label: "Nouă" },
        ]}
        selectedChip="new"
        onChipChange={onChipChange}
      />,
    );

    expect(screen.getByLabelText("Caută")).toHaveAttribute("id", "cereri-cauta");
    expect(screen.getByRole("button", { name: "Nouă" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Toate" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Toate" }));
    expect(onChipChange).toHaveBeenCalledWith("all");
  });

  it("places search before chips in toolbar variant with accessible hidden label", () => {
    const { container } = render(
      <FilterBar
        variant="toolbar"
        searchId="cereri-cauta"
        searchLabel="Caută"
        searchPlaceholder="Client, referință sau titlu"
        searchValue=""
        onSearchChange={vi.fn()}
        chips={[
          { id: "all", label: "Toate" },
          { id: "needs-action", label: "Necesită acțiune" },
        ]}
        selectedChip="all"
        onChipChange={vi.fn()}
        meta="11 cereri"
      />,
    );

    const bar = container.querySelector(".filter-bar--toolbar");
    expect(bar?.className).toContain("filter-bar--toolbar");
    const children = [...(bar?.children ?? [])].map((node) => node.className);
    expect(children[0]).toContain("filter-bar__search");
    expect(children[1]).toContain("filter-bar__chips");
    expect(children[2]).toContain("filter-bar__meta");
    expect(screen.getByText("11 cereri")).toBeInTheDocument();

    const search = screen.getByLabelText("Caută");
    expect(search).toHaveAttribute("placeholder", "Client, referință sau titlu");
    const label = container.querySelector('label[for="cereri-cauta"]');
    expect(label?.className).toContain("u-visually-hidden");
  });
});
