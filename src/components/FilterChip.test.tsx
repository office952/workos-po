import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterChip } from "./FilterChip";

describe("FilterChip", () => {
  it("exposes aria-pressed for the selected filter", async () => {
    const onClick = vi.fn();
    render(<FilterChip label="Nouă" pressed onClick={onClick} />);
    const chip = screen.getByRole("button", { name: "Nouă" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await userEvent.setup().click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps an unpressed chip interactive and a disabled chip native", () => {
    const onClick = vi.fn();
    const { rerender } = render(<FilterChip label="Toate" pressed={false} onClick={onClick} />);
    expect(screen.getByRole("button", { name: "Toate" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    rerender(<FilterChip label="Toate" pressed={false} disabled onClick={onClick} />);
    expect(screen.getByRole("button", { name: "Toate" })).toBeDisabled();
  });
});
