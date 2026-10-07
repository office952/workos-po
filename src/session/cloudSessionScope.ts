import type { CloudSessionPresentation } from "../adapters/cloudSessionAdapter";

const STORAGE_KEY = "workos-po.cloud-scope.v1";

export function readRememberedCloudScope(): string | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberCloudScope(scope: string | null): void {
  try {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    if (scope === null) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, scope);
    }
  } catch {
    // Unverifiable preferences will be discarded on the next boot.
  }
}

export function cloudSessionScope(session: CloudSessionPresentation): string | null {
  if (!session.user || !session.organization) {
    return null;
  }
  return JSON.stringify([
    session.user.email,
    session.organization.organizationId,
    session.organization.membershipRole,
  ]);
}
