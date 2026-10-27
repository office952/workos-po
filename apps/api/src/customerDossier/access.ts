import type { MiddlewareHandler } from "hono";
import { getCloudRole, getProductSystem, isCloudMode, type ApiContext, type ApiEnv } from "../cloud/context.js";
import type { MembershipRole } from "../cloud/controlPlane.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { actorUserId } from "../product.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";

/**
 * Who may do what in a customer's dossier. Organization isolation is structural: every
 * request runs against the active organization's own plane (database + documents root), so a
 * customer, document or link of another organization is simply not found. Inside the plane,
 * every association and download is checked against the customer in the path.
 */
export const CUSTOMER_DOSSIER_ACTIONS = [
  "read",
  "editSites",
  "uploadDocuments",
  "editDocuments",
  "recordHistoricalWork",
  "editCommercialTerms",
  // N-023 · set, replace or clear the customer logo.
  "editLogo",
] as const;
export type CustomerDossierAction = (typeof CUSTOMER_DOSSIER_ACTIONS)[number];

export const CUSTOMER_DOSSIER_PERMISSIONS: Record<CustomerDossierAction, readonly MembershipRole[]> = {
  read: ["owner", "member"],
  editSites: ["owner", "member"],
  uploadDocuments: ["owner", "member"],
  editDocuments: ["owner", "member"],
  recordHistoricalWork: ["owner", "member"],
  // Payment terms, advance and currency are financial agreements: owner only, as prices are.
  editCommercialTerms: ["owner"],
  editLogo: ["owner", "member"],
};

export function canDossier(c: ApiContext, action: CustomerDossierAction): boolean {
  if (!isCloudMode(c)) return true;
  const role = getCloudRole(c);
  return role !== null && CUSTOMER_DOSSIER_PERMISSIONS[action].includes(role);
}

export function dossierPermissions(c: ApiContext): Record<CustomerDossierAction, boolean> {
  return Object.fromEntries(CUSTOMER_DOSSIER_ACTIONS.map((action) => [action, canDossier(c, action)])) as Record<
    CustomerDossierAction,
    boolean
  >;
}

export function requireDossierPermission(action: CustomerDossierAction): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    if (!canDossier(c, action)) return c.json({ error: "forbidden" }, 403);
    await next();
  };
}

export type DossierPlane = {
  runtime: ProductSystemRuntime;
  db: SqliteDatabase;
  documentsRoot: string;
  actorAccountId: string;
};

export function dossierPlane(c: ApiContext): DossierPlane {
  const runtime = getProductSystem(c);
  return { runtime, db: runtime.assemblyPlane().db, documentsRoot: runtime.documentsRoot, actorAccountId: actorUserId(c) };
}

/**
 * The revision an edit is based on: required on every PATCH of an existing site, document or
 * historical work, a positive integer. Without it an edit would overwrite blindly.
 */
export function readExpectedRevision(body: unknown): number | null {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>).expectedRevision : undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

export const MISSING_EXPECTED_REVISION = { error: "invalid_payload", field: "expectedRevision" } as const;

export function customerExists(db: SqliteDatabase, customerId: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM customers WHERE customer_id = ?").get(customerId));
}

export function recordDossierEvent(
  db: SqliteDatabase,
  input: { customerId: string; kind: string; subjectId: string | null; actorAccountId: string; occurredAt: string; detail?: unknown },
): void {
  db.prepare(
    `INSERT INTO customer_dossier_events (event_id, customer_id, event_kind, subject_id, actor_account_id, occurred_at, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `cdev:${crypto.randomUUID()}`,
    input.customerId,
    input.kind,
    input.subjectId,
    input.actorAccountId,
    input.occurredAt,
    JSON.stringify(input.detail ?? {}),
  );
}

/** Is this request/job/site/historical work one of this customer's? Anything else is refused. */
export function subjectBelongsToCustomer(
  plane: DossierPlane,
  customerId: string,
  kind: "SITE" | "REQUEST" | "JOB" | "HISTORICAL_WORK",
  subjectId: string,
): boolean {
  switch (kind) {
    case "SITE":
      return Boolean(plane.db.prepare("SELECT 1 FROM customer_sites WHERE site_id = ? AND customer_id = ?").get(subjectId, customerId));
    case "HISTORICAL_WORK":
      return Boolean(
        plane.db.prepare("SELECT 1 FROM customer_historical_works WHERE work_id = ? AND customer_id = ?").get(subjectId, customerId),
      );
    case "REQUEST":
      return plane.runtime.readCommercialRequest(subjectId)?.customerId === customerId;
    case "JOB":
      return (plane.runtime.readCustomerWorkspace(customerId)?.jobs ?? []).some((job) => job.jobId === subjectId);
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
