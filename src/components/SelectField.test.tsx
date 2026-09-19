import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SelectField } from "./SelectField";

const people = [
  { value: "per:andrei", label: "Andrei Goghi" },
  { value: "per:calin", label: "Calin Cimpean" },
];

describe("SelectField", () => {
  it("associates the label with the native select", () => {
    render(
      <SelectField
        id="operator-person"
        label="Persoană"
        value="per:andrei"
        options={people}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Persoană")).toHaveAttribute("id", "operator-person");
    expect(screen.getByLabelText("Persoană").tagName).toBe("SELECT");
  });

  it("wires describedby when hint or error is present", () => {
    render(
      <SelectField
        id="family"
        label="Familie"
        value=""
        hint="Din catalog"
        error="Alege o familie"
        options={[{ value: "acm", label: "ACM" }]}
        onChange={vi.fn()}
      />,
    );
    const control = screen.getByLabelText("Familie");
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAttribute("aria-describedby", "family-hint family-error");
  });
});
