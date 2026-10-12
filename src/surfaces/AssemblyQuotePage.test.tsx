import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssemblyQuotePage } from "./AssemblyQuotePage";
import { resetResourceCache } from "../data/resourceCache";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
});

const item = {
  quoteSnapshotId: "asmq:1",
  kind: "ASSEMBLY",
  kindLabel: "Ansamblu",
  assemblyId: "asm:1",
  sectionCount: 2,
  superseded: false,
  productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
  productLabel: "Panou ACM + litere volumetrice",
  reference: "OF-ASM",
  customerDisplayName: "Client Ansamblu",
  requestId: "crq:1",
  requestReference: "CRQ-7",
  stage: "ORDER_CREATED",
  stageLabel: "Cu comandă",
  nextAction: "OPEN_ORDER",
  orderSnapshotId: "asmo:1",
};

function section(memberId: string, roleLabel: string, netPrice: number, vatAmount: number) {
  return {
    memberId,
    roleLabel,
    productLabel: roleLabel,
    inscription: "WORKOS",
    netPrice,
    vatPercent: 21,
    vatAmount,
    grossPrice: Math.round((netPrice + vatAmount) * 100) / 100,
    currency: "EUR",
  };
}

const assemblyQuote = {
  label: "Panou ACM + litere volumetrice",
  assemblyId: "asm:1",
  requestId: "crq:1",
  superseded: false,
  sections: [section("m-acm", "Panou ACM", 98.07, 20.59), section("m-letters", "Litere", 516.38, 108.44)],
  serviceSection: null,
  totals: { netPrice: 614.45, vatAmount: 129.03, grossPrice: 743.48, currency: "EUR" },
  orderSnapshotId: "asmo:1",
  productionSnapshotId: "asmp:1",
};

function stub(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

describe("AssemblyQuotePage", () => {
  it("shows two traceable sections, totals and links without mutation commands", async () => {
    stub({ quote: item, assemblyQuote });
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    const acm = await screen.findByLabelText("Panou ACM");
    expect(within(acm).getByText("118,66 EUR")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Litere")).getByText("624,82 EUR")).toBeInTheDocument();
    expect(screen.getByText("743,48 EUR")).toBeInTheDocument();
    expect(screen.getByText("Acceptată — comandă creată")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deschide cererea" })).toHaveAttribute("href", "/cereri/crq%3A1");
    expect(screen.getByRole("link", { name: "Deschide ansamblul" })).toHaveAttribute("href", "/ansamblu?assembly=asm%3A1");
    expect(screen.getByRole("link", { name: "Deschide comanda" })).toHaveAttribute("href", "/lucrari/asmo%3A1");
    expect(screen.queryByRole("button", { name: /Accept|Creează|Pregătește/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cost intern/)).not.toBeInTheDocument();
  });

  it("shows owner cost evidence as PARTIAL with the missing inputs", async () => {
    stub({
      quote: item,
      assemblyQuote,
      internalCost: {
        sourceLabel: "Comanda înghețată",
        sections: [
          { memberId: "m-acm", roleLabel: "Panou ACM", total: 72.64, currency: "EUR", completeness: "COMPLETE", completenessLabel: "Complet" },
        ],
        production: {
          total: 440.14,
          currency: "EUR",
          completeness: "PARTIAL",
          completenessLabel: "Parțial",
          unpricedOperations: [
            { processLabel: "Montaj litere pe panou", missingInputs: ["Rețetă de cost pentru operație"] },
          ],
        },
        productionPending: false,
      },
    });
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    expect(await screen.findByText(/Cost intern · evidență/)).toBeInTheDocument();
    expect(screen.getByText("Costul intern nu este preț de vânzare.")).toBeInTheDocument();
    expect(screen.getByText("440,14 EUR · Parțial")).toBeInTheDocument();
    expect(screen.getByText(/Montaj litere pe panou: lipsește rețetă de cost pentru operație/)).toBeInTheDocument();
  });

  it("flags a superseded version", async () => {
    stub({ quote: { ...item, superseded: true }, assemblyQuote: { ...assemblyQuote, superseded: true } });
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    expect(await screen.findByText("Versiune înlocuită")).toBeInTheDocument();
  });
});
