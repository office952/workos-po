import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ThemeControl } from "./ThemeControl";

describe("ThemeControl", () => {
  it("uses the shared WorkOS light switch instead of a second theme selector", async () => {
    const user = userEvent.setup();
    localStorage.setItem("workos-color-scheme", "light");

    render(<ThemeControl />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const control = screen.getByRole("switch", { name: "Schimbă prezentarea WorkOS" });
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("LIGHT")).toBeInTheDocument();

    await user.click(control);

    expect(localStorage.getItem("workos-color-scheme")).toBe("dark");
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("DARK")).toBeInTheDocument();
  });
});
