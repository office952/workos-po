import type { Context } from "hono";
import { roleCan, type OrganizationCapability } from "@workos-final/domain";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";
import type {
  CloudMembership,
  CloudOrganization,
  CloudUser,
  ControlPlane,
  MembershipRole,
  OperationalPlaneDescriptor,
} from "./controlPlane.js";
import type { RuntimeRegistry } from "./runtimeRegistry.js";

export type AccessMode = "cloud" | "single_plane";

export type ApiEnv = {
  Variables: {
    accessMode: AccessMode;
    env: NodeJS.ProcessEnv;
    productSystem?: ProductSystemRuntime;
    controlPlane?: ControlPlane;
    runtimeRegistry?: RuntimeRegistry;
    cloudUser?: CloudUser;
    membership?: CloudMembership;
    organization?: CloudOrganization;
    planeDescriptor?: OperationalPlaneDescriptor;
  };
};

export type ApiContext = Context<ApiEnv>;

export function getProductSystem(c: ApiContext): ProductSystemRuntime {
  const runtime = c.get("productSystem");
  if (!runtime) {
    throw new Error("product_system_missing");
  }
  return runtime;
}

export function getControlPlane(c: ApiContext): ControlPlane | null {
  return c.get("controlPlane") ?? null;
}

export function getAccessMode(c: ApiContext): AccessMode {
  return c.get("accessMode") ?? "single_plane";
}

export function getCloudRole(c: ApiContext): MembershipRole | null {
  return c.get("membership")?.role ?? null;
}

export function isCloudMode(c: ApiContext): boolean {
  return getAccessMode(c) === "cloud";
}

export function isOwner(c: ApiContext): boolean {
  if (!isCloudMode(c)) {
    return true;
  }
  return getCloudRole(c) === "owner";
}

/**
 * V1 Organization Access: the single server-side authorization question. Single-plane (local,
 * non-Cloud) runtime keeps its historical owner semantics. In Cloud, an unknown role has no
 * capability (fail-closed; never treated as member).
 */
export function can(c: ApiContext, capability: OrganizationCapability): boolean {
  if (!isCloudMode(c)) {
    return true;
  }
  return roleCan(getCloudRole(c), capability);
}

/** The organization role of the request, or null outside Cloud (single-plane = owner). */
export function organizationRole(c: ApiContext): string | null {
  return isCloudMode(c) ? getCloudRole(c) : "owner";
}
