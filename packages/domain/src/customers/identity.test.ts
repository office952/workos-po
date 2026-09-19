import { describe, expect, it } from "vitest";
import {
  createCustomer,
  generateCustomerId,
  renameCustomer,
  retireCustomer,
  updateCustomer,
} from "./identity.js";

describe("commercial customer identity", () => {
  it("creates an ACTIVE customer with a stable generated id", () => {
    const created = createCustomer("SC Exemplu SRL", {
      createdAt: "2026-08-17T08:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.customer.customerId.startsWith("cus:")).toBe(true);
    expect(created.customer.displayName).toBe("SC Exemplu SRL");
    expect(created.customer.status).toBe("ACTIVE");
    expect(created.customer.createdAt).toBe("2026-08-17T08:00:00.000Z");
    expect(created.customer.updatedAt).toBe("2026-08-17T08:00:00.000Z");
    expect(created.customer.retiredAt).toBeNull();
    expect(created.customer.cui).toBeNull();
    expect(created.customer.contactName).toBeNull();
    expect(created.customer.customerId).not.toBe("SC Exemplu SRL");
  });

  it("keeps customerId when the display name changes", () => {
    const created = createCustomer("SC Exemplu SRL", {
      customerId: "cus:test-stable",
    });
    if (!created.ok) {
      throw new Error("expected customer");
    }
    const renamed = renameCustomer(
      created.customer,
      "SC Exemplu Nou SRL",
      "2026-08-17T09:00:00.000Z",
    );
    expect(renamed).toEqual({
      ok: true,
      alreadyApplied: false,
      customer: {
        ...created.customer,
        displayName: "SC Exemplu Nou SRL",
        updatedAt: "2026-08-17T09:00:00.000Z",
      },
    });
    expect(generateCustomerId().startsWith("cus:")).toBe(true);
  });

  it("allows two customers with the same display name", () => {
    const first = createCustomer("Client Demo", { customerId: "cus:one" });
    const second = createCustomer("Client Demo", { customerId: "cus:two" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.customer.displayName).toBe(second.customer.displayName);
    expect(first.customer.customerId).not.toBe(second.customer.customerId);
  });

  it("retires a customer without deleting identity", () => {
    const created = createCustomer("Client retras");
    if (!created.ok) {
      throw new Error("expected customer");
    }
    const retired = retireCustomer(created.customer, "2026-08-17T10:00:00.000Z");
    expect(retired.ok).toBe(true);
    if (!retired.ok) {
      return;
    }
    expect(retired.customer.customerId).toBe(created.customer.customerId);
    expect(retired.customer.status).toBe("RETIRED");
    expect(retired.customer.retiredAt).toBe("2026-08-17T10:00:00.000Z");
    expect(retired.customer.updatedAt).toBe("2026-08-17T10:00:00.000Z");
    expect(retireCustomer(retired.customer, "2026-08-17T11:00:00.000Z")).toEqual({
      ok: true,
      alreadyApplied: true,
      customer: retired.customer,
    });
  });

  it("rejects an empty or oversized name", () => {
    expect(createCustomer("   ")).toEqual({ ok: false, error: "invalid_name" });
    expect(createCustomer("x".repeat(81))).toEqual({ ok: false, error: "invalid_name" });
  });

  it("creates a customer with optional profile fields", () => {
    const created = createCustomer("HUB MEDIA", {
      profile: {
        cui: "RO12345678",
        contactName: "Ana Pop",
        phone: "0722000000",
        email: "ana@hub.ro",
        address: "Str. Exemplu 1",
        city: "București",
        notes: "Client vechi",
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.customer.cui).toBe("RO12345678");
    expect(created.customer.contactName).toBe("Ana Pop");
    expect(created.customer.phone).toBe("0722000000");
    expect(created.customer.email).toBe("ana@hub.ro");
    expect(created.customer.address).toBe("Str. Exemplu 1");
    expect(created.customer.city).toBe("București");
    expect(created.customer.notes).toBe("Client vechi");
  });

  it("updates current profile without changing customerId", () => {
    const created = createCustomer("Client Alpha");
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const updated = updateCustomer(created.customer, {
      displayName: "Client Alpha SRL",
      cui: "RO999",
      contactName: "Ion",
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) {
      return;
    }
    expect(updated.customer.customerId).toBe(created.customer.customerId);
    expect(updated.customer.displayName).toBe("Client Alpha SRL");
    expect(updated.customer.cui).toBe("RO999");
    expect(updated.customer.contactName).toBe("Ion");
  });

  it("rejects oversized optional profile fields", () => {
    const created = createCustomer("Client");
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(updateCustomer(created.customer, { cui: "x".repeat(33) })).toEqual({
      ok: false,
      error: "invalid_profile",
    });
  });
});
