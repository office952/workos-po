import {
  omitForbiddenFinancialFields,
  PROVIDER_LIFECYCLES,
  projectWorkcentersAdministration,
  type ProviderLifecycle,
  type ProviderMutationError,
} from "@workos-final/domain";
import type { Context, Hono } from "hono";
import { getProductSystem, isOwner, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";
import { OrganizationProviderPersistError } from "./organizationProviderStore.js";

export function workcentersAdminPayload(runtime: ProductSystemRuntime, canEdit: boolean) {
  const projection = projectWorkcentersAdministration(
    runtime.providerRegistry,
    runtime.listActiveCostEvidence(),
  );
  const visible = canEdit
    ? projection
    : omitForbiddenFinancialFields(projection, "commercial");
  if (!visible || typeof visible !== "object") {
    return { canEdit };
  }
  return { ...visible, canEdit };
}

export function registerWorkcenterRoutes(app: Hono<ApiEnv>): void {
  app.post("/api/workcenters", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const parsed = readCreateBody(await c.req.json().catch(() => null));
    if (!parsed) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    try {
      const result = runtime.createWorkcenter(parsed);
      if (!result.ok) {
        return c.json({ error: result.error }, providerHttpStatus(result.error));
      }
      return c.json(
        {
          workcenter: result.value,
          alreadyApplied: result.alreadyApplied,
          ...workcentersAdminPayload(runtime, isOwner(c)),
        },
        201,
      );
    } catch (error) {
      return providerPersistFailure(c, error);
    }
  });

  app.patch("/api/workcenters/:workcenterId", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const parsed = readWorkcenterPatch(await c.req.json().catch(() => null));
    if (!parsed) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    try {
      const result = runtime.updateWorkcenter(c.req.param("workcenterId"), parsed);
      if (!result.ok) {
        return c.json({ error: result.error }, providerHttpStatus(result.error));
      }
      return c.json({
        workcenter: result.value,
        alreadyApplied: result.alreadyApplied,
        ...workcentersAdminPayload(runtime, isOwner(c)),
      });
    } catch (error) {
      return providerPersistFailure(c, error);
    }
  });

  app.post("/api/machines", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const parsed = readMachineCreateBody(await c.req.json().catch(() => null));
    if (!parsed) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    try {
      const result = runtime.createMachine(parsed);
      if (!result.ok) {
        return c.json({ error: result.error }, providerHttpStatus(result.error));
      }
      return c.json(
        {
          machine: result.value,
          alreadyApplied: result.alreadyApplied,
          ...workcentersAdminPayload(runtime, isOwner(c)),
        },
        201,
      );
    } catch (error) {
      return providerPersistFailure(c, error);
    }
  });

  app.patch("/api/machines/:machineId", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const parsed = readMachinePatch(await c.req.json().catch(() => null));
    if (!parsed) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    try {
      const result = runtime.updateMachine(c.req.param("machineId"), parsed);
      if (!result.ok) {
        return c.json({ error: result.error }, providerHttpStatus(result.error));
      }
      return c.json({
        machine: result.value,
        alreadyApplied: result.alreadyApplied,
        ...workcentersAdminPayload(runtime, isOwner(c)),
      });
    } catch (error) {
      return providerPersistFailure(c, error);
    }
  });
}

function providerPersistFailure(c: Context<ApiEnv>, error: unknown) {
  if (error instanceof OrganizationProviderPersistError) {
    return c.json({ error: "internal" }, 500);
  }
  throw error;
}

function readCreateBody(body: unknown): {
  label: string;
  description?: string;
  lifecycle?: ProviderLifecycle;
  capabilityIds?: string[];
} | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  if (typeof record.label !== "string") {
    return null;
  }
  const lifecycle = readLifecycle(record);
  if (lifecycle === false) {
    return null;
  }
  const capabilityIds = readCapabilityIds(record.capabilityIds);
  if (capabilityIds === false) {
    return null;
  }
  return {
    label: record.label,
    description: typeof record.description === "string" ? record.description : undefined,
    lifecycle,
    capabilityIds,
  };
}

function readMachineCreateBody(body: unknown): {
  label: string;
  description?: string;
  workcenterId: string;
  lifecycle?: ProviderLifecycle;
  capabilityIds?: string[];
} | null {
  const created = readCreateBody(body);
  if (!created || typeof body !== "object" || body === null) {
    return null;
  }
  const workcenterId = (body as { workcenterId?: unknown }).workcenterId;
  if (typeof workcenterId !== "string" || workcenterId.trim() === "") {
    return null;
  }
  return { ...created, workcenterId };
}

function readWorkcenterPatch(body: unknown): {
  label?: string;
  description?: string;
  lifecycle?: ProviderLifecycle;
  capabilityIds?: string[];
} | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const lifecycle = readLifecycle(record);
  if (lifecycle === false) {
    return null;
  }
  const capabilityIds = readCapabilityIds(record.capabilityIds);
  if (capabilityIds === false) {
    return null;
  }
  return {
    label: typeof record.label === "string" ? record.label : undefined,
    description: typeof record.description === "string" ? record.description : undefined,
    lifecycle,
    capabilityIds,
  };
}

function readMachinePatch(body: unknown): {
  label?: string;
  description?: string;
  workcenterId?: string;
  lifecycle?: ProviderLifecycle;
  capabilityIds?: string[];
} | null {
  const patch = readWorkcenterPatch(body);
  if (!patch || typeof body !== "object" || body === null) {
    return null;
  }
  const workcenterId = (body as { workcenterId?: unknown }).workcenterId;
  if (workcenterId !== undefined && typeof workcenterId !== "string") {
    return null;
  }
  return {
    ...patch,
    workcenterId: typeof workcenterId === "string" ? workcenterId : undefined,
  };
}

function readLifecycle(record: Record<string, unknown>): ProviderLifecycle | undefined | false {
  if (record.status === "RETIRED") {
    return "RETIRED";
  }
  if (record.lifecycle === undefined) {
    return undefined;
  }
  if (typeof record.lifecycle !== "string") {
    return false;
  }
  if (!(PROVIDER_LIFECYCLES as readonly string[]).includes(record.lifecycle)) {
    return false;
  }
  return record.lifecycle as ProviderLifecycle;
}

function readCapabilityIds(value: unknown): string[] | undefined | false {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return false;
  }
  return value as string[];
}

function providerHttpStatus(error: ProviderMutationError): 400 | 404 | 409 {
  switch (error) {
    case "invalid_label":
    case "invalid_description":
    case "invalid_capability":
    case "invalid_lifecycle":
    case "invalid_workcenter":
      return 400;
    case "not_found":
    case "already_retired":
      return 404;
    case "provider_referenced":
    case "has_open_assignment":
    case "has_active_machines":
      return 409;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
