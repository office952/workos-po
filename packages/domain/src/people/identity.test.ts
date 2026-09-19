import { describe, expect, it } from "vitest";
import {
  createPerson,
  generatePersonId,
  renamePerson,
  retirePerson,
  setPersonAvailability,
} from "./identity.js";

describe("operational person identity", () => {
  it("creates an ACTIVE available person with a stable generated id", () => {
    const created = createPerson("Maria Ionescu", {
      createdAt: "2026-08-16T17:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(created.person.personId.startsWith("per:")).toBe(true);
    expect(created.person.displayName).toBe("Maria Ionescu");
    expect(created.person.status).toBe("ACTIVE");
    expect(created.person.availability).toBe("AVAILABLE");
    expect(created.person.retiredAt).toBeNull();
    expect(created.person.personId).not.toBe("Maria Ionescu");
  });

  it("keeps personId when the display name changes", () => {
    const created = createPerson("Maria Ionescu", {
      personId: "per:test-stable",
    });
    if (!created.ok) {
      throw new Error("expected person");
    }
    const renamed = renamePerson(created.person, "Maria I.", "2026-08-17T12:00:00.000Z");
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    expect(renamed.person.personId).toBe("per:test-stable");
    expect(renamed.person.displayName).toBe("Maria I.");
    expect(generatePersonId().startsWith("per:")).toBe(true);
  });

  it("retires a person without deleting identity", () => {
    const created = createPerson("Executor test");
    if (!created.ok) {
      throw new Error("expected person");
    }
    const retired = retirePerson(created.person, "2026-08-16T17:10:00.000Z");
    expect(retired.ok).toBe(true);
    if (!retired.ok) {
      return;
    }
    expect(retired.person.personId).toBe(created.person.personId);
    expect(retired.person.status).toBe("RETIRED");
    expect(retired.person.retiredAt).toBe("2026-08-16T17:10:00.000Z");
    expect(retirePerson(retired.person, "2026-08-16T18:00:00.000Z")).toEqual({
      ok: true,
      alreadyApplied: true,
      person: retired.person,
    });
  });

  it("blocks retire when the person owns an in-progress task", () => {
    const created = createPerson("Executor test");
    if (!created.ok) {
      throw new Error("expected person");
    }
    expect(
      retirePerson(created.person, "2026-08-17T12:00:00.000Z", { hasActiveTask: true }),
    ).toEqual({ ok: false, error: "has_active_task" });
    expect(created.person.status).toBe("ACTIVE");
  });

  it("marks temporary unavailability without changing employment or identity", () => {
    const created = createPerson("Florin CNC", { personId: "per:florin" });
    if (!created.ok) {
      throw new Error("expected person");
    }
    const unavailable = setPersonAvailability(created.person, {
      availability: "TEMPORARILY_UNAVAILABLE",
      reason: "Concediu",
      until: "2026-08-24",
      updatedAt: "2026-08-17T12:00:00.000Z",
    });
    expect(unavailable.ok).toBe(true);
    if (!unavailable.ok) {
      return;
    }
    expect(unavailable.person.status).toBe("ACTIVE");
    expect(unavailable.person.availability).toBe("TEMPORARILY_UNAVAILABLE");
    expect(unavailable.person.unavailableReason).toBe("Concediu");
    const restored = setPersonAvailability(unavailable.person, {
      availability: "AVAILABLE",
      updatedAt: "2026-08-17T13:00:00.000Z",
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.person.availability).toBe("AVAILABLE");
    expect(restored.person.unavailableReason).toBeNull();
    expect(restored.person.personId).toBe("per:florin");
  });

  it("rejects an empty or oversized name", () => {
    expect(createPerson("   ")).toEqual({ ok: false, error: "invalid_name" });
    expect(createPerson("x".repeat(81))).toEqual({ ok: false, error: "invalid_name" });
  });
});
