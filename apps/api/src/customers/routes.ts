import type {
  CustomerMutationError,
  CustomerProfilePatch,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";

export function registerCustomerRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/customers", (c) => {
    const runtime = getProductSystem(c);
    return c.json({
      customers: runtime.listCustomers(),
      registry: runtime.listCustomerRegistry(),
    });
  });

  app.get("/api/customers/:customerId/workspace", (c) => {
    const runtime = getProductSystem(c);
    const workspace = runtime.readCustomerWorkspace(c.req.param("customerId"));
    if (!workspace) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ workspace });
  });

  app.get("/api/customers/:customerId", (c) => {
    const runtime = getProductSystem(c);
    const customer = runtime.getCustomer(c.req.param("customerId"));
    if (!customer) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ customer });
  });

  app.post("/api/customers", async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    const displayName = readDisplayName(body);
    if (displayName === null) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.createCustomer(displayName, readProfilePatch(body));
    if (!result.ok) {
      return c.json({ error: result.error }, customerHttpStatus(result.error));
    }
    return c.json({ customer: result.customer, customers: runtime.listCustomers() }, 201);
  });

  app.patch("/api/customers/:customerId", async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const payload = body as { displayName?: unknown; status?: unknown };
    if (payload.status === "RETIRED") {
      const result = runtime.retireCustomer(c.req.param("customerId"));
      if (!result.ok) {
        return c.json({ error: result.error }, customerHttpStatus(result.error));
      }
      return c.json({
        alreadyApplied: result.alreadyApplied,
        customer: result.customer,
        customers: runtime.listCustomers(),
      });
    }
    const patch = readProfilePatch(body);
    if (payload.displayName !== undefined) {
      if (typeof payload.displayName !== "string") {
        return c.json({ error: "invalid_payload" }, 400);
      }
      patch.displayName = payload.displayName;
    }
    if (Object.keys(patch).length === 0) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.updateCustomer(c.req.param("customerId"), patch);
    if (!result.ok) {
      return c.json({ error: result.error }, customerHttpStatus(result.error));
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      customer: result.customer,
      customers: runtime.listCustomers(),
    });
  });
}

function readDisplayName(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("displayName" in body)) {
    return null;
  }
  const value = (body as { displayName: unknown }).displayName;
  return typeof value === "string" ? value : null;
}

function readProfilePatch(body: unknown): CustomerProfilePatch {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return {};
  }
  const payload = body as Record<string, unknown>;
  const patch: CustomerProfilePatch = {};
  assignOptional(patch, "cui", payload.cui);
  assignOptional(patch, "contactName", payload.contactName);
  assignOptional(patch, "phone", payload.phone);
  assignOptional(patch, "email", payload.email);
  assignOptional(patch, "address", payload.address);
  assignOptional(patch, "city", payload.city);
  assignOptional(patch, "notes", payload.notes);
  return patch;
}

function assignOptional(
  patch: CustomerProfilePatch,
  key: keyof Omit<CustomerProfilePatch, "displayName">,
  value: unknown,
): void {
  if (value === undefined) {
    return;
  }
  if (value === null) {
    patch[key] = null;
    return;
  }
  if (typeof value === "string") {
    patch[key] = value;
  }
}

function customerHttpStatus(error: CustomerMutationError): 400 | 404 {
  switch (error) {
    case "invalid_name":
    case "invalid_profile":
      return 400;
    case "not_found":
    case "already_retired":
      return 404;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
