import { join } from "node:path";
import Database from "better-sqlite3";
import { demoPlaneSqlitePath } from "./demoAtelierHistory.js";

/**
 * N-019 setup chronology correction (Owner GO 2026-10-23), synthetic root only.
 *
 * The init/prepare setup (organization, users, plane, seller, skills,
 * workcenters, machines, people, skill assignments, operator credentials,
 * customers) was created on 2026-10-23, after the synthetic history H1. This
 * moves exactly those creation metadata, uniformly, so the organization lands
 * on the onboarding reference and the original order is kept.
 *
 * Allowlist only. Excluded on purpose: pricing foundations (formula and
 * technical-setting versions, cost evidence) whose timestamps are copied into
 * frozen quote/order/production documents; technical runtime facts
 * (migrations, bootstrap markers, display metadata); authentication sessions;
 * everything outside the recorded setup window (later modifications and all
 * of H1/C1). No hash, ID, payload or event is touched.
 */

export const DEMO_CHRONOLOGY_ID = "SETUP-ONBOARDING-1";
export const DEMO_ONBOARDING_REFERENCE = "2026-09-28T06:00:00.000Z";

type Field = { db: "plane" | "control"; table: string; column: string };

export const SAFE_SETUP_FIELDS: readonly Field[] = [
  { db: "control", table: "organizations", column: "created_at" },
  { db: "control", table: "organizations", column: "updated_at" },
  { db: "control", table: "users", column: "created_at" },
  { db: "control", table: "users", column: "updated_at" },
  { db: "control", table: "organization_memberships", column: "created_at" },
  { db: "control", table: "operational_planes", column: "created_at" },
  { db: "plane", table: "operational_plane_identity", column: "bound_at" },
  { db: "plane", table: "seller_profile", column: "updated_at" },
  { db: "plane", table: "skills", column: "created_at" },
  { db: "plane", table: "skills", column: "updated_at" },
  { db: "plane", table: "organization_workcenters", column: "created_at" },
  { db: "plane", table: "organization_workcenters", column: "updated_at" },
  { db: "plane", table: "organization_machines", column: "created_at" },
  { db: "plane", table: "organization_machines", column: "updated_at" },
  { db: "plane", table: "organization_provider_configuration", column: "applied_at" },
  { db: "plane", table: "people", column: "created_at" },
  { db: "plane", table: "people", column: "updated_at" },
  { db: "plane", table: "people", column: "availability_updated_at" },
  { db: "plane", table: "person_skill_assignments", column: "assigned_at" },
  { db: "plane", table: "operator_credentials", column: "created_at" },
  { db: "plane", table: "operator_credentials", column: "updated_at" },
  { db: "plane", table: "customers", column: "created_at" },
  { db: "plane", table: "customers", column: "updated_at" },
];

const ISO = /^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;

export type ChronologyPlan = {
  window: { from: string; to: string };
  anchor: string;
  deltaMs: number;
  fields: Array<Field & { rows: number; first: string | null; last: string | null }>;
  /** Allowlisted values that also appear inside another text field (payload, ID, JSON). Must be empty. */
  collisions: string[];
  rowsTotal: number;
};

function q(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function prefix(field: Field): string {
  return field.db === "control" ? "ctl." : "main.";
}

function openAttached(root: string, readonly: boolean): Database.Database {
  const db = new Database(demoPlaneSqlitePath(root), { readonly, fileMustExist: true });
  db.prepare("ATTACH DATABASE ? AS ctl").run(join(root, "control", "control-plane.sqlite"));
  return db;
}

function windowValues(db: Database.Database, field: Field, start: number, end: number): string[] {
  const rows = db.prepare(`SELECT DISTINCT ${q(field.column)} AS value FROM ${prefix(field)}${q(field.table)} WHERE typeof(${q(field.column)}) = 'text'`).all() as Array<{ value: string }>;
  return rows.map((row) => row.value).filter((value) => ISO.test(value) && Date.parse(value) >= start && Date.parse(value) < end).sort();
}

/**
 * Read-only plan: rows per allowlisted field inside the setup window, the
 * uniform shift, and a collision scan of every other text field in both
 * databases (payloads, IDs, JSON, event details).
 */
export function planSetupChronology(root: string, window: { from: string; to: string }): ChronologyPlan {
  const db = openAttached(root, true);
  try {
    const organizationCreated = (db.prepare("SELECT MIN(created_at) AS first FROM ctl.organizations").get() as { first: string }).first;
    // The window starts at organization creation (init), slightly before the plane binding.
    const start = Math.min(Date.parse(organizationCreated), Date.parse(window.from));
    const end = Date.parse(window.to);
    const anchor = organizationCreated;
    const deltaMs = Date.parse(DEMO_ONBOARDING_REFERENCE) - Date.parse(anchor);
    const fields = SAFE_SETUP_FIELDS.map((field) => {
      const values = windowValues(db, field, start, end);
      const count = values.length
        ? (db.prepare(`SELECT COUNT(*) AS n FROM ${prefix(field)}${q(field.table)} WHERE ${q(field.column)} IN (${values.map(() => "?").join(",")})`).get(...values) as { n: number }).n
        : 0;
      return { ...field, rows: count, first: values[0] ?? null, last: values.at(-1) ?? null };
    });
    const allowlisted = new Set(SAFE_SETUP_FIELDS.flatMap((field) => windowValues(db, field, start, end)));
    const collisions: string[] = [];
    for (const schema of ["main", "ctl"]) {
      const tables = db.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as Array<{ name: string }>;
      for (const { name } of tables) {
        const columns = db.prepare(`PRAGMA ${schema}.table_info(${q(name)})`).all() as Array<{ name: string }>;
        for (const column of columns) {
          const rows = db.prepare(`SELECT ${q(column.name)} AS value FROM ${schema}.${q(name)} WHERE typeof(${q(column.name)}) = 'text'`).all() as Array<{ value: string }>;
          for (const { value } of rows) {
            if (ISO.test(value)) continue;
            for (const candidate of allowlisted) {
              if (value.includes(candidate)) collisions.push(`${schema}.${name}.${column.name}:${candidate}`);
            }
          }
        }
      }
    }
    return {
      window: { from: new Date(start).toISOString(), to: window.to },
      anchor,
      deltaMs,
      fields,
      collisions: [...new Set(collisions)],
      rowsTotal: fields.reduce((sum, field) => sum + field.rows, 0),
    };
  } finally {
    db.close();
  }
}

/** Applies the plan in one transaction across both databases (ATTACH). Refuses on any collision. */
export function applySetupChronology(root: string, plan: ChronologyPlan): Record<string, number> {
  if (plan.collisions.length > 0) {
    throw new Error(`chronology_collisions:${plan.collisions.join(",")}`);
  }
  const start = Date.parse(plan.window.from);
  const end = Date.parse(plan.window.to);
  const db = openAttached(root, false);
  try {
    const changed: Record<string, number> = {};
    db.transaction(() => {
      for (const field of SAFE_SETUP_FIELDS) {
        for (const value of windowValues(db, field, start, end)) {
          const next = new Date(Date.parse(value) + plan.deltaMs).toISOString();
          const result = db.prepare(`UPDATE ${prefix(field)}${q(field.table)} SET ${q(field.column)} = ? WHERE ${q(field.column)} = ?`).run(next, value);
          const key = `${field.db}.${field.table}.${field.column}`;
          changed[key] = (changed[key] ?? 0) + result.changes;
        }
      }
    })();
    return changed;
  } finally {
    db.close();
  }
}
