import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ConfigurationComponentDetails } from "../api/types";
import { ConfigurationTechnicalDetails } from "./ConfigurationTechnicalDetails";

const details: ConfigurationComponentDetails = {
  componentId: "LIGHTING", label: "Electrică / iluminare", typeId: "LIGHTING_FRONT_LED", calculationLabel: "Calculat",
  facts: [
    { id: "pitch", label: "Pas LED", value: "80 mm", kind: "TECHNICAL_SETTING", sourceLabel: "Setare organizație · versiunea 2" },
    { id: "quantity", label: "Module LED", value: "157 buc", kind: "CALCULATED", sourceLabel: "Calcul tehnic pentru configurația curentă" },
  ],
  inputFields: [{ fieldId: "opaque-input-id", label: "Perimetru confirmat", componentLabel: "Cant", value: "12.500 mm" }],
  unavailable: [], hasTechnicalSettings: true, hasFormulas: true,
};

describe("ConfigurationTechnicalDetails", () => {
  it("reads server facts, provenance and scoped administration links without editable setting inputs", async () => {
    const edit = vi.fn();
    render(<ConfigurationTechnicalDetails details={details} onEditField={edit} />);
    expect(screen.getByText("157 buc")).toBeVisible();
    expect(screen.getByText("Setare organizație · versiunea 2")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Setări tehnice" })).toHaveAttribute("href", "/admin/technical?component=LIGHTING_FRONT_LED");
    await userEvent.click(screen.getByRole("button", { name: "Modifică Perimetru confirmat" }));
    expect(edit).toHaveBeenCalledWith("opaque-input-id");
  });

  it("hides stale calculations and input values while refreshing or after an error", () => {
    const { rerender } = render(<ConfigurationTechnicalDetails details={details} state="pending" />);
    expect(screen.queryByText("157 buc")).not.toBeInTheDocument();
    expect(screen.queryByText(/12.500 mm/)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("se actualizează");
    rerender(<ConfigurationTechnicalDetails details={details} state="unavailable" />);
    expect(screen.queryByText("157 buc")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Reîncearcă");
    rerender(<ConfigurationTechnicalDetails details={details} />);
    expect(screen.getByText("157 buc")).toBeVisible();
  });
});
