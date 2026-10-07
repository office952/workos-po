import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CreationDialog } from "./CreationDialog";

function Harness({ busy = false }: { busy?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Client nou</button>
    {open ? <CreationDialog title="Client nou" busy={busy} onDismiss={() => setOpen(false)}>
      <label>Denumire<input /></label>
    </CreationDialog> : null}
  </>;
}

describe("CreationDialog", () => {
  it("focuses the input and restores the trigger when closed", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Client nou" });
    await userEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Client nou" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText("Denumire")).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Închide formularul" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("dismisses on native Escape cancellation and restores focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Client nou" });
    await userEvent.click(trigger);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps a pending operation open on cancel or close", async () => {
    render(<Harness busy />);
    await userEvent.click(screen.getByRole("button", { name: "Client nou" }));
    expect(screen.getByRole("button", { name: "Închide formularul" })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
  });
});
