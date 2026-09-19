import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineAlert, inlineAlertRole } from "./InlineAlert";

describe("InlineAlert", () => {
  it("uses alert for error and blocked consequence", () => {
    expect(inlineAlertRole("error")).toBe("alert");
    expect(inlineAlertRole("blocked")).toBe("alert");
    render(
      <InlineAlert tone="blocked" title="Context incomplet">
        Catalogul are nevoie de un client.
      </InlineAlert>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Context incomplet");
  });

  it("uses status for pending and success", () => {
    expect(inlineAlertRole("pending")).toBe("status");
    expect(inlineAlertRole("success")).toBe("status");
    render(
      <InlineAlert tone="success" title="Tarif salvat">
        Valoarea vine de la server.
      </InlineAlert>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Tarif salvat");
  });
});
