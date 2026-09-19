import type { ProductProcessComposition } from "../processes/composition.js";
import { sha256Hex } from "../production/digest.js";
import {
  freezeProductionInput,
  type FrozenEicReference,
  type FrozenProductionInput,
  type FrozenQuantity,
} from "../production/snapshot.js";
import {
  freezeCustomerIdentity,
  type FrozenCustomerIdentity,
} from "../customers/identity.js";
import {
  freezeSellerIdentity,
  type FrozenSellerIdentity,
} from "../seller/identity.js";

export type { FrozenCustomerIdentity, FrozenSellerIdentity };
import type { ProductAggregate, ProductTruth } from "../product/types.js";
import type { EicResult } from "../resources/eic.js";
import {
  LAB_SITE_INSTALL_ID,
  SVC_SITE_INSTALL_SUBCONTRACT_ID,
  type CostEvidence,
} from "../resources/catalog.js";
import {
  isOperationalServiceProviderMode,
  type OperationalServiceProviderMode,
} from "../operationalServices.js";
import {
  SITE_INSTALLATION_SCOPE_ID,
} from "../installation/scope.js";
import {
  isSiteInstallationElectricalState,
  isSiteInstallationFacadeType,
  isSiteInstallationFixingMethod,
  isSiteInstallationMeasurementStatus,
  type SiteInstallationElectricalState,
  type SiteInstallationFacadeType,
  type SiteInstallationFixingMethod,
  type SiteInstallationMeasurementStatus,
} from "../installation/facts.js";
import type { CommercialPriceProjection } from "./price.js";
import {
  MANUAL_FIXED_SERVICE_STRATEGY,
  projectLiveJobCommercial,
} from "./servicePrice.js";

export const QUOTE_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const QUOTE_SNAPSHOT_SCHEMA_VERSION_V2 = 2 as const;
export type QuoteSnapshotSchemaVersion =
  | typeof QUOTE_SNAPSHOT_SCHEMA_VERSION
  | typeof QUOTE_SNAPSHOT_SCHEMA_VERSION_V2;
export const QUOTE_SNAPSHOT_STATUSES = ["FROZEN"] as const;
export type QuoteSnapshotStatus = (typeof QUOTE_SNAPSHOT_STATUSES)[number];
export const FROZEN_QUOTE_LINE_KINDS = ["PRODUCT", "SITE_INSTALLATION"] as const;
export type FrozenQuoteLineKind = (typeof FROZEN_QUOTE_LINE_KINDS)[number];
export const FROZEN_QUOTE_LINE_VERSION = 1 as const;
export const PRODUCT_COMMERCIAL_STRATEGY = "PRODUCT_COST_PLUS" as const;
export const SERVICE_QUOTE_FREEZE_NOT_AUTHORIZED = "service_quote_freeze_not_authorized";
export const SERVICE_QUOTE_FREEZE_NOT_AUTHORIZED_REASON =
  "Previzualizarea ofertei cu montaj este pregătită. Înghețarea acestei oferte nu este activată în această etapă.";
export const SERVICE_QUOTE_DOCUMENT_NOT_AUTHORIZED = "service_quote_document_not_authorized";
export const SERVICE_QUOTE_DOCUMENT_NOT_AUTHORIZED_REASON =
  "Documentul ofertei cu montaj nu este activat în această etapă.";

export const QUOTE_SNAPSHOT_ERRORS = [
  "incomplete_offer",
  "unavailable_offer",
  "invalid_customer",
  "invalid_seller",
] as const;
export type QuoteSnapshotError = (typeof QUOTE_SNAPSHOT_ERRORS)[number];

export type FrozenCommercialOffer = {
  policyId: string;
  policyVersion: number;
  markupPercent: number;
  markupAmount: number;
  discountPercent: number;
  discountAmount: number;
  adjustmentAmount: number;
  netPrice: number;
  vatPercent: number;
  vatAmount: number;
  grossPrice: number;
  currency: "EUR";
  completeness: "COMPLETE";
};

export type FrozenInstallationTechnicalConfiguration = {
  measurementStatus: SiteInstallationMeasurementStatus;
  facadeType: SiteInstallationFacadeType;
  fixingMethod: SiteInstallationFixingMethod;
  siteElectrical: SiteInstallationElectricalState;
  crewSize: number | null;
  plannedDurationHours: number | null;
};

export type FrozenServiceEvidenceProvenance = {
  resourceId: string;
  classification: CostEvidence["classification"];
  amount: number;
  currency: "EUR";
  perUnit: CostEvidence["perUnit"];
  supplierLabel?: string;
  validFrom?: string;
  validUntil?: string;
};

export type FrozenProductQuoteLine = {
  kind: "PRODUCT";
  lineVersion: typeof FROZEN_QUOTE_LINE_VERSION;
  commercialStrategy: typeof PRODUCT_COMMERCIAL_STRATEGY;
  label: string;
  productCode: string;
  eic: FrozenEicReference;
  commercial: FrozenCommercialOffer;
};

export type FrozenSiteInstallationQuoteLine = {
  kind: "SITE_INSTALLATION";
  lineVersion: typeof FROZEN_QUOTE_LINE_VERSION;
  scopeId: typeof SITE_INSTALLATION_SCOPE_ID;
  commercialStrategy: typeof MANUAL_FIXED_SERVICE_STRATEGY;
  providerMode: OperationalServiceProviderMode;
  label: string;
  sourceRequestId: string;
  quantity: number;
  commercialUnit: "person_hour" | "job";
  eic: FrozenEicReference;
  commercial: FrozenCommercialOffer;
  technicalConfiguration: FrozenInstallationTechnicalConfiguration;
  evidence: FrozenServiceEvidenceProvenance;
};

export type FrozenQuoteLine = FrozenProductQuoteLine | FrozenSiteInstallationQuoteLine;

export type QuoteInstallationFreezeInput = {
  label: string;
  eic: EicResult;
  commercial: CommercialPriceProjection;
  providerMode: OperationalServiceProviderMode;
  requestId: string;
  technicalConfiguration: FrozenInstallationTechnicalConfiguration;
  evidence: CostEvidence;
};

export type FrozenJobCommercial = {
  netPrice: number;
  vatAmount: number;
  grossPrice: number;
  currency: "EUR";
  completeness: "COMPLETE";
};

export type QuoteSnapshot = {
  quoteSnapshotId: string;
  schemaVersion: QuoteSnapshotSchemaVersion;
  status: QuoteSnapshotStatus;
  productCode: string;
  productLabel: string;
  inscription: string;
  sourceReviewId: string;
  sourceConfirmedAt: string;
  createdAt: string;
  contentHash: string;
  truth: {
    templateCode: string;
    templateVersion: string;
    familyId: string;
    selectedComponentIds: readonly string[];
    values: ProductTruth["values"];
    measurements: ProductTruth["measurements"];
  };
  quantities: readonly FrozenQuantity[];
  eic: FrozenEicReference;
  commercial: FrozenCommercialOffer;
  productionInput: FrozenProductionInput;
  customer?: FrozenCustomerIdentity;
  seller?: FrozenSellerIdentity;
  lines?: readonly FrozenQuoteLine[];
  jobCommercial?: FrozenJobCommercial;
};

export type QuoteSnapshotResult =
  | { ok: true; snapshot: QuoteSnapshot }
  | { ok: false; error: QuoteSnapshotError; reasons: readonly string[] };

const INCOMPLETE_REASON =
  "Oferta nu poate fi înghețată până când costul intern și prețul client nu sunt complete.";
const UNAVAILABLE_REASON = "Prețul client nu este disponibil pentru înghețare.";
const INVALID_CUSTOMER_REASON = "Identitatea clientului nu este validă pentru înghețare.";
const INVALID_SELLER_REASON = "Identitatea vânzătorului nu este validă pentru înghețare.";

export function freezeQuoteSnapshot(
  truth: ProductTruth,
  aggregate: ProductAggregate,
  composition: ProductProcessComposition,
  eic: EicResult,
  commercial: CommercialPriceProjection,
  options?: {
    createdAt?: string;
    customer?: FrozenCustomerIdentity;
    seller?: FrozenSellerIdentity;
    costEvidenceRows?: readonly CostEvidence[];
    installation?: QuoteInstallationFreezeInput;
  },
): QuoteSnapshotResult {
  if (eic.completeness !== "COMPLETE" || commercial.completeness !== "COMPLETE") {
    return {
      ok: false,
      error: "incomplete_offer",
      reasons: [INCOMPLETE_REASON],
    };
  }
  if (
    eic.currency !== "EUR" ||
    commercial.currency !== "EUR" ||
    commercial.markupAmount === null ||
    commercial.discountAmount === null ||
    commercial.adjustmentAmount === null ||
    commercial.netPrice === null ||
    commercial.vatAmount === null ||
    commercial.grossPrice === null
  ) {
    return {
      ok: false,
      error: "unavailable_offer",
      reasons: [UNAVAILABLE_REASON],
    };
  }

  const installation = options?.installation;
  if (installation) {
    if (
      installation.eic.completeness !== "COMPLETE" ||
      installation.commercial.completeness !== "COMPLETE"
    ) {
      return {
        ok: false,
        error: "incomplete_offer",
        reasons: [INCOMPLETE_REASON],
      };
    }
    if (
      installation.eic.currency !== "EUR" ||
      installation.commercial.currency !== "EUR" ||
      installation.commercial.markupAmount === null ||
      installation.commercial.discountAmount === null ||
      installation.commercial.adjustmentAmount === null ||
      installation.commercial.netPrice === null ||
      installation.commercial.vatAmount === null ||
      installation.commercial.grossPrice === null
    ) {
      return {
        ok: false,
        error: "unavailable_offer",
        reasons: [UNAVAILABLE_REASON],
      };
    }
  }

  const customer = options?.customer
    ? freezeCustomerIdentity(options.customer)
    : undefined;
  if (customer === null) {
    return {
      ok: false,
      error: "invalid_customer",
      reasons: [INVALID_CUSTOMER_REASON],
    };
  }
  const seller = options?.seller ? freezeSellerIdentity(options.seller) : undefined;
  if (seller === null) {
    return {
      ok: false,
      error: "invalid_seller",
      reasons: [INVALID_SELLER_REASON],
    };
  }

  const frozenProductCommercial = {
    policyId: commercial.policyId,
    policyVersion: commercial.policyVersion,
    markupPercent: commercial.markupPercent,
    markupAmount: commercial.markupAmount,
    discountPercent: commercial.discountPercent,
    discountAmount: commercial.discountAmount,
    adjustmentAmount: commercial.adjustmentAmount,
    netPrice: commercial.netPrice,
    vatPercent: commercial.vatPercent,
    vatAmount: commercial.vatAmount,
    grossPrice: commercial.grossPrice,
    currency: "EUR" as const,
    completeness: "COMPLETE" as const,
  };
  const frozenProductEic = freezeEic(eic);
  const v2Fields = installation
    ? freezeJobQuoteFields({
        productCode: truth.templateCode,
        productLabel: aggregate.productLabel,
        productEic: frozenProductEic,
        productCommercial: frozenProductCommercial,
        installation,
      })
    : null;
  if (v2Fields && !v2Fields.ok) {
    return v2Fields;
  }
  const hashedContent = {
    schemaVersion: v2Fields && v2Fields.ok
      ? QUOTE_SNAPSHOT_SCHEMA_VERSION_V2
      : QUOTE_SNAPSHOT_SCHEMA_VERSION,
    status: "FROZEN" as const,
    productCode: truth.templateCode,
    productLabel: aggregate.productLabel,
    inscription: aggregate.inscription,
    sourceReviewId: truth.reviewId,
    truth: {
      templateCode: truth.templateCode,
      templateVersion: truth.templateVersion,
      familyId: truth.familyId,
      selectedComponentIds: [...truth.selectedComponentIds],
      values: { ...truth.values },
      measurements: truth.measurements.map((item) => ({ ...item })),
    },
    quantities: freezeQuantities(aggregate),
    eic: frozenProductEic,
    productionInput: freezeProductionInput(aggregate, composition, {
      costEvidenceRows: options?.costEvidenceRows,
    }),
    commercial: frozenProductCommercial,
    ...(v2Fields && v2Fields.ok
      ? { lines: v2Fields.lines, jobCommercial: v2Fields.jobCommercial }
      : {}),
    ...(customer ? { customer } : {}),
    ...(seller ? { seller } : {}),
  };
  const contentHash = sha256Hex(stableStringify(hashedContent));
  return {
    ok: true,
    snapshot: deepFreeze({
      quoteSnapshotId: `qts:${truth.templateCode}:${contentHash}`,
      ...hashedContent,
      sourceConfirmedAt: truth.confirmedAt,
      createdAt: options?.createdAt ?? new Date().toISOString(),
      contentHash,
    }),
  };
}

function copyFrozenEicReference(eic: FrozenEicReference): FrozenEicReference {
  return {
    total: eic.total,
    currency: eic.currency,
    completeness: eic.completeness,
    lines: eic.lines.map((line) => ({ ...line })),
  };
}

export function copyFrozenQuoteLine(line: FrozenQuoteLine): FrozenQuoteLine {
  switch (line.kind) {
    case "PRODUCT":
      return {
        kind: "PRODUCT",
        lineVersion: line.lineVersion,
        commercialStrategy: line.commercialStrategy,
        label: line.label,
        productCode: line.productCode,
        eic: copyFrozenEicReference(line.eic),
        commercial: { ...line.commercial },
      };
    case "SITE_INSTALLATION":
      return {
        kind: "SITE_INSTALLATION",
        lineVersion: line.lineVersion,
        scopeId: line.scopeId,
        commercialStrategy: line.commercialStrategy,
        providerMode: line.providerMode,
        label: line.label,
        sourceRequestId: line.sourceRequestId,
        quantity: line.quantity,
        commercialUnit: line.commercialUnit,
        eic: copyFrozenEicReference(line.eic),
        commercial: { ...line.commercial },
        technicalConfiguration: { ...line.technicalConfiguration },
        evidence: {
          resourceId: line.evidence.resourceId,
          classification: line.evidence.classification,
          amount: line.evidence.amount,
          currency: line.evidence.currency,
          perUnit: line.evidence.perUnit,
          ...(line.evidence.supplierLabel
            ? { supplierLabel: line.evidence.supplierLabel }
            : {}),
          ...(line.evidence.validFrom ? { validFrom: line.evidence.validFrom } : {}),
          ...(line.evidence.validUntil ? { validUntil: line.evidence.validUntil } : {}),
        },
      };
    default: {
      const _exhaustive: never = line;
      return _exhaustive;
    }
  }
}

export function copyFrozenJobCommercial(
  jobCommercial: FrozenJobCommercial,
): FrozenJobCommercial {
  return { ...jobCommercial };
}

export function quoteSnapshotHashedPayload(snapshot: QuoteSnapshot): Record<string, unknown> {
  return {
    schemaVersion: snapshot.schemaVersion,
    status: snapshot.status,
    productCode: snapshot.productCode,
    productLabel: snapshot.productLabel,
    inscription: snapshot.inscription,
    sourceReviewId: snapshot.sourceReviewId,
    truth: snapshot.truth,
    quantities: snapshot.quantities,
    eic: snapshot.eic,
    productionInput: snapshot.productionInput,
    commercial: snapshot.commercial,
    ...(snapshot.schemaVersion === QUOTE_SNAPSHOT_SCHEMA_VERSION_V2 &&
    snapshot.lines &&
    snapshot.jobCommercial
      ? { lines: snapshot.lines, jobCommercial: snapshot.jobCommercial }
      : {}),
    ...(snapshot.customer ? { customer: snapshot.customer } : {}),
    ...(snapshot.seller ? { seller: snapshot.seller } : {}),
  };
}

export function quoteSnapshotContentHash(snapshot: QuoteSnapshot): string {
  return sha256Hex(stableStringify(quoteSnapshotHashedPayload(snapshot)));
}

export function hasValidQuoteSnapshotContentHash(snapshot: QuoteSnapshot): boolean {
  return (
    snapshot.contentHash.trim() !== "" &&
    snapshot.contentHash === quoteSnapshotContentHash(snapshot)
  );
}

export function hasValidQuoteSnapshotIdentity(snapshot: QuoteSnapshot): boolean {
  return (
    snapshot.quoteSnapshotId ===
    `qts:${snapshot.productCode}:${snapshot.contentHash}`
  );
}

export function isTrustedFrozenQuoteV2ForOrder(snapshot: QuoteSnapshot): boolean {
  return (
    snapshot.schemaVersion === QUOTE_SNAPSHOT_SCHEMA_VERSION_V2 &&
    isSupportedQuoteSnapshot(snapshot) &&
    hasValidQuoteSnapshotContentHash(snapshot) &&
    hasValidQuoteSnapshotIdentity(snapshot) &&
    quoteV2ProductLineMirrorsTopLevel(snapshot) &&
    quoteV2InstallationLineIsCoherent(snapshot)
  );
}

export function isSupportedQuoteSnapshot(snapshot: QuoteSnapshot): boolean {
  if (snapshot.status !== "FROZEN") {
    return false;
  }
  if (snapshot.schemaVersion === QUOTE_SNAPSHOT_SCHEMA_VERSION) {
    return snapshot.lines === undefined && snapshot.jobCommercial === undefined;
  }
  if (snapshot.schemaVersion === QUOTE_SNAPSHOT_SCHEMA_VERSION_V2) {
    return isExactQuoteSnapshotV2(snapshot);
  }
  return false;
}

export function quoteSnapshotErrorLabel(error: QuoteSnapshotError): string {
  switch (error) {
    case "incomplete_offer":
      return INCOMPLETE_REASON;
    case "unavailable_offer":
      return UNAVAILABLE_REASON;
    case "invalid_customer":
      return INVALID_CUSTOMER_REASON;
    case "invalid_seller":
      return INVALID_SELLER_REASON;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

const SERVICE_LINE_INVARIANT_REASON =
  "Linia de montaj nu poate fi înghețată fără strategia, modul și proveniența cerute.";

function freezeJobQuoteFields(input: {
  productCode: string;
  productLabel: string;
  productEic: FrozenEicReference;
  productCommercial: FrozenCommercialOffer;
  installation: QuoteInstallationFreezeInput;
}):
  | {
      ok: true;
      lines: readonly FrozenQuoteLine[];
      jobCommercial: FrozenJobCommercial;
    }
  | { ok: false; error: QuoteSnapshotError; reasons: readonly string[] } {
  const installCommercial = input.installation.commercial;
  if (
    !isOperationalServiceProviderMode(input.installation.providerMode) ||
    input.installation.requestId.trim() === "" ||
    !isCompleteFrozenCommercial(installCommercial)
  ) {
    return {
      ok: false,
      error: "unavailable_offer",
      reasons: [SERVICE_LINE_INVARIANT_REASON],
    };
  }
  const quantity = installationLineQuantity(input.installation);
  if (!quantity) {
    return {
      ok: false,
      error: "unavailable_offer",
      reasons: [SERVICE_LINE_INVARIANT_REASON],
    };
  }
  const evidence = freezeServiceEvidenceProvenance(
    input.installation.providerMode,
    input.installation.evidence,
  );
  if (!evidence) {
    return {
      ok: false,
      error: "unavailable_offer",
      reasons: [SERVICE_LINE_INVARIANT_REASON],
    };
  }
  const installLineCommercial: FrozenCommercialOffer = {
    policyId: installCommercial.policyId,
    policyVersion: installCommercial.policyVersion,
    markupPercent: installCommercial.markupPercent,
    markupAmount: installCommercial.markupAmount,
    discountPercent: installCommercial.discountPercent,
    discountAmount: installCommercial.discountAmount,
    adjustmentAmount: installCommercial.adjustmentAmount,
    netPrice: installCommercial.netPrice,
    vatPercent: installCommercial.vatPercent,
    vatAmount: installCommercial.vatAmount,
    grossPrice: installCommercial.grossPrice,
    currency: "EUR",
    completeness: "COMPLETE",
  };
  const jobCommercial = projectLiveJobCommercial(
    input.productCommercial,
    installLineCommercial,
  );
  if (!jobCommercial) {
    return {
      ok: false,
      error: "unavailable_offer",
      reasons: [SERVICE_LINE_INVARIANT_REASON],
    };
  }
  return {
    ok: true,
    lines: [
      {
        kind: "PRODUCT",
        lineVersion: FROZEN_QUOTE_LINE_VERSION,
        commercialStrategy: PRODUCT_COMMERCIAL_STRATEGY,
        label: input.productLabel,
        productCode: input.productCode,
        eic: input.productEic,
        commercial: input.productCommercial,
      },
      {
        kind: "SITE_INSTALLATION",
        lineVersion: FROZEN_QUOTE_LINE_VERSION,
        scopeId: SITE_INSTALLATION_SCOPE_ID,
        commercialStrategy: MANUAL_FIXED_SERVICE_STRATEGY,
        providerMode: input.installation.providerMode,
        label: input.installation.label,
        sourceRequestId: input.installation.requestId,
        quantity: quantity.quantity,
        commercialUnit: quantity.commercialUnit,
        eic: freezeEic(input.installation.eic),
        commercial: installLineCommercial,
        technicalConfiguration: input.installation.technicalConfiguration,
        evidence,
      },
    ],
    jobCommercial,
  };
}

function isCompleteFrozenCommercial(
  commercial: CommercialPriceProjection,
): commercial is CommercialPriceProjection & FrozenCommercialOffer {
  return (
    commercial.completeness === "COMPLETE" &&
    commercial.currency === "EUR" &&
    commercial.markupAmount !== null &&
    commercial.discountAmount !== null &&
    commercial.adjustmentAmount !== null &&
    commercial.netPrice !== null &&
    commercial.vatAmount !== null &&
    commercial.grossPrice !== null
  );
}

function installationLineQuantity(input: QuoteInstallationFreezeInput): {
  quantity: number;
  commercialUnit: FrozenSiteInstallationQuoteLine["commercialUnit"];
} | null {
  if (input.providerMode === "INTERNAL") {
    const crew = input.technicalConfiguration.crewSize;
    const hours = input.technicalConfiguration.plannedDurationHours;
    if (!crew || !hours || crew <= 0 || hours <= 0) {
      return null;
    }
    return { quantity: crew * hours, commercialUnit: "person_hour" };
  }
  if (input.providerMode === "SUBCONTRACTED") {
    return { quantity: 1, commercialUnit: "job" };
  }
  return null;
}

function isFrozenInstallationTechnicalConfiguration(
  value: FrozenInstallationTechnicalConfiguration | undefined,
): value is FrozenInstallationTechnicalConfiguration {
  if (!value) {
    return false;
  }
  return (
    isSiteInstallationMeasurementStatus(value.measurementStatus) &&
    isSiteInstallationFacadeType(value.facadeType) &&
    isSiteInstallationFixingMethod(value.fixingMethod) &&
    isSiteInstallationElectricalState(value.siteElectrical)
  );
}

function isFrozenServiceEvidenceProvenance(
  providerMode: OperationalServiceProviderMode,
  evidence: FrozenServiceEvidenceProvenance | undefined,
): evidence is FrozenServiceEvidenceProvenance {
  if (!evidence || evidence.currency !== "EUR" || evidence.classification !== "OWNER_CONFIRMED") {
    return false;
  }
  if (providerMode === "INTERNAL") {
    return evidence.resourceId === LAB_SITE_INSTALL_ID && evidence.perUnit === "person_hour";
  }
  if (providerMode === "SUBCONTRACTED") {
    return (
      evidence.resourceId === SVC_SITE_INSTALL_SUBCONTRACT_ID &&
      evidence.perUnit === "job" &&
      Boolean(evidence.supplierLabel?.trim()) &&
      Boolean(evidence.validUntil?.trim())
    );
  }
  return false;
}

function freezeServiceEvidenceProvenance(
  providerMode: OperationalServiceProviderMode,
  evidence: CostEvidence,
): FrozenServiceEvidenceProvenance | null {
  if (evidence.currency !== "EUR" || evidence.classification !== "OWNER_CONFIRMED") {
    return null;
  }
  if (providerMode === "INTERNAL") {
    if (evidence.resourceId !== LAB_SITE_INSTALL_ID || evidence.perUnit !== "person_hour") {
      return null;
    }
  } else if (providerMode === "SUBCONTRACTED") {
    if (
      evidence.resourceId !== SVC_SITE_INSTALL_SUBCONTRACT_ID ||
      evidence.perUnit !== "job" ||
      !evidence.supplierLabel?.trim() ||
      !evidence.validUntil
    ) {
      return null;
    }
  } else {
    return null;
  }
  return {
    resourceId: evidence.resourceId,
    classification: evidence.classification,
    amount: evidence.amount,
    currency: "EUR",
    perUnit: evidence.perUnit,
    ...(evidence.supplierLabel ? { supplierLabel: evidence.supplierLabel } : {}),
    ...(evidence.validFrom ? { validFrom: evidence.validFrom } : {}),
    ...(evidence.validUntil ? { validUntil: evidence.validUntil } : {}),
  };
}

function quoteV2ProductLineMirrorsTopLevel(snapshot: QuoteSnapshot): boolean {
  const product = snapshot.lines?.find((line) => line.kind === "PRODUCT");
  if (!product || product.kind !== "PRODUCT") {
    return false;
  }
  return (
    product.productCode === snapshot.productCode &&
    product.label === snapshot.productLabel &&
    stableStringify(product.eic) === stableStringify(snapshot.eic) &&
    stableStringify(product.commercial) === stableStringify(snapshot.commercial)
  );
}

function quoteV2InstallationLineIsCoherent(snapshot: QuoteSnapshot): boolean {
  const installation = snapshot.lines?.find((line) => line.kind === "SITE_INSTALLATION");
  if (!installation || installation.kind !== "SITE_INSTALLATION") {
    return false;
  }
  const facts = installation.technicalConfiguration;
  const evidence = installation.evidence;
  const eicTotal = installation.eic.lines.reduce((sum, line) => sum + line.cost, 0);
  if (installation.eic.total !== eicTotal) {
    return false;
  }
  const matchingLine = installation.eic.lines.find(
    (line) => line.resourceId === evidence.resourceId,
  );
  if (
    !matchingLine ||
    matchingLine.quantity !== installation.quantity ||
    matchingLine.rate !== evidence.amount ||
    matchingLine.cost !== matchingLine.quantity * matchingLine.rate ||
    matchingLine.unit !== evidence.perUnit
  ) {
    return false;
  }
  if (installation.providerMode === "INTERNAL") {
    const expectedQuantity =
      (facts.crewSize ?? 0) * (facts.plannedDurationHours ?? 0);
    return (
      installation.commercialUnit === "person_hour" &&
      installation.quantity === expectedQuantity &&
      expectedQuantity > 0 &&
      evidence.resourceId === LAB_SITE_INSTALL_ID &&
      evidence.perUnit === "person_hour" &&
      evidence.classification === "OWNER_CONFIRMED"
    );
  }
  if (installation.providerMode === "SUBCONTRACTED") {
    return (
      installation.commercialUnit === "job" &&
      installation.quantity === 1 &&
      evidence.resourceId === SVC_SITE_INSTALL_SUBCONTRACT_ID &&
      evidence.perUnit === "job" &&
      evidence.classification === "OWNER_CONFIRMED" &&
      Boolean(evidence.supplierLabel?.trim()) &&
      Boolean(evidence.validUntil?.trim())
    );
  }
  return false;
}

function isExactQuoteSnapshotV2(snapshot: QuoteSnapshot): boolean {
  const lines = snapshot.lines;
  const job = snapshot.jobCommercial;
  if (!lines || lines.length !== 2 || !job) {
    return false;
  }
  const product = lines.find((line) => line.kind === "PRODUCT");
  const installation = lines.find((line) => line.kind === "SITE_INSTALLATION");
  if (
    !product ||
    !installation ||
    product.kind !== "PRODUCT" ||
    installation.kind !== "SITE_INSTALLATION"
  ) {
    return false;
  }
  if (
    product.commercialStrategy !== PRODUCT_COMMERCIAL_STRATEGY ||
    product.lineVersion !== FROZEN_QUOTE_LINE_VERSION ||
    product.productCode.trim() === "" ||
    product.eic.completeness !== "COMPLETE" ||
    product.commercial.completeness !== "COMPLETE" ||
    product.commercial.currency !== "EUR"
  ) {
    return false;
  }
  if (
    installation.scopeId !== SITE_INSTALLATION_SCOPE_ID ||
    installation.commercialStrategy !== MANUAL_FIXED_SERVICE_STRATEGY ||
    installation.lineVersion !== FROZEN_QUOTE_LINE_VERSION ||
    !isOperationalServiceProviderMode(installation.providerMode) ||
    installation.sourceRequestId.trim() === "" ||
    installation.label.trim() === "" ||
    installation.quantity <= 0 ||
    installation.eic.completeness !== "COMPLETE" ||
    installation.commercial.completeness !== "COMPLETE" ||
    installation.commercial.currency !== "EUR" ||
    installation.commercialUnit !==
      (installation.providerMode === "INTERNAL" ? "person_hour" : "job") ||
    !isFrozenInstallationTechnicalConfiguration(installation.technicalConfiguration) ||
    !isFrozenServiceEvidenceProvenance(
      installation.providerMode,
      installation.evidence,
    )
  ) {
    return false;
  }
  const projected = projectLiveJobCommercial(product.commercial, installation.commercial);
  return (
    projected !== null &&
    job.completeness === "COMPLETE" &&
    job.currency === "EUR" &&
    job.netPrice === projected.netPrice &&
    job.vatAmount === projected.vatAmount &&
    job.grossPrice === projected.grossPrice
  );
}

function freezeQuantities(aggregate: ProductAggregate): FrozenQuantity[] {
  return aggregate.quantities.map((item) => ({
    id: item.id,
    componentId: item.componentId,
    label: item.label,
    value: item.value,
    unit: item.unit,
  }));
}

function freezeEic(eic: EicResult): FrozenEicReference {
  return {
    total: eic.total,
    currency: eic.currency,
    completeness: eic.completeness,
    lines: eic.lines.map((line) => ({
      resourceId: line.resourceId,
      label: line.label,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      currency: line.currency,
      cost: line.cost,
    })),
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
