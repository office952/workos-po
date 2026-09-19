type UnauthorizedHandler = () => void;

let cloudUnauthorizedHandler: UnauthorizedHandler | null = null;
let suppressUnauthorizedExpiry = false;

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

export function notifyCloudUnauthorizedUnlessPublic(path: string, status: number): void {
  if (status !== 401) {
    return;
  }
  if (isPublicCloudSessionPath(path)) {
    return;
  }
  notifyCloudUnauthorized();
}
