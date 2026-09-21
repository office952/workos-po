export type AppRoute =
  | { name: "clients" }
  | { name: "client"; customerId: string }
  | { name: "requests" }
  | { name: "request"; requestId: string }
  | { name: "catalog" }
  | { name: "configurator" }
  | { name: "quotes" }
  | { name: "quote"; productCode: string; quoteSnapshotId: string }
  | { name: "jobs" }
  | { name: "job"; jobId: string }
  | { name: "planning" }
  | { name: "atelier" }
  | { name: "execution"; planId: string }
  | { name: "admin-resources" }
  | { name: "admin-commercial" }
  | { name: "admin-technical" }
  | { name: "admin-formulas" }
  | { name: "admin-products" }
  | { name: "admin-people" }
  | { name: "admin-person"; personId: string }
  | { name: "admin-workcenters" }
  | { name: "admin-workcenter"; workcenterId: string }
  | { name: "admin-machine"; workcenterId: string; machineId: string }
  | { name: "foundation" }
  | { name: "unknown"; path: string };

export type SpineContext = {
  customerId: string | null;
  requestId: string | null;
  productCode: string | null;
};

export function parseAppRoute(pathname: string): AppRoute {
  if (pathname === "/" || pathname === "/clienti") {
    return { name: "clients" };
  }
  if (pathname === "/configurator") {
    return { name: "configurator" };
  }
  const client = pathname.match(/^\/clienti\/([^/]+)$/);
  if (client) {
    return { name: "client", customerId: decodeURIComponent(client[1]) };
  }
  if (pathname === "/cereri") {
    return { name: "requests" };
  }
  const request = pathname.match(/^\/cereri\/([^/]+)$/);
  if (request) {
    return { name: "request", requestId: decodeURIComponent(request[1]) };
  }
  if (pathname === "/catalog") {
    return { name: "catalog" };
  }
  if (pathname === "/oferte") {
    return { name: "quotes" };
  }
  if (pathname === "/lucrari") {
    return { name: "jobs" };
  }
  if (pathname === "/planificare") {
    return { name: "planning" };
  }
  const job = pathname.match(/^\/lucrari\/([^/]+)$/);
  if (job) {
    return { name: "job", jobId: decodeURIComponent(job[1]) };
  }
  if (pathname === "/atelier") {
    return { name: "atelier" };
  }
  const execution = pathname.match(/^\/executie\/([^/]+)$/);
  if (execution) {
    return { name: "execution", planId: decodeURIComponent(execution[1]) };
  }
  if (pathname === "/admin/resources") {
    return { name: "admin-resources" };
  }
  if (pathname === "/admin/commercial") {
    return { name: "admin-commercial" };
  }
  if (pathname === "/admin/technical") {
    return { name: "admin-technical" };
  }
  if (pathname === "/admin/formulas") {
    return { name: "admin-formulas" };
  }
  if (pathname === "/admin/products") {
    return { name: "admin-products" };
  }
  if (pathname === "/admin/people") {
    return { name: "admin-people" };
  }
  const adminPerson = pathname.match(/^\/admin\/people\/([^/]+)$/);
  if (adminPerson) {
    return { name: "admin-person", personId: decodeURIComponent(adminPerson[1]) };
  }
  if (pathname === "/admin/workcenters") {
    return { name: "admin-workcenters" };
  }
  const adminMachine = pathname.match(
    /^\/admin\/workcenters\/([^/]+)\/machines\/([^/]+)$/,
  );
  if (adminMachine) {
    return {
      name: "admin-machine",
      workcenterId: decodeURIComponent(adminMachine[1]),
      machineId: decodeURIComponent(adminMachine[2]),
    };
  }
  const adminWorkcenter = pathname.match(/^\/admin\/workcenters\/([^/]+)$/);
  if (adminWorkcenter) {
    return {
      name: "admin-workcenter",
      workcenterId: decodeURIComponent(adminWorkcenter[1]),
    };
  }
  if (pathname === "/foundation") {
    return { name: "foundation" };
  }
  const quote = pathname.match(/^\/quotes\/([^/]+)\/([^/]+)$/);
  if (quote) {
    return {
      name: "quote",
      productCode: decodeURIComponent(quote[1]),
      quoteSnapshotId: decodeURIComponent(quote[2]),
    };
  }
  return { name: "unknown", path: pathname };
}

export function quoteHref(productCode: string, quoteSnapshotId: string): string {
  return `/quotes/${encodeURIComponent(productCode)}/${encodeURIComponent(quoteSnapshotId)}`;
}

export function clientHref(customerId: string): string {
  return `/clienti/${encodeURIComponent(customerId)}`;
}

export function requestHref(requestId: string): string {
  return `/cereri/${encodeURIComponent(requestId)}`;
}

export function jobHref(jobId: string): string {
  return `/lucrari/${encodeURIComponent(jobId)}`;
}

export function executionHref(
  planId: string,
  context: { taskId?: string | null; jobId?: string | null } = {},
): string {
  const params = new URLSearchParams();
  if (context.taskId) {
    params.set("task", context.taskId);
  }
  if (context.jobId) {
    params.set("job", context.jobId);
  }
  const query = params.toString();
  return query
    ? `/executie/${encodeURIComponent(planId)}?${query}`
    : `/executie/${encodeURIComponent(planId)}`;
}

export function adminPeopleHref(): string {
  return "/admin/people";
}

export function adminPersonHref(personId: string): string {
  return `/admin/people/${encodeURIComponent(personId)}`;
}

export function adminWorkcentersHref(): string {
  return "/admin/workcenters";
}

export function adminWorkcenterHref(workcenterId: string): string {
  return `/admin/workcenters/${encodeURIComponent(workcenterId)}`;
}

export function adminMachineHref(workcenterId: string, machineId: string): string {
  return `${adminWorkcenterHref(workcenterId)}/machines/${encodeURIComponent(machineId)}`;
}

export function planningHref(): string {
  return "/planificare";
}

export function atelierHref(context: { jobId?: string | null } = {}): string {
  return context.jobId
    ? `/atelier?job=${encodeURIComponent(context.jobId)}`
    : "/atelier";
}

export function withSpineContext(pathname: string, context: SpineContext): string {
  const params = new URLSearchParams();
  if (context.customerId) {
    params.set("customer", context.customerId);
  }
  if (context.requestId) {
    params.set("request", context.requestId);
  }
  if (context.productCode) {
    params.set("product", context.productCode);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function catalogHref(context: SpineContext): string {
  return withSpineContext("/catalog", context);
}

export function configuratorHref(context: SpineContext): string {
  return withSpineContext("/configurator", context);
}

export function canonicalLocation(pathname: string, search: string): string | null {
  if (pathname !== "/") {
    return null;
  }
  const context = parseSpineContext(search);
  if (context.customerId || context.requestId || context.productCode) {
    return `/configurator${search}`;
  }
  return `/clienti${search}`;
}

export function parseCustomerContext(search: string): string | null {
  return readSearchParam(search, "customer");
}

export function parseJobContext(search: string): string | null {
  return readSearchParam(search, "job");
}

export function parseTaskContext(search: string): string | null {
  return readSearchParam(search, "task");
}

export function parseSpineContext(search: string): SpineContext {
  return {
    customerId: readSearchParam(search, "customer"),
    requestId: readSearchParam(search, "request"),
    productCode: readSearchParam(search, "product"),
  };
}

export const ADMINISTRATION_HREF = "/admin/resources";

export function isAdministrationPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return path === "/admin" || path.startsWith("/admin/");
}

export function navItemCurrent(currentHref: string, href: string): boolean {
  const path = currentHref.split("?")[0] ?? currentHref;
  if (href === path) {
    return true;
  }
  if (href === "/clienti" && path === "/") {
    return true;
  }
  if (href === "/oferte" && path.startsWith("/quotes/")) {
    return true;
  }
  if (href === "/atelier" && path.startsWith("/executie/")) {
    return true;
  }
  if (href === ADMINISTRATION_HREF && isAdministrationPath(path)) {
    return true;
  }
  return href !== "/" && path.startsWith(`${href}/`);
}

function readSearchParam(search: string | undefined, key: string): string | null {
  const raw = search ?? "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const value = params.get(key);
  if (!value || value.trim() === "") {
    return null;
  }
  return value;
}
