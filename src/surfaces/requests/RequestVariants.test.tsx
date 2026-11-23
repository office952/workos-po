import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { QuoteVariantView } from "../../adapters/quoteVariantAdapter";
import { resetResourceCache } from "../../data/resourceCache";
import { RequestVariants } from "./RequestVariants";

function variant(overrides: Partial<QuoteVariantView> = {}): QuoteVariantView {
  return {
    variantId: "var-1",
    requestId: "req-1",
    indexLabel: "01",
    productCode: "PRD-A",
    productLabel: "Litere volumetrice",
    inscription: "VITRINA",
    alternativeOfIndexLabel: null,
    lifecycle: "ACTIVE",
    version: 3,
    state: "AWAITING_PRICE",
    stateLabel: "Așteaptă prețul",
    action: "OPEN",
    actionLabel: "Deschide",
    needsAction: false,
    missingCount: 0,
    confirmedAt: "2026-11-22T10:00:00.000Z",
    confirmedByLabel: "ana@demo.test",
    priceVisible: false,
    netPrice: null,
    priceForConfirmedConfiguration: false,
    priceSetByLabel: null,
    canSetPrice: false,
    priceBlockedReason: null,
    grossPrice: null,
    currency: null,
    installationNetPrice: null,
    approval: null,
    notes: null,
    quoteSnapshotId: null,
    updatedAt: "2026-11-22T10:00:00.000Z",
    updatedByLabel: "ana@demo.test",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

describe("RequestVariants", () => {
  it("lists only variants without an issued quote, with the server's state and single action", () => {
    render(
      <RequestVariants
        requestId="req-1"
        customerId="cus-1"
        canWork
        variants={[
          variant(),
          variant({ variantId: "var-2", indexLabel: "02", alternativeOfIndexLabel: "01", state: "IN_PROGRESS", stateLabel: "În lucru · lipsesc 2 informații", action: "CONTINUE", actionLabel: "Continuă", needsAction: true, confirmedByLabel: null }),
          variant({ variantId: "var-3", indexLabel: "03", quoteSnapshotId: "quote-1", state: "ISSUED", stateLabel: "Ofertă emisă" }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Variante de ofertă în lucru · 2" })).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    // The Comercial without the price right is told who sets the price; no price is shown.
    expect(within(rows[0]).getByText(/Așteaptă prețul · confirmată de ana@demo.test · îl stabilește Proprietarul/)).toBeInTheDocument();
    expect(within(rows[0]).getByRole("link", { name: "Deschide" })).toHaveAttribute(
      "href",
      "/configurator?customer=cus-1&request=req-1&product=PRD-A&varianta=var-1&pas=pret",
    );
    // An alternative is named explicitly, so it is never read as a cumulative product.
    expect(within(rows[1]).getByText(/alternativă la 01/)).toBeInTheDocument();
    expect(within(rows[1]).getByRole("link", { name: "Continuă" })).toHaveAttribute(
      "href",
      "/configurator?customer=cus-1&request=req-1&product=PRD-A&varianta=var-2",
    );
  });

  it("opens a confirmed variant on its review for whoever sets the price, and shows the price only when the server sent one", () => {
    render(
      <RequestVariants
        requestId="req-1"
        customerId="cus-1"
        canWork
        variants={[
          variant({ action: "SET_PRICE", actionLabel: "Stabilește prețul", needsAction: true, canSetPrice: true }),
          variant({ variantId: "var-2", indexLabel: "02", state: "PRICE_SET", stateLabel: "Preț stabilit", action: "ISSUE", actionLabel: "Emite oferta", needsAction: true, priceVisible: true, netPrice: 1000, grossPrice: 1210, currency: "EUR", canSetPrice: true }),
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: "Stabilește prețul" })).toHaveAttribute(
      "href",
      "/configurator?customer=cus-1&request=req-1&product=PRD-A&varianta=var-1&pas=verificare",
    );
    expect(screen.getByText(/1\.210,00.*cu TVA/)).toBeInTheDocument();
  });

  it("gives a role that cannot work on variants no write action, and nothing when there is no open variant", () => {
    const { rerender } = render(<RequestVariants requestId="req-1" customerId="cus-1" canWork={false} variants={[variant()]} />);
    expect(screen.queryByRole("button", { name: "Adaugă o alternativă" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retrage" })).not.toBeInTheDocument();
    rerender(<RequestVariants requestId="req-1" customerId="cus-1" canWork variants={[]} />);
    expect(screen.queryByTestId("request-variants")).not.toBeInTheDocument();
  });

  it("withdraws with the version it saw and shows the server's refusal", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: async () => ({ error: "version_conflict", reasons: ["mihai@demo.test a modificat această variantă. Valorile tale nu au fost salvate."] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<RequestVariants requestId="req-1" customerId="cus-1" canWork variants={[variant()]} />);
    await userEvent.click(screen.getByRole("button", { name: "Retrage" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/requests/req-1/variants/var-1/lifecycle");
    expect(JSON.parse(String(init.body))).toEqual({ expectedVersion: 3, lifecycle: "WITHDRAWN" });
    expect(await screen.findByText(/mihai@demo.test a modificat această variantă/)).toBeInTheDocument();
  });
});
