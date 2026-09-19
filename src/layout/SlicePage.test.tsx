import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SlicePage } from "./SlicePage";

describe("SlicePage", () => {
  it("assigns collection-with-rail as a compact shared workspace", () => {
    render(
      <SlicePage
        contextLabel="Clienți"
        currentHref="/clienti"
        title="Clienți"
        workspace="collection-with-rail"
      >
        <div>list</div>
        <div>rail</div>
      </SlicePage>,
    );

    const workspace = document.querySelector(".page-workspace");
    expect(workspace?.className).toContain("page-workspace--collection-with-rail");
    expect(workspace?.className).toContain("page-workspace--density-compact");
    expect(workspace?.className).not.toContain("page-workspace--object");
  });

  it("keeps object and operational-gate as distinct shared families", () => {
    const { rerender } = render(
      <SlicePage contextLabel="Client" currentHref="/clienti/1" title="Client" workspace="object">
        <div>detail</div>
      </SlicePage>,
    );
    expect(document.querySelector(".page-workspace--object")).not.toBeNull();
    expect(document.querySelector(".page-workspace--density-standard")).not.toBeNull();

    rerender(
      <SlicePage
        contextLabel="Atelier"
        currentHref="/atelier"
        title="Atelier"
        workspace="operational-gate"
      >
        <div>gate</div>
      </SlicePage>,
    );
    expect(document.querySelector(".page-workspace--operational-gate")).not.toBeNull();
    expect(document.querySelector(".page-workspace--density-operational")).not.toBeNull();
  });

  it("assigns configuration as a standard object-width workspace, not catalog", () => {
    render(
      <SlicePage
        contextLabel="Configurator"
        currentHref="/configurator"
        title="Configurator"
        workspace="configuration"
      >
        <div>form</div>
        <div>rail</div>
      </SlicePage>,
    );

    const workspace = document.querySelector(".page-workspace");
    expect(workspace?.className).toContain("page-workspace--configuration");
    expect(workspace?.className).toContain("page-workspace--density-standard");
    expect(workspace?.className).not.toContain("page-workspace--catalog");
    expect(workspace?.className).not.toContain("floorplan");
  });
});
