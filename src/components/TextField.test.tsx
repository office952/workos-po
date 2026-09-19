import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TextField } from "./TextField";

describe("TextField", () => {
  it("associates the label with the control", () => {
    render(
      <TextField id="width" label="Lățime" value="" onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Lățime")).toHaveAttribute("id", "width");
  });

  it("wires hint and error into describedby and aria-invalid", () => {
    render(
      <TextField
        id="width"
        label="Lățime"
        value="abc"
        hint="Milimetri"
        error="Introduce un număr"
        onChange={vi.fn()}
      />,
    );
    const control = screen.getByLabelText("Lățime");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAttribute("aria-describedby", "width-hint width-error");
    expect(screen.getByText("Milimetri")).toHaveAttribute("id", "width-hint");
    expect(screen.getByText("Introduce un număr")).toHaveAttribute("id", "width-error");
  });

  it("keeps a disabled control natively disabled", () => {
    render(
      <TextField id="pin" label="PIN" value="" disabled onChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("PIN")).toBeDisabled();
  });
});
