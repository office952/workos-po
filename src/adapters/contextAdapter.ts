function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

export function presentCustomerId(payload: unknown): string | null {
  const record = asRecord(payload);
  const customer = asRecord(record?.customer);
  return typeof customer?.customerId === "string" ? customer.customerId : null;
}

export function presentSellerConfigured(payload: unknown): boolean {
  const record = asRecord(payload);
  return record?.configured === true;
}

export function presentRequestId(payload: unknown): string | null {
  const record = asRecord(payload);
  const request = asRecord(record?.request);
  return typeof request?.requestId === "string" ? request.requestId : null;
}
