import { readFileSync } from "node:fs";
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    await waitFor(() => expect(screen.getByLabelText("Denumire")).toHaveFocus());
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
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("keeps Tab inside the dialog", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Client nou" }));
    const dialog = screen.getByRole("dialog", { name: "Client nou" });
    const close = within(dialog).getByRole("button", { name: "Închide formularul" });
    const input = screen.getByLabelText("Denumire");
    input.focus();
    expect(input).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab();
    expect(input).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("declares a visible :focus ring for programmatic focus inside the dialog", () => {
    const css = readFileSync("src/styles/layout/creation-dialog.css", "utf8");
    expect(css).toMatch(/\.creation-dialog :is\([^)]+\):focus/);
    expect(css).toMatch(/\[data-dialog-focus\]/);
    expect(css).toMatch(/box-shadow:/);
  });

  it("keeps its composition unless it is framed", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Client nou" }));
    const dialog = screen.getByRole("dialog", { name: "Client nou" });
    expect(dialog).not.toHaveAttribute("data-frame");
    expect(dialog.querySelector(".creation-dialog__body")).toBeNull();
  });

  it("puts a framed dialog's subtitle and notice with the title, and its content in the scrolling body", () => {
    render(
      <CreationDialog framed title="Asociază documentul" subtitle="Factură · F-1 · 20.11.2025" notice={<p>Se așteaptă răspunsul</p>} onDismiss={() => undefined}>
        <p>Conținut</p>
      </CreationDialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Asociază documentul" });
    expect(dialog).toHaveAttribute("data-frame");
    const header = dialog.querySelector<HTMLElement>(".creation-dialog__header")!;
    expect(within(header).getByText("Factură · F-1 · 20.11.2025")).toBeInTheDocument();
    expect(within(header).getByText("Se așteaptă răspunsul")).toBeInTheDocument();
    expect(within(dialog.querySelector<HTMLElement>(".creation-dialog__body")!).getByText("Conținut")).toBeInTheDocument();
  });

  it("keeps a pending operation open on cancel or close", async () => {
    render(<Harness busy />);
    await userEvent.click(screen.getByRole("button", { name: "Client nou" }));
    expect(screen.getByRole("button", { name: "Închide formularul" })).toBeDisabled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
  });
});
