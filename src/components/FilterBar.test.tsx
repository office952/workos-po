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
});
