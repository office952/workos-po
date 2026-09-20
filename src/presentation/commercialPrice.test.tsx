import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CommercialPricePanel } from "./commercialPrice";

describe("CommercialPricePanel", () => {
  it("does not treat a fabricated zero as the known internal cost when EIC still has a total", () => {
    render(
      <CommercialPricePanel
        commercial={{
          netPrice: 400,
          vatPercent: 21,
          vatAmount: 84,
          grossPrice: 484,
          currency: "EUR",
          completeness: "COMPLETE",
          unavailableReasons: [],
          internalCost: 0,
          internalCostCurrency: "EUR",
          internalCostCompleteness: "PARTIAL",
          markupPercent: 0,
          markupAmount: 0,
          discountPercent: 0,
          discountAmount: 0,
          adjustmentAmount: 0,
          marginAmount: null,
          policySource: "ORGANIZATION",
          commercialStrategy: "MANUAL_FIXED_PRODUCT",
        }}
        internalTotal={382.5}
        internalCurrency="EUR"
        internalCompleteness="PARTIAL"
        showCustomerPrice={false}
      />,
    );

    expect(screen.getByTestId("internal-cost")).toHaveTextContent("382,50 EUR");
    expect(screen.getByTestId("internal-cost")).toHaveTextContent("Parțial / incomplet");
    expect(screen.getByTestId("internal-cost")).not.toHaveTextContent("0,00 EUR");
  });
});
