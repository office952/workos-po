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
    expect(screen.getByTestId("internal-cost")).toHaveTextContent("Incomplet");
    expect(screen.getByTestId("internal-cost")).not.toHaveTextContent("0,00 EUR");
  });

  it("does not present an unknown partial cost as zero", () => {
    render(
      <CommercialPricePanel
        commercial={{
          netPrice: null,
          vatPercent: 21,
          vatAmount: null,
          grossPrice: null,
          currency: "EUR",
          completeness: "PARTIAL",
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
        }}
        internalTotal={0}
        internalCurrency="EUR"
        internalCompleteness="PARTIAL"
        showCustomerPrice={false}
      />,
    );

    expect(screen.getByTestId("internal-cost")).toHaveTextContent("Incomplet");
    expect(screen.getByTestId("internal-cost")).not.toHaveTextContent("0,00 EUR");
  });

  it("marks a calculable unverified cost as estimated, not missing", () => {
    render(
      <CommercialPricePanel
        commercial={{
          netPrice: 521.1,
          vatPercent: 21,
          vatAmount: 109.43,
          grossPrice: 630.53,
          currency: "EUR",
          completeness: "COMPLETE",
          unavailableReasons: [],
          internalCost: 386,
          internalCostCurrency: "EUR",
          internalCostCompleteness: "COMPLETE",
          markupPercent: 35,
          markupAmount: 135.1,
          discountPercent: 0,
          discountAmount: 0,
          adjustmentAmount: 0,
          marginAmount: 135.1,
          calculationStatus: "CALCULABLE",
          verificationStatus: "NEEDS_VERIFICATION",
        }}
        internalTotal={386}
        internalCurrency="EUR"
        internalCompleteness="COMPLETE"
        calculationStatus="CALCULABLE"
        verificationStatus="NEEDS_VERIFICATION"
        showCustomerPrice={false}
      />,
    );

    expect(screen.getByTestId("internal-cost")).toHaveTextContent("Cost intern estimat");
    expect(screen.getByTestId("internal-cost")).toHaveTextContent("386,00 EUR");
    expect(screen.getByTestId("internal-cost")).toHaveTextContent("Calculat");
    expect(screen.getByTestId("internal-cost")).toHaveTextContent("Necesită verificare");
    expect(screen.getByTestId("internal-cost")).not.toHaveTextContent("Incomplet");
  });
});
