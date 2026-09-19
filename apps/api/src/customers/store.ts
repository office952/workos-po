import {
  createCustomer,
  customerFromRow,
  retireCustomer,
  updateCustomer,
  type Customer,
  type CustomerMutationResult,
  type CustomerProfilePatch,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type CustomerRow = {
  customer_id: string;
  display_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  retired_at: string | null;
  cui: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  notes: string | null;
};

const CUSTOMER_COLUMNS = `
  customer_id, display_name, status, created_at, updated_at, retired_at,
  cui, contact_name, phone, email, address, city, notes
`;

function customerFromStoredRow(row: CustomerRow): Customer | null {
  return customerFromRow(
    row.customer_id,
    row.display_name,
    row.status,
    row.created_at,
    row.updated_at,
    row.retired_at,
    {
      cui: row.cui,
      contactName: row.contact_name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      notes: row.notes,
    },
  );
}

export function listCustomers(db: SqliteDatabase): Customer[] {
  const rows = db
    .prepare(
      `
      SELECT ${CUSTOMER_COLUMNS}
      FROM customers
      ORDER BY display_name COLLATE NOCASE
    `,
    )
    .all() as CustomerRow[];
  return rows.flatMap((row) => {
    const customer = customerFromStoredRow(row);
    return customer ? [customer] : [];
  });
}

export function getCustomer(db: SqliteDatabase, customerId: string): Customer | null {
  const row = db
    .prepare(
      `
      SELECT ${CUSTOMER_COLUMNS}
      FROM customers
      WHERE customer_id = ?
    `,
    )
    .get(customerId) as CustomerRow | undefined;
  return row ? customerFromStoredRow(row) : null;
}

export function persistCreatedCustomer(
  db: SqliteDatabase,
  displayName: string,
  profile?: CustomerProfilePatch,
): CustomerMutationResult {
  const created = createCustomer(displayName, { profile });
  if (!created.ok) {
    return created;
  }
  insertCustomerRow(db, created.customer);
  return created;
}

export function persistUpdatedCustomer(
  db: SqliteDatabase,
  customerId: string,
  patch: CustomerProfilePatch,
): CustomerMutationResult {
  const current = getCustomer(db, customerId);
  if (!current) {
    return { ok: false, error: "not_found" };
  }
  const updated = updateCustomer(current, patch);
  if (!updated.ok || updated.alreadyApplied) {
    return updated;
  }
  writeCustomerRow(db, updated.customer);
  return updated;
}

export function persistRenamedCustomer(
  db: SqliteDatabase,
  customerId: string,
  displayName: string,
): CustomerMutationResult {
  return persistUpdatedCustomer(db, customerId, { displayName });
}

export function persistRetiredCustomer(
  db: SqliteDatabase,
  customerId: string,
  retiredAt: string,
): CustomerMutationResult {
  const current = getCustomer(db, customerId);
  if (!current) {
    return { ok: false, error: "not_found" };
  }
  const retired = retireCustomer(current, retiredAt);
  if (!retired.ok || retired.alreadyApplied) {
    return retired;
  }
  db.prepare(
    `
    UPDATE customers
    SET status = ?, updated_at = ?, retired_at = ?
    WHERE customer_id = ?
  `,
  ).run(
    retired.customer.status,
    retired.customer.updatedAt,
    retired.customer.retiredAt,
    customerId,
  );
  return retired;
}

function insertCustomerRow(db: SqliteDatabase, customer: Customer): void {
  db.prepare(
    `
    INSERT INTO customers (
      customer_id, display_name, status, created_at, updated_at, retired_at,
      cui, contact_name, phone, email, address, city, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    customer.customerId,
    customer.displayName,
    customer.status,
    customer.createdAt,
    customer.updatedAt,
    customer.retiredAt,
    customer.cui,
    customer.contactName,
    customer.phone,
    customer.email,
    customer.address,
    customer.city,
    customer.notes,
  );
}

function writeCustomerRow(db: SqliteDatabase, customer: Customer): void {
  db.prepare(
    `
    UPDATE customers
    SET display_name = ?, updated_at = ?, cui = ?, contact_name = ?, phone = ?,
        email = ?, address = ?, city = ?, notes = ?
    WHERE customer_id = ?
  `,
  ).run(
    customer.displayName,
    customer.updatedAt,
    customer.cui,
    customer.contactName,
    customer.phone,
    customer.email,
    customer.address,
    customer.city,
    customer.notes,
    customer.customerId,
  );
}
