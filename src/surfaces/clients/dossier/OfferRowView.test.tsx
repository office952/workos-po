import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QuoteListItemTransport } from "../../../api/types";
import { offerAmount } from "./history/branchChain";
import { OfferRowView } from "./OfferRowView";

/**
 * Rând ofertă (605:8715), shared by Cereri și oferte and the expanded project in Istoric: the list
 * cannot tell an amount hidden by permission from one not calculated, so a missing amount is
 * "Valoare indisponibilă" — never 0 — while an explicit 0 from the server stays an amount.
 */
const row = (amount: string | null) =>
  render(
    <ol>
      <OfferRowView amount={amount} reference="OF-1" title="Panou" created={null} tag={null} work={{ text: "Fără lucrare" }} attention={false} superseded={false} preview={null} openHref={null} />
    </ol>,
  );
const quote = (grossDisplay: string | null, currency: string | null) => ({ grossDisplay, currency }) as QuoteListItemTransport;

describe("Rând ofertă · the amount (605:8715)", () => {
  it("says „Valoare indisponibilă” when the list has no amount, claiming neither hidden nor uncalculated", () => {
    row(offerAmount(quote(null, "EUR")));
    expect(screen.getByText("Valoare indisponibilă")).toHaveAttribute("data-none", "true");
    expect(screen.queryByText(/calculat|ascuns|0,00/i)).toBeNull();
  });

  it("keeps an explicit zero from the server as an amount", () => {
    row(offerAmount(quote("0,00", "EUR")));
    expect(screen.getByText("0,00 EUR")).not.toHaveAttribute("data-none");
    expect(screen.queryByText("Valoare indisponibilă")).toBeNull();
  });
});
