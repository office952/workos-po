import {
  productionCapabilityClasses,
  type PersonMutationError,
  type PersonSkillMutationError,
  type SkillMutationError,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

export function registerPeopleRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/people", (c) => {
    const runtime = getProductSystem(c);
    return c.json({
      people: runtime.listPeople(),
      registry: runtime.listPeopleRegistry(),
    });
  });

  app.get("/api/people/skills", (c) => {
    const runtime = getProductSystem(c);
    return c.json({ skills: runtime.listSkills() });
  });

  app.get("/api/people/eligibility", (c) => {
    const runtime = getProductSystem(c);
    const capabilityId = c.req.query("capabilityId") ?? "";
    if (!isCapabilityId(capabilityId)) {
      return c.json({ error: "invalid_capability" }, 400);
    }
    return c.json(runtime.readEligibility(capabilityId));
  });

  app.post("/api/people/skills", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const payload = body as {
      code?: unknown;
      displayLabel?: unknown;
      description?: unknown;
    };
    if (typeof payload.code !== "string" || typeof payload.displayLabel !== "string") {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.createSkill({
      code: payload.code,
      displayLabel: payload.displayLabel,
      description: typeof payload.description === "string" ? payload.description : null,
    });
    if (!result.ok) {
      return c.json({ error: result.error }, skillHttpStatus(result.error));
    }
    return c.json({ skill: result.skill, skills: runtime.listSkills() }, 201);
  });

  app.patch("/api/people/skills/:skillId", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const payload = body as { displayLabel?: unknown; status?: unknown };
    if (payload.status === "RETIRED") {
      const result = runtime.retireSkill(c.req.param("skillId"));
      if (!result.ok) {
        return c.json({ error: result.error }, skillHttpStatus(result.error));
      }
      return c.json({ skill: result.skill, skills: runtime.listSkills() });
    }
    if (typeof payload.displayLabel !== "string") {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.renameSkill(c.req.param("skillId"), payload.displayLabel);
    if (!result.ok) {
      return c.json({ error: result.error }, skillHttpStatus(result.error));
    }
    return c.json({ skill: result.skill, skills: runtime.listSkills() });
  });

  app.get("/api/people/:personId", (c) => {
    const runtime = getProductSystem(c);
    const person = runtime.getPerson(c.req.param("personId"));
    if (!person) {
      return c.json({ error: "not_found" }, 404);
    }
    const registry = runtime.listPeopleRegistry();
    const item = registry.people.find((entry) => entry.personId === person.personId);
    return c.json({
      person,
      item: item ?? null,
      operatorPinConfigured: runtime.personHasOperatorPin(person.personId),
    });
  });

  app.post("/api/people", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    const displayName = readDisplayName(body);
    if (displayName === null) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.createPerson(displayName, {
      roleLabel: readOptionalString(body, "roleLabel"),
    });
    if (!result.ok) {
      return c.json({ error: result.error }, personHttpStatus(result.error));
    }
    return c.json(
      { person: result.person, people: runtime.listPeople(), registry: runtime.listPeopleRegistry() },
      201,
    );
  });

  app.patch("/api/people/:personId", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const payload = body as {
      displayName?: unknown;
      status?: unknown;
      availability?: unknown;
      unavailableReason?: unknown;
      unavailableUntil?: unknown;
      roleLabel?: unknown;
    };
    if (payload.status === "RETIRED") {
      const result = runtime.retirePerson(c.req.param("personId"));
      if (!result.ok) {
        return c.json({ error: result.error }, personHttpStatus(result.error));
      }
      return c.json({
        alreadyApplied: result.alreadyApplied,
        person: result.person,
        people: runtime.listPeople(),
        registry: runtime.listPeopleRegistry(),
      });
    }
    const result = runtime.updatePerson(c.req.param("personId"), {
      displayName: typeof payload.displayName === "string" ? payload.displayName : undefined,
      availability:
        payload.availability === "AVAILABLE" || payload.availability === "TEMPORARILY_UNAVAILABLE"
          ? payload.availability
          : undefined,
      unavailableReason:
        typeof payload.unavailableReason === "string" || payload.unavailableReason === null
          ? payload.unavailableReason
          : undefined,
      unavailableUntil:
        typeof payload.unavailableUntil === "string" || payload.unavailableUntil === null
          ? payload.unavailableUntil
          : undefined,
      roleLabel:
        typeof payload.roleLabel === "string" || payload.roleLabel === null
          ? payload.roleLabel
          : undefined,
    });
    if (!result.ok) {
      return c.json({ error: result.error }, personHttpStatus(result.error));
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      person: result.person,
      people: runtime.listPeople(),
      registry: runtime.listPeopleRegistry(),
    });
  });

  app.post("/api/people/:personId/skills", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    const skillId = readOptionalString(body, "skillId");
    if (!skillId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.assignPersonSkill(c.req.param("personId"), skillId);
    if (!result.ok) {
      return c.json({ error: result.error }, assignmentHttpStatus(result.error));
    }
    return c.json({
      assignment: result.assignment,
      registry: runtime.listPeopleRegistry(),
    });
  });

  app.patch("/api/people/:personId/skills/:skillId", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    if (
      typeof body !== "object" ||
      body === null ||
      (body as { status?: unknown }).status !== "RETIRED"
    ) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.retirePersonSkill(
      c.req.param("personId"),
      c.req.param("skillId"),
    );
    if (!result.ok) {
      return c.json({ error: result.error }, assignmentHttpStatus(result.error));
    }
    return c.json({
      assignment: result.assignment,
      registry: runtime.listPeopleRegistry(),
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

function readOptionalString(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null || !(key in body)) {
    return null;
  }
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isCapabilityId(value: string): boolean {
  return productionCapabilityClasses.some((item) => item.id === value);
}

function personHttpStatus(error: PersonMutationError): 400 | 404 | 409 {
  switch (error) {
    case "invalid_name":
    case "invalid_availability":
    case "invalid_profile":
      return 400;
    case "not_found":
    case "already_retired":
      return 404;
    case "has_active_task":
      return 409;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

function skillHttpStatus(error: SkillMutationError): 400 | 404 {
  switch (error) {
    case "invalid_code":
    case "invalid_label":
    case "invalid_description":
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

function assignmentHttpStatus(error: PersonSkillMutationError): 400 | 404 | 409 {
  switch (error) {
    case "unknown_person":
    case "unknown_skill":
    case "not_found":
      return 404;
    case "retired_person":
    case "retired_skill":
    case "already_assigned":
      return 409;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
