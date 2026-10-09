import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ConfigurationWorkAreas, type ConfigurationWorkArea } from "./ConfigurationWorkAreas";

function Harness({ disabled = false }: { disabled?: boolean }) {
  const [selected, select] = useState<ConfigurationWorkArea>("configuration");
  return <ConfigurationWorkAreas selected={selected} onSelect={select} disabled={disabled} />;
}

describe("ConfigurationWorkAreas", () => {
  it("moves selection and focus with arrow keys, Home and End", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    screen.getByRole("tab", { name: "Configurație" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Verificare" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Verificare" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Pregătire ofertă" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Configurație" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Pregătire ofertă" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Configurație" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Verificare" })).toHaveAttribute("tabindex", "-1");
  });

  it("locks area changes during a protected operation", async () => {
    render(<Harness disabled />);
    await userEvent.click(screen.getByRole("tab", { name: "Pregătire ofertă" }));
    expect(screen.getByRole("tab", { name: "Pregătire ofertă" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Configurație" })).toHaveAttribute("aria-selected", "true");
  });
});
