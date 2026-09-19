import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("always exposes the supplied status text", () => {
    render(<StatusBadge label="Pregătit" tone="ready" />);
    expect(screen.getByText("Pregătit")).toBeInTheDocument();
  });

  it("does not invent a label from the tone", () => {
    const { container } = render(<StatusBadge label="În lucru" tone="pending" />);
    expect(container.textContent).toBe("În lucru");
  });
});
