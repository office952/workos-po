import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlicePage } from "./SlicePage";

describe("SlicePage", () => {
  it("assigns a client registry to the shared registry layout", () => {
    render(
      <SlicePage contextLabel="Clienți" currentHref="/clienti" title="Clienți" layout="REGISTRY">
        <div>list</div>
        <div>rail</div>
      </SlicePage>,
    );

    const workspace = document.querySelector(".page-workspace");
    expect(workspace).toHaveAttribute("data-layout", "REGISTRY");
    expect(workspace).toHaveAttribute("data-density", "compact");
    expect(workspace).not.toHaveAttribute("data-layout-variant");
    expect(workspace).not.toHaveAttribute("data-surface");
  });

  it("keeps object detail and operational queue as distinct layouts", () => {
    const { rerender } = render(
      <SlicePage
        contextLabel="Client"
        currentHref="/clienti/1"
        title="Client"
        layout="OBJECT_DETAIL"
        variant="standard"
      >
        <div>detail</div>
      </SlicePage>,
    );
    expect(document.querySelector(".page-workspace")).toHaveAttribute("data-layout", "OBJECT_DETAIL");
    expect(document.querySelector(".page-workspace")).toHaveAttribute("data-layout-variant", "standard");
    expect(document.querySelector(".page-workspace")).toHaveAttribute("data-density", "standard");

    rerender(
      <SlicePage
        contextLabel="Atelier"
        currentHref="/atelier"
        title="Atelier"
        layout="OPERATIONAL"
        variant="queue"
      >
        <div>gate</div>
      </SlicePage>,
    );
    expect(document.querySelector(".page-workspace")).toHaveAttribute("data-layout", "OPERATIONAL");
    expect(document.querySelector(".page-workspace")).toHaveAttribute("data-layout-variant", "queue");
    expect(document.querySelector(".page-workspace")).toHaveAttribute("data-density", "operational");
  });

  it("assigns the configurator to the workbench, not a separate catalog layout", () => {
    render(
      <SlicePage
        contextLabel="Configurator"
        currentHref="/configurator"
        title="Configurator"
        layout="WORKBENCH"
      >
        <div>form</div>
        <div>rail</div>
      </SlicePage>,
    );

    const workspace = document.querySelector(".page-workspace");
    expect(workspace).toHaveAttribute("data-layout", "WORKBENCH");
    expect(workspace).toHaveAttribute("data-density", "standard");
    expect(workspace).toHaveAttribute("data-floorplan", "form-configuration");
    expect(workspace?.className).not.toContain("floorplan");
    expect(workspace).not.toHaveAttribute("data-surface");
  });
});
