import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JobEconomicsPanel } from "./JobEconomicsPanel";

/** Assembly & Production Supervision Coherence V1 · F-02 · planned vs actual for an assembly job. */

afterEach(() => {
  vi.unstubAllGlobals();
});

function serve(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

const line = (resourceId: string, groupLabel: string, plannedCost: number | null, operationalCost: number | null, unknownReason: string | null = null) => ({
  resourceId,
  label: resourceId.split("/")[1],
  groupLabel,
  unit: "buc",
  plannedQuantity: 1,
  actualQuantity: operationalCost === null ? null : 1,
  plannedCost,
  operationalCost,
  difference: plannedCost !== null && operationalCost !== null ? operationalCost - plannedCost : null,
  statusLabel: "",
  unknownReason,
});

describe("JobEconomicsPanel · assembly job", () => {
  it("groups the lines per part, keeps a shared resource once per part and an unknown cost unknown", async () => {
    serve({
      available: true,
      grouping: "PART",
      economics: {
        currency: "EUR",
        scopeLabel: "Panou ACM + litere + logo",
        excludedScopeLabel: null,
        revenue: { netPrice: 1050, label: "Preț net din comanda acceptată (fără TVA)" },
        estimatedCost: { total: 169, completeness: "PARTIAL", completenessLabel: "Parțial", acceptedIncomplete: true },
        operationalCost: { calculableTotal: 110, plannedComparableTotal: 115, differenceFromEstimate: -5, completeness: "PARTIAL", completenessLabel: "Parțial", calculableCount: 2, unavailableCount: 1 },
        confirmedCost: { status: "NOT_MODELLED", label: "Nu este înregistrat." },
        estimatedMargin: { value: null, unavailableReason: "Costul estimat nu este complet; marja estimată nu se poate calcula." },
        operationalMargin: { value: null, unavailableReason: "Costul operațional este parțial." },
        executionLabel: "În execuție: 4 din 9 operații finalizate",
        lines: [
          line("m-letters/MAT-LED-MODULE", "Litere · SHOWROOM", 88, 84),
          line("m-logo/MAT-LED-MODULE", "Logo · LUMEN LOGO", 27, 26),
          line("assembly/ANSAMBLARE:MOUNT", "Ansamblare", 55, null, "Timpul de ansamblare este înregistrat, dar nu este transformat în cost."),
        ],
        notes: [],
      },
    });
    render(<JobEconomicsPanel jobId="asmo:1" />);
    const panel = await screen.findByTestId("job-economics");
    const groups = within(panel).getAllByRole("columnheader").filter((cell) => cell.getAttribute("scope") === "colgroup");
    expect(groups.map((cell) => cell.textContent)).toEqual(["Litere · SHOWROOM", "Logo · LUMEN LOGO", "Ansamblare"]);
    // The same resource appears once under each part: two rows, never one merged row.
    expect(within(panel).getAllByText("MAT-LED-MODULE")).toHaveLength(2);
    expect(within(panel).getByText("Timpul de ansamblare este înregistrat, dar nu este transformat în cost.")).toBeInTheDocument();
    expect(within(panel).getByText("Acceptată cu cost intern incomplet")).toBeInTheDocument();
    // The assembly operation has a frozen estimate and no operational cost: shown as unknown, not 0,00.
    expect(within(panel).queryByText(/^0,00/)).not.toBeInTheDocument();
  });

  it("says the comparison is unavailable for an order accepted before cost lines were retained", async () => {
    serve({
      available: false,
      reason: "Comanda a fost acceptată înainte ca liniile de cost ale părților să fie păstrate. Comparația nu este disponibilă pentru această lucrare.",
    });
    render(<JobEconomicsPanel jobId="asmo:old" />);
    expect(await screen.findByText(/Comparația nu este disponibilă pentru această lucrare/)).toBeInTheDocument();
    expect(screen.queryByTestId("job-economics")).not.toBeInTheDocument();
    expect(screen.queryByText(/0,00/)).not.toBeInTheDocument();
  });
});
