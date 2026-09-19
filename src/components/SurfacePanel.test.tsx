import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SurfacePanel } from "./SurfacePanel";

describe("SurfacePanel", () => {
  it("places title, status, meta, and action in predictable header slots", () => {
    render(
      <SurfacePanel
        title="Cereri ale clientului"
        description="Deschide o cerere existentă."
        status={<span>Activ</span>}
        meta="3 cereri"
        action={<button type="button">Creează</button>}
      >
        Corp
      </SurfacePanel>,
    );

    const header = document.querySelector(".ui-panel__header");
    expect(header).not.toBeNull();
    expect(header?.querySelector(".ui-panel__title")).toHaveTextContent(
      "Cereri ale clientului",
    );
    expect(header?.querySelector(".ui-panel__description")).toHaveTextContent(
      "Deschide o cerere existentă.",
    );
    expect(header?.querySelector(".ui-panel__status")).toHaveTextContent("Activ");
    expect(header?.querySelector(".ui-panel__meta")).toHaveTextContent("3 cereri");
    expect(screen.getByRole("button", { name: "Creează" })).toBeInTheDocument();
  });

  it("does not reserve a title header when the panel is untitled", () => {
    render(
      <SurfacePanel variant="flush" label="Listă clienți">
        <p>Corp</p>
      </SurfacePanel>,
    );

    expect(document.querySelector(".ui-panel__header")).toBeNull();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Listă clienți")).toBeInTheDocument();
  });
});
