import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SkipLink } from "./SkipLink";

describe("SkipLink", () => {
  it("points at the main landmark", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link", { name: "Sari la conținut" })).toHaveAttribute(
      "href",
      "#continut-principal",
    );
  });
});
