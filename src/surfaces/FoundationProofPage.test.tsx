import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FoundationProofPage } from "./FoundationProofPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("FoundationProofPage", () => {
  it("fails closed when health has no contract identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok", service: "workos-final-api" }),
      }),
    );

    render(<FoundationProofPage />);

    expect(
      await screen.findByText("Contract API incompatibil"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Acțiunea principală rămâne indisponibilă deoarece contractul API nu este suportat.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Poți continua când contractul API este compatibil/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continuă configurarea" }),
    ).toBeDisabled();
  });

  it("keeps list rows keyboard reachable after a compatible health check", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ok",
          service: "workos-final-api",
          apiContractId: "workos-ui-contract-v1",
        }),
      }),
    );

    const user = userEvent.setup();
    render(<FoundationProofPage />);

    expect(await screen.findByText("Contract verificat")).toBeInTheDocument();
    const initial = document.querySelector('[data-object-id="CER-DEMO-0847"]');
    expect(initial).toHaveAttribute("aria-pressed", "true");
    expect(initial).not.toHaveAttribute("aria-current");
    await user.click(document.querySelector('[data-object-id="CER-DEMO-0842"]')!);
    expect(document.querySelector('[data-object-id="CER-DEMO-0842"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Continuă configurarea" }),
    ).toBeEnabled();
    expect(
      screen.getByText(/Acțiunea principală poate continua pentru acest obiect demonstrativ/),
    ).toBeInTheDocument();
    await user.click(document.querySelector('[data-object-id="CER-DEMO-0835"]')!);
    expect(screen.getByText(/Lipsește: Înălțimea literei/)).toBeInTheDocument();
  });
});
