import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("renders a semantic button", () => {
    render(<Button>Continuă configurarea</Button>);
    expect(
      screen.getByRole("button", { name: "Continuă configurarea" }),
    ).toBeInTheDocument();
  });

  it("keeps native disabled on the outer hit target", () => {
    render(
      <Button variant="primary" disabled>
        Continuă configurarea
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Continuă configurarea" });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("hit");
    expect(button.querySelector(".button--primary")).not.toBeNull();
  });

  it("stays natively enabled when not disabled", () => {
    render(<Button variant="primary">Continuă configurarea</Button>);
    expect(
      screen.getByRole("button", { name: "Continuă configurarea" }),
    ).toBeEnabled();
  });

  it("forwards aria-busy for a pending consumer without a new variant", () => {
    render(
      <Button variant="primary" disabled aria-busy="true">
        Confirmă
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Confirmă" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
