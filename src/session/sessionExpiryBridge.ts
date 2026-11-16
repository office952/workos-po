type UnauthorizedHandler = () => void;

let cloudUnauthorizedHandler: UnauthorizedHandler | null = null;
let suppressUnauthorizedExpiry = false;
let cloudBoundaryVersion = 0;

export function readCloudBoundaryVersion(): number {
  return cloudBoundaryVersion;
}

export function advanceCloudBoundaryVersion(): void {
  cloudBoundaryVersion += 1;
}

export function setCloudUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  cloudUnauthorizedHandler = handler;
}

export function suppressCloudUnauthorizedExpiry(): void {
  suppressUnauthorizedExpiry = true;
}

export function restoreCloudUnauthorizedExpiry(): void {
  suppressUnauthorizedExpiry = false;
}

export function notifyCloudUnauthorized(): void {
  if (suppressUnauthorizedExpiry) {
    return;
  }
  cloudUnauthorizedHandler?.();
}

const PUBLIC_SESSION_PATHS = new Set([
  "/api/health",
  "/api/cloud/login",
  "/api/cloud/session",
  "/api/cloud/logout",
]);

export function isPublicCloudSessionPath(path: string): boolean {
  const pathname = path.split("?")[0] ?? path;
  return PUBLIC_SESSION_PATHS.has(pathname);
}

/**
 * V1 Organization Access: a 403 may mean the role changed or access was withdrawn while the user
 * was working. The session is re-read (throttled); the server stays the authority.
 */
let cloudForbiddenHandler: UnauthorizedHandler | null = null;
let lastForbiddenRefresh = 0;
const FORBIDDEN_REFRESH_MS = 5_000;

export function setCloudForbiddenHandler(handler: UnauthorizedHandler | null): void {
  cloudForbiddenHandler = handler;
}

export function notifyCloudForbidden(path: string, status: number): void {
  if (status !== 403 || isPublicCloudSessionPath(path)) {
    return;
  }
  const now = Date.now();
  if (now - lastForbiddenRefresh < FORBIDDEN_REFRESH_MS) {
    return;
  }
  lastForbiddenRefresh = now;
  cloudForbiddenHandler?.();
}

export function notifyCloudUnauthorizedUnlessPublic(path: string, status: number): void {
  notifyCloudForbidden(path, status);
  if (status !== 401) {
    return;
  }
  if (isPublicCloudSessionPath(path)) {
    return;
  }
  notifyCloudUnauthorized();
}
