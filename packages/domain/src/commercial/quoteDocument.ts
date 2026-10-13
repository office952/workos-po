import type { AssemblyQuoteSnapshot } from "../assembly/snapshots.js";
import type { DraftValue, ProductTruth, TechnicalMeasurement } from "../product/types.js";
import type { FrozenSellerIdentity } from "../seller/identity.js";
import type { FrozenCommercialOffer, QuoteSnapshot } from "./quoteSnapshot.js";

export const QUOTE_DOCUMENT_TITLE = "Ofertă" as const;
export const QUOTE_DOCUMENT_ISSUER = "WorkOS Final" as const;
export const QUOTE_DOCUMENT_STATUS = "Ofertă" as const;

export type QuoteDocumentLine = {
  label: string;
  value: string;
};

export type QuoteDocumentCommercial = {
  netLabel: string;
  netDisplay: string;
  vatLabel: string;
  vatDisplay: string;
  grossLabel: string;
  grossDisplay: string;
  currency: "EUR";
  netPrice: number;
  vatAmount: number;
  vatPercent: number | null;
  grossPrice: number;
};

export type QuoteDocumentSeller = {
  legalName: string;
  brand?: string;
  fiscalId?: string;
  tradeRegister?: string;
  address?: string;
  locality?: string;
  iban?: string;
  bank?: string;
};

export type QuoteDocumentSection = {
  title: string;
  productName: string;
  inscription?: string;
  configuration: readonly QuoteDocumentLine[];
  technicalSummary: readonly QuoteDocumentLine[];
  price: QuoteDocumentLine;
};

export type QuoteDocumentModel = {
  title: typeof QUOTE_DOCUMENT_TITLE;
  issuerName: string;
  reference: string;
  issuedOn: string;
  status: typeof QUOTE_DOCUMENT_STATUS;
  productName: string;
  inscription?: string;
  customerDisplayName?: string;
  seller?: QuoteDocumentSeller;
  configuration: readonly QuoteDocumentLine[];
  technicalSummary: readonly QuoteDocumentLine[];
  sections?: readonly QuoteDocumentSection[];
  commercial: QuoteDocumentCommercial;
  filename: string;
};

/**
 * Assembly quotes freeze members and totals but not the customer or seller identity,
 * so those two come from the current registry at document time.
 */
export type AssemblyQuoteDocumentInput = {
  quote: AssemblyQuoteSnapshot;
  memberTruths: ReadonlyMap<string, Pick<ProductTruth, "values" | "measurements">>;
  customerDisplayName?: string | null;
  seller?: FrozenSellerIdentity | null;
};

const CONFIG_VALUE_LABELS: Record<string, string> = {
  none: "Fără finisaj",
  vinyl: "Colantat",
  painted: "Vopsit",
  steel_angle: "Cornier oțel",
};

const PREFIX_QUALIFIER: Record<string, string> = {
  face: "față",
  volume: "volum",
  back: "spate",
  lighting: "iluminare",
};

const GEOMETRY_SUFFIXES = new Set([
  "widthMm",
  "heightMm",
  "depthMm",
  "cassetteDepthMm",
  "confirmedAreaMm2",
  "confirmedPerimeterMm",
  "thicknessMm",
]);

export function projectQuoteDocument(snapshot: QuoteSnapshot): QuoteDocumentModel {
  const reference = quoteDocumentReference(snapshot.contentHash);
  const measurementFieldIds = new Set(
    snapshot.truth.measurements.map((item) => item.fieldId),
  );
  const configuration = projectConfigurationLines(snapshot.truth.values, measurementFieldIds);
  const technicalSummary = projectTechnicalLines(snapshot.truth.measurements);
  const inscription = sanitizeDocumentText(snapshot.inscription);
  const customerDisplayName = snapshot.customer
    ? sanitizeDocumentText(snapshot.customer.displayName)
    : "";
  const seller = projectSeller(snapshot.seller);
  return {
    title: QUOTE_DOCUMENT_TITLE,
    issuerName: seller?.legalName ?? QUOTE_DOCUMENT_ISSUER,
    reference,
    issuedOn: formatFrozenOfferDate(snapshot.createdAt),
    status: QUOTE_DOCUMENT_STATUS,
    productName: sanitizeDocumentText(snapshot.productLabel),
    ...(inscription ? { inscription } : {}),
    ...(customerDisplayName ? { customerDisplayName } : {}),
    ...(seller ? { seller } : {}),
    configuration: [
      ...configuration,
      ...projectOfferLineLabels(snapshot),
    ],
    technicalSummary,
    commercial: projectCommercialLines(snapshot),
    filename: `Oferta-${reference}.pdf`,
  };
}

export function projectAssemblyQuoteDocument(input: AssemblyQuoteDocumentInput): QuoteDocumentModel {
  const { quote } = input;
  const reference = quoteDocumentReference(quote.contentHash);
  const seller = projectSeller(input.seller ?? undefined);
  const customerDisplayName = input.customerDisplayName
    ? sanitizeDocumentText(input.customerDisplayName)
    : "";
  const sections: QuoteDocumentSection[] = quote.members.map((member) => {
    const truth = input.memberTruths.get(member.confirmedTruthId);
    const measurementFieldIds = new Set((truth?.measurements ?? []).map((item) => item.fieldId));
    const inscription = sanitizeDocumentText(member.inscription);
    return {
      title: sanitizeDocumentText(member.roleLabel),
      productName: sanitizeDocumentText(member.productLabel),
      ...(inscription ? { inscription } : {}),
      configuration: truth ? projectConfigurationLines(truth.values, measurementFieldIds) : [],
      technicalSummary: truth ? projectTechnicalLines(truth.measurements) : [],
      price: sectionPriceLine(member.commercial),
    };
  });
  if (quote.serviceLine) {
    sections.push({
      title: sanitizeDocumentText(quote.serviceLine.label),
      productName: "Serviciu",
      configuration: [],
      technicalSummary: [],
      price: sectionPriceLine(quote.serviceLine.commercial),
    });
  }
  return {
    title: QUOTE_DOCUMENT_TITLE,
    issuerName: seller?.legalName ?? QUOTE_DOCUMENT_ISSUER,
    reference,
    issuedOn: formatFrozenOfferDate(quote.createdAt),
    status: QUOTE_DOCUMENT_STATUS,
    productName: sanitizeDocumentText(quote.label),
    ...(customerDisplayName ? { customerDisplayName } : {}),
    ...(seller ? { seller } : {}),
    configuration: [],
    technicalSummary: [],
    sections,
    commercial: projectAssemblyCommercialLines(quote),
    filename: `Oferta-${reference}.pdf`,
  };
}

export function quoteDocumentReference(contentHash: string): string {
  return `OF-${contentHash.slice(0, 8).toUpperCase()}`;
}

export function formatFrozenOfferDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) {
    return iso;
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function formatCustomerMoney(value: number): string {
  const [whole, fraction = "00"] = value.toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${fraction}`;
}

export function formatCustomerMoneyAmount(
  value: number,
  currency: string = "EUR",
): string {
  return `${formatCustomerMoney(value)} ${currency}`;
}

export function sanitizeDocumentText(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    })
    .join("")
    .trim();
}

function projectSeller(seller: FrozenSellerIdentity | undefined): QuoteDocumentSeller | undefined {
  if (!seller) {
    return undefined;
  }
  const legalName = sanitizeDocumentText(seller.legalName);
  if (!legalName) {
    return undefined;
  }
  return {
    legalName,
    ...optionalDocumentField("brand", seller.brand),
    ...optionalDocumentField("fiscalId", seller.fiscalId),
    ...optionalDocumentField("tradeRegister", seller.tradeRegister),
    ...optionalDocumentField("address", seller.address),
    ...optionalDocumentField("locality", seller.locality),
    ...optionalDocumentField("iban", seller.iban),
    ...optionalDocumentField("bank", seller.bank),
  };
}

function optionalDocumentField(
  key: keyof QuoteDocumentSeller,
  value: string | undefined,
): Partial<QuoteDocumentSeller> {
  const text = value ? sanitizeDocumentText(value) : "";
  return text ? { [key]: text } : {};
}

function projectOfferLineLabels(snapshot: QuoteSnapshot): QuoteDocumentLine[] {
  if (snapshot.schemaVersion !== 2 || !snapshot.lines) {
    return [];
  }
  return snapshot.lines.map((line) => ({
    label: line.kind === "PRODUCT" ? "Produs" : line.label,
    value: formatCustomerMoneyAmount(line.commercial.netPrice, line.commercial.currency),
  }));
}

/**
 * The single customer-facing total of a frozen standalone quote: the frozen job
 * total (product + site installation) when present, otherwise the product offer.
 */
export function quoteSnapshotCustomerTotal(snapshot: QuoteSnapshot): {
  netPrice: number;
  vatAmount: number;
  grossPrice: number;
  vatPercent: number;
  currency: "EUR";
} {
  const source = snapshot.jobCommercial ?? snapshot.commercial;
  return {
    netPrice: source.netPrice,
    vatAmount: source.vatAmount,
    grossPrice: source.grossPrice,
    vatPercent: snapshot.commercial.vatPercent,
    currency: source.currency,
  };
}

function projectCommercialLines(snapshot: QuoteSnapshot): QuoteDocumentCommercial {
  const commercial = quoteSnapshotCustomerTotal(snapshot);
  return {
    netLabel: snapshot.jobCommercial ? "Total ofertă" : "Subtotal",
    netDisplay: formatCustomerMoney(commercial.netPrice),
    vatLabel: `TVA ${commercial.vatPercent}%`,
    vatDisplay: formatCustomerMoney(commercial.vatAmount),
    grossLabel: "Total",
    grossDisplay: formatCustomerMoney(commercial.grossPrice),
    currency: commercial.currency,
    netPrice: commercial.netPrice,
    vatAmount: commercial.vatAmount,
    vatPercent: commercial.vatPercent,
    grossPrice: commercial.grossPrice,
  };
}

function sectionPriceLine(commercial: FrozenCommercialOffer): QuoteDocumentLine {
  return {
    label: "Preț net",
    value: formatCustomerMoneyAmount(commercial.netPrice, commercial.currency),
  };
}

function projectAssemblyCommercialLines(quote: AssemblyQuoteSnapshot): QuoteDocumentCommercial {
  const offers = [
    ...quote.members.map((member) => member.commercial),
    ...(quote.serviceLine ? [quote.serviceLine.commercial] : []),
  ];
  const rates = new Set(offers.map((offer) => offer.vatPercent));
  const vatPercent = rates.size === 1 ? ([...rates][0] ?? null) : null;
  return {
    netLabel: "Total ofertă",
    netDisplay: formatCustomerMoney(quote.totals.netPrice),
    vatLabel: vatPercent === null ? "TVA" : `TVA ${vatPercent}%`,
    vatDisplay: formatCustomerMoney(quote.totals.vatAmount),
    grossLabel: "Total",
    grossDisplay: formatCustomerMoney(quote.totals.grossPrice),
    currency: quote.totals.currency,
    netPrice: quote.totals.netPrice,
    vatAmount: quote.totals.vatAmount,
    vatPercent,
    grossPrice: quote.totals.grossPrice,
  };
}

function projectConfigurationLines(
  values: QuoteSnapshot["truth"]["values"],
  measurementFieldIds: ReadonlySet<string>,
): QuoteDocumentLine[] {
  const lines: QuoteDocumentLine[] = [];
  for (const [fieldId, raw] of Object.entries(values)) {
    if (measurementFieldIds.has(fieldId)) {
      continue;
    }
    const suffix = fieldSuffix(fieldId);
    if (suffix === "inscription") {
      continue;
    }
    const label = configurationLabel(fieldId);
    if (!label) {
      continue;
    }
    const value = configurationValue(suffix, raw);
    if (!value) {
      continue;
    }
    lines.push({ label, value });
  }
  return lines;
}

function projectTechnicalLines(
  measurements: readonly TechnicalMeasurement[],
): QuoteDocumentLine[] {
  const lines: QuoteDocumentLine[] = [];
  for (const measurement of measurements) {
    const label = measurement.label ?? geometryLabel(measurement.fieldId);
    if (!label) {
      continue;
    }
    lines.push({
      label,
      value: formatMeasurementValue(measurement),
    });
  }
  return lines;
}

function configurationLabel(fieldId: string): string | null {
  const suffix = fieldSuffix(fieldId);
  const qualifier = fieldQualifier(fieldId);
  switch (suffix) {
    case "finish":
      return qualifier ? `Finisaj ${qualifier}` : "Finisaj";
    case "color":
      return qualifier ? `Culoare ${qualifier}` : "Culoare";
    case "depthMm":
    case "cassetteDepthMm":
      return qualifier ? `Adâncime ${qualifier}` : "Adâncime";
    case "widthMm":
      return qualifier ? `Lățime ${qualifier}` : "Lățime";
    case "heightMm":
      return qualifier ? `Înălțime ${qualifier}` : "Înălțime";
    case "backReturnMm":
      return "A doua întoarcere";
    case "foldCount":
      return "Îndoituri";
    case "mountingSystem":
      return "Prindere";
    default:
      return null;
  }
}

function geometryLabel(fieldId: string): string | null {
  const suffix = fieldSuffix(fieldId);
  if (!GEOMETRY_SUFFIXES.has(suffix)) {
    return null;
  }
  const qualifier = fieldQualifier(fieldId);
  switch (suffix) {
    case "widthMm":
      return qualifier ? `Lățime ${qualifier}` : "Lățime";
    case "heightMm":
      return qualifier ? `Înălțime ${qualifier}` : "Înălțime";
    case "depthMm":
    case "cassetteDepthMm":
      return qualifier ? `Adâncime ${qualifier}` : "Adâncime";
    case "thicknessMm":
      return "Grosime";
    case "confirmedAreaMm2":
      return qualifier ? `Suprafață confirmată ${qualifier}` : "Suprafață confirmată";
    case "confirmedPerimeterMm":
      return qualifier ? `Perimetru confirmat ${qualifier}` : "Perimetru confirmat";
    default:
      return null;
  }
}

function configurationValue(suffix: string, raw: DraftValue): string {
  const text = sanitizeDocumentText(String(raw));
  if (!text) {
    return "";
  }
  const token = CONFIG_VALUE_LABELS[text];
  if (token) {
    return token;
  }
  if (
    suffix === "depthMm" ||
    suffix === "cassetteDepthMm" ||
    suffix === "widthMm" ||
    suffix === "heightMm"
  ) {
    return `${text} mm`;
  }
  return text;
}

function formatMeasurementValue(measurement: TechnicalMeasurement): string {
  const amount = formatCustomerQuantity(measurement.value);
  switch (measurement.unit) {
    case "mm":
      return `${amount} mm`;
    case "mm2":
      return `${amount} mm²`;
    default: {
      const _exhaustive: never = measurement.unit;
      return _exhaustive;
    }
  }
}

function formatCustomerQuantity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
  const [whole, fraction = ""] = String(value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${fraction}`;
}

function fieldSuffix(fieldId: string): string {
  const separator = fieldId.lastIndexOf(".");
  return separator === -1 ? fieldId : fieldId.slice(separator + 1);
}

function fieldQualifier(fieldId: string): string | undefined {
  const separator = fieldId.indexOf(".");
  if (separator === -1) {
    return undefined;
  }
  const prefix = fieldId.slice(0, separator);
  if (prefix === "root") {
    return undefined;
  }
  return PREFIX_QUALIFIER[prefix];
}
