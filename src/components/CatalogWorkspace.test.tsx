import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogWorkspace } from "./CatalogWorkspace";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

describe("CatalogWorkspace", () => {
  it("keeps the hidden family rail inert at 768", () => {
    stubMatchMedia(true);
    render(
      <CatalogWorkspace
        families={["Litere"]}
        selectedFamily="all"
        allLabel="Toate"
        onSelectFamily={() => {}}
      >
        <p>listă</p>
      </CatalogWorkspace>,
    );

    expect(document.querySelector(".context-rail")).toHaveAttribute("inert");
    expect(screen.getByLabelText("Familie")).toBeInTheDocument();
  });

  it("keeps the family rail interactive at desktop width", () => {
    stubMatchMedia(false);
    render(
      <CatalogWorkspace
        families={["Litere"]}
        selectedFamily="all"
        allLabel="Toate"
        onSelectFamily={() => {}}
      >
        <p>listă</p>
      </CatalogWorkspace>,
    );

    expect(document.querySelector(".context-rail")).not.toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Toate" })).toBeEnabled();
  });
});
