/** Registered /api routes, read from Hono itself (V1 Organization Access · S0). */
export function registeredApiRoutes(app: { routes: ReadonlyArray<{ method: string; path: string }> }): string[] {
  const seen = new Set<string>();
  for (const route of app.routes) {
    if (!route.path.startsWith("/api/") || route.method === "ALL") continue;
    seen.add(`${route.method} ${route.path}`);
  }
  return [...seen].sort();
}
