import type { DraftValue, TechnicalMeasurement } from "../product/types.js";
import type { FrozenSellerIdentity } from "../seller/identity.js";
import type { QuoteSnapshot } from "./quoteSnapshot.js";

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
  vatPercent: number;
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
  commercial: QuoteDocumentCommercial;
  filename: string;
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
    label: line.label,
    value: formatCustomerMoneyAmount(line.commercial.netPrice, line.commercial.currency),
  }));
}

function projectCommercialLines(snapshot: QuoteSnapshot): QuoteDocumentCommercial {
  const commercial = snapshot.jobCommercial
    ? {
        ...snapshot.commercial,
        netPrice: snapshot.jobCommercial.netPrice,
        vatAmount: snapshot.jobCommercial.vatAmount,
        grossPrice: snapshot.jobCommercial.grossPrice,
      }
    : snapshot.commercial;
  return {
    netLabel: "Subtotal",
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
