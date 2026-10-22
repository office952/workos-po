import type { AssemblyQuoteTransport, QuoteSnapshotTransport } from "../api/types";
import { presentCustomerPrice } from "../presentation/customerPrice";
import type { QuoteLine, QuoteTotal } from "./quoteDetail";

/** Same total as the quote document: the frozen job total when the quote carries several lines. */
export function presentProductQuoteTotal(snapshot: QuoteSnapshotTransport): QuoteTotal | null {
  const product = presentCustomerPrice(snapshot.commercial);
  if (!snapshot.jobCommercial) {
    return product;
  }
  const job = presentCustomerPrice(snapshot.jobCommercial);
  return job ? { ...job, vatPercent: job.vatPercent ?? product?.vatPercent ?? null } : null;
}

function inscriptionLabel(productCode: string): string {
  return productCode === "PRD-LOGO-FRONTLIT-PLEXI-AL06" ? "Denumire logo" : "Text";
}

export function presentProductQuoteLines(snapshot: QuoteSnapshotTransport, total: QuoteTotal | null): QuoteLine[] {
  const inscription = snapshot.inscription
    ? `${inscriptionLabel(snapshot.productCode)}: ${snapshot.inscription}`
    : null;
  if (snapshot.offerLines.length === 0) {
    return [
      {
        key: "product",
        title: snapshot.productLabel,
        detail: inscription,
        netPrice: total?.netPrice ?? null,
        vatPercent: total?.vatPercent ?? null,
        vatAmount: total?.vatAmount ?? null,
        grossPrice: total?.grossPrice ?? null,
        currency: total?.currency ?? snapshot.currency ?? "EUR",
      },
    ];
  }
  return snapshot.offerLines.map((line) => ({
    key: `${line.kind}-${line.label}`,
    title: line.kind === "PRODUCT" ? snapshot.productLabel : line.label,
    detail: line.kind === "PRODUCT" ? inscription : null,
    netPrice: line.netPrice,
    vatPercent: null,
    vatAmount: null,
    grossPrice: null,
    currency: line.currency ?? "EUR",
  }));
}

function sharedVatPercent(quote: AssemblyQuoteTransport): number | null {
  const rates = new Set(quote.sections.map((section) => section.vatPercent));
  return rates.size === 1 ? [...rates][0] ?? null : null;
}

export function presentAssemblyQuoteTotal(quote: AssemblyQuoteTransport): QuoteTotal {
  return { ...quote.totals, vatPercent: sharedVatPercent(quote) };
}

export function presentAssemblyQuoteLines(quote: AssemblyQuoteTransport): QuoteLine[] {
  const sections: QuoteLine[] = quote.sections.map((section) => ({
    key: section.memberId,
    title: section.roleLabel,
    detail: [section.productLabel === section.roleLabel ? null : section.productLabel, section.inscription]
      .filter(Boolean)
      .join(" · ") || null,
    netPrice: section.netPrice,
    vatPercent: section.vatPercent,
    vatAmount: section.vatAmount,
    grossPrice: section.grossPrice,
    currency: section.currency,
  }));
  const service = quote.serviceSection;
  return service
    ? [
        ...sections,
        {
          key: "service",
          title: service.label,
          detail: "Serviciu",
          netPrice: service.netPrice,
          vatPercent: null,
          vatAmount: service.vatAmount,
          grossPrice: service.grossPrice,
          currency: service.currency,
        },
      ]
    : sections;
}
