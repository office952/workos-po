import {
  ORDER_SNAPSHOT_SCHEMA_VERSION,
  ORDER_SNAPSHOT_SCHEMA_VERSION_V2,
  type OrderSnapshot,
} from "../commercial/orderSnapshot.js";
import { projectSiteInstallationOperationalView } from "../installation/hostContext.js";
import { appendInstallAtSiteOperation } from "./installAtSite.js";
import {
  ACCEPTED_PRODUCTION_SNAPSHOT_SCHEMA_VERSION,
  FROZEN_PRODUCTION_INPUT_SCHEMA_VERSION,
  canonicalContentHash,
  copyFrozenProductionInput,
  type AcceptedProductionSnapshot,
} from "./snapshot.js";

export const PRODUCTION_RELEASE_ERRORS = [
  "incompatible_order_source",
  "missing_production_input",
] as const;
export type ProductionReleaseError = (typeof PRODUCTION_RELEASE_ERRORS)[number];

export type ProductionReleaseResult =
  | { ok: true; snapshot: AcceptedProductionSnapshot }
  | { ok: false; error: ProductionReleaseError; reasons: readonly string[] };

const INCOMPATIBLE_REASON = "Eliberarea în producție poate fi creată doar dintr-o comandă înghețată.";
const MISSING_INPUT_REASON =
  "Comanda nu conține evidența de producție înghețată necesară eliberării.";

export function freezeProductionReleaseFromOrder(
  order: OrderSnapshot,
  options?: { createdAt?: string },
): ProductionReleaseResult {
  const siteInstallation = siteInstallationFromOrder(order);
  if (order.schemaVersion === ORDER_SNAPSHOT_SCHEMA_VERSION_V2 && !siteInstallation) {
    return {
      ok: false,
      error: "incompatible_order_source",
      reasons: [INCOMPATIBLE_REASON],
    };
  }
  if (
    order.schemaVersion !== ORDER_SNAPSHOT_SCHEMA_VERSION &&
    order.schemaVersion !== ORDER_SNAPSHOT_SCHEMA_VERSION_V2 ||
    order.status !== "FROZEN" ||
    order.orderSnapshotId.trim() === "" ||
    order.contentHash.trim() === "" ||
    order.eic.completeness !== "COMPLETE"
  ) {
    return {
      ok: false,
      error: "incompatible_order_source",
      reasons: [INCOMPATIBLE_REASON],
    };
  }
  const input = order.productionInput;
  if (
    !input ||
    input.schemaVersion !== FROZEN_PRODUCTION_INPUT_SCHEMA_VERSION ||
    input.contentHash.trim() === "" ||
    input.operations.length === 0
  ) {
    return {
      ok: false,
      error: "missing_production_input",
      reasons: [MISSING_INPUT_REASON],
    };
  }

  const productionInput = copyFrozenProductionInput(input);
  const operations = siteInstallation
    ? appendInstallAtSiteOperation(productionInput.operations)
    : productionInput.operations;
  if (!operations) {
    return {
      ok: false,
      error: "missing_production_input",
      reasons: [MISSING_INPUT_REASON],
    };
  }
  const hashedContent = {
    schemaVersion: ACCEPTED_PRODUCTION_SNAPSHOT_SCHEMA_VERSION,
    status: "ACCEPTED" as const,
    productCode: order.productCode,
    productLabel: order.productLabel,
    inscription: order.inscription,
    sourceReviewId: order.sourceReviewId,
    releaseSource: "ORDER" as const,
    sourceOrderSnapshotId: order.orderSnapshotId,
    sourceOrderContentHash: order.contentHash,
    sourceProductionInputHash: productionInput.contentHash,
    truth: {
      templateCode: order.truth.templateCode,
      templateVersion: order.truth.templateVersion,
      familyId: order.truth.familyId,
      selectedComponentIds: [...order.truth.selectedComponentIds],
      values: { ...order.truth.values },
      measurements: order.truth.measurements.map((item) => ({ ...item })),
    },
    quantities: order.quantities.map((item) => ({ ...item })),
    requirements: productionInput.requirements,
    operations,
    ...(siteInstallation ? { siteInstallation } : {}),
    usedTechnicalSettings: productionInput.usedTechnicalSettings,
    usedRecipes: productionInput.usedRecipes,
    ...(productionInput.usedFormulas ? { usedFormulas: productionInput.usedFormulas } : {}),
    eic: {
      total: order.eic.total,
      currency: order.eic.currency,
      completeness: order.eic.completeness,
      lines: order.eic.lines.map((line) => ({ ...line })),
    },
  };
  const contentHash = canonicalContentHash(hashedContent);
  return {
    ok: true,
    snapshot: deepFreeze({
      snapshotId: `aps:${order.productCode}:${contentHash}`,
      ...hashedContent,
      sourceConfirmedAt: order.sourceAcceptedAt,
      createdAt: options?.createdAt ?? new Date().toISOString(),
      contentHash,
    }),
  };
}

export function isOrderProductionRelease(snapshot: AcceptedProductionSnapshot): boolean {
  return snapshot.releaseSource === "ORDER" || Boolean(snapshot.sourceOrderSnapshotId);
}

export const COMMERCIAL_EXECUTION_ERRORS = [
  "release_order_mismatch",
  "empty_release_operations",
] as const;
export type CommercialExecutionError = (typeof COMMERCIAL_EXECUTION_ERRORS)[number];

const EXECUTION_MISMATCH_REASON =
  "Planul de execuție comercial poate fi creat doar din eliberarea comenzii.";
const EMPTY_OPERATIONS_REASON = "Eliberarea nu conține operații înghețate.";

export function assertOrderReleaseReadyForExecution(
  snapshot: AcceptedProductionSnapshot,
  order: OrderSnapshot | null,
):
  | { ok: true }
  | { ok: false; error: CommercialExecutionError; reasons: readonly string[] } {
  if (snapshot.operations.length === 0) {
    return {
      ok: false,
      error: "empty_release_operations",
      reasons: [EMPTY_OPERATIONS_REASON],
    };
  }
  if (!isOrderProductionRelease(snapshot)) {
    return { ok: true };
  }
  if (
    !order ||
    order.orderSnapshotId !== snapshot.sourceOrderSnapshotId ||
    order.contentHash !== snapshot.sourceOrderContentHash ||
    order.productCode !== snapshot.productCode
  ) {
    return {
      ok: false,
      error: "release_order_mismatch",
      reasons: [EXECUTION_MISMATCH_REASON],
    };
  }
  return { ok: true };
}

export function productionReleaseErrorLabel(error: ProductionReleaseError): string {
  switch (error) {
    case "incompatible_order_source":
      return INCOMPATIBLE_REASON;
    case "missing_production_input":
      return MISSING_INPUT_REASON;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

function siteInstallationFromOrder(order: OrderSnapshot) {
  if (order.schemaVersion !== ORDER_SNAPSHOT_SCHEMA_VERSION_V2) {
    return null;
  }
  const line = order.lines?.find((item) => item.kind === "SITE_INSTALLATION");
  if (!line || line.kind !== "SITE_INSTALLATION" || line.lineVersion !== 2) {
    return null;
  }
  return projectSiteInstallationOperationalView({
    providerMode: line.providerMode,
    hostContext: line.hostContext,
    mountingInterface: line.mountingInterface,
    siteExecutionContext: line.siteExecutionContext,
  });
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
