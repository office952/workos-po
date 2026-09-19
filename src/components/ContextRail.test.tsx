import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ContextRail } from "./ContextRail";

describe("ContextRail", () => {
  it("keeps static items non-interactive and without aria-current", () => {
    render(
      <ContextRail
        label="Colecții"
        items={[{ id: "cost-evidence", label: "Dovezi de cost", selected: true }]}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-current]")).toBeNull();
    expect(document.querySelector(".context-rail__item--static")).toHaveTextContent(
      "Dovezi de cost",
    );
    expect(document.querySelector(".context-rail__item--marked")).not.toBeNull();
  });

  it("exposes pressed semantics and keyboard focus on interactive items", async () => {
    const onSelect = vi.fn();
    render(
      <ContextRail
        label="Familii"
        items={[
          { id: "all", label: "Toate", selected: true, onSelect },
          { id: "letters", label: "Litere", onSelect },
        ]}
      />,
    );

    const all = screen.getByRole("button", { name: "Toate" });
    const letters = screen.getByRole("button", { name: "Litere" });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(letters).toHaveAttribute("aria-pressed", "false");
    expect(all).not.toHaveAttribute("aria-current");

    await userEvent.setup().tab();
    expect(all).toHaveFocus();
    await userEvent.setup().keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalled();
  });

  it("uses aria-current only on a navigation current destination", () => {
    render(
      <ContextRail
        label="Context"
        items={[{ id: "client", label: "Client", href: "/clienti/1", current: true }]}
      />,
    );

    expect(screen.getByRole("link", { name: "Client" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
