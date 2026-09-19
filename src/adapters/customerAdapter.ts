import type { CustomerTransport } from "../api/types";
import { asRecord, asString } from "./record";

export function presentCustomer(value: unknown): CustomerTransport | null {
  const record = asRecord(value);
  const customer = record ? asRecord(record.customer) ?? record : null;
  if (!customer || typeof customer.customerId !== "string" || typeof customer.displayName !== "string") {
    return null;
  }
  return {
    customerId: customer.customerId,
    displayName: customer.displayName,
    status: asString(customer.status) ?? "ACTIVE",
    city: asString(customer.city),
  };
}

export function presentCustomerList(payload: unknown): CustomerTransport[] {
  const record = asRecord(payload);
  const customers = record?.customers;
  if (!Array.isArray(customers)) {
    return [];
  }
  return customers.flatMap((item) => {
    const presented = presentCustomer(item);
    return presented ? [presented] : [];
  });
}
