export type AppRoute =
  | { name: "home" }
  | { name: "clients" }
  | { name: "client"; customerId: string }
  | { name: "requests" }
  | { name: "new-request" }
  | { name: "request"; requestId: string }
  | { name: "catalog" }
  | { name: "assembly" }
  | { name: "configurator" }
  | { name: "quotes" }
  | { name: "quote"; productCode: string; quoteSnapshotId: string }
  | { name: "assembly-quote"; quoteSnapshotId: string }
  | { name: "jobs" }
  | { name: "job"; jobId: string }
  | { name: "planning" }
  | { name: "atelier" }
  | { name: "execution"; planId: string }
  | { name: "admin" }
  | { name: "admin-resources" }
  | { name: "admin-services" }
  | { name: "admin-material-readiness" }
  | { name: "admin-external-production" }
  | { name: "admin-commercial" }
  | { name: "admin-technical" }
  | { name: "admin-formulas" }
  | { name: "admin-products" }
  | { name: "admin-access" }
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
  if (pathname === "/") {
    return { name: "home" };
  }
  if (pathname === "/clienti") {
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
  if (pathname === "/cereri/noua") return { name: "new-request" };
  const request = pathname.match(/^\/cereri\/([^/]+)$/);
  if (request) {
    return { name: "request", requestId: decodeURIComponent(request[1]) };
  }
  if (pathname === "/catalog") {
    return { name: "catalog" };
  }
  if (pathname === "/ansamblu") {
    return { name: "assembly" };
  }
  if (pathname === "/oferte") {
    return { name: "quotes" };
  }
  const assemblyQuote = pathname.match(/^\/oferte\/ansamblu\/([^/]+)$/);
  if (assemblyQuote) {
    return { name: "assembly-quote", quoteSnapshotId: decodeURIComponent(assemblyQuote[1]) };
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
  const execution = pathname.match(/^\/(?:executie|execution)\/([^/]+)$/);
  if (execution) {
    return { name: "execution", planId: decodeURIComponent(execution[1]) };
  }
  if (pathname === "/admin") {
    return { name: "admin" };
  }
  if (pathname === "/admin/resources") {
    return { name: "admin-resources" };
  }
  if (pathname === "/admin/services") {
    return { name: "admin-services" };
  }
  if (pathname === "/admin/material-readiness") {
    return { name: "admin-material-readiness" };
  }
  if (pathname === "/admin/external-production") {
    return { name: "admin-external-production" };
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
  if (pathname === "/admin/access") {
    return { name: "admin-access" };
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

export function assemblyQuoteHref(quoteSnapshotId: string): string {
  return `/oferte/ansamblu/${encodeURIComponent(quoteSnapshotId)}`;
}

export function registryQuoteHref(item: {
  kind: "PRODUCT" | "ASSEMBLY";
  productCode: string;
  quoteSnapshotId: string;
}): string {
  switch (item.kind) {
    case "PRODUCT":
      return quoteHref(item.productCode, item.quoteSnapshotId);
    case "ASSEMBLY":
      return assemblyQuoteHref(item.quoteSnapshotId);
    default: {
      const _exhaustive: never = item.kind;
      return _exhaustive;
    }
  }
}

export const CLIENT_HUB_SECTIONS = [
  "prezentare",
  "lucrari",
  "cereri",
  "documente",
  "fotografii",
  "portofoliu",
  "fisiere",
] as const;

export type ClientHubSection = (typeof CLIENT_HUB_SECTIONS)[number];

export function parseClientHubSection(search: string): ClientHubSection {
  const value = readSearchParam(search, "sectiune");
  if (value && (CLIENT_HUB_SECTIONS as readonly string[]).includes(value)) {
    return value as ClientHubSection;
  }
  return "prezentare";
}

export function clientHref(customerId: string, section?: ClientHubSection): string {
  const path = `/clienti/${encodeURIComponent(customerId)}`;
  if (!section || section === "prezentare") {
    return path;
  }
  return `${path}?sectiune=${encodeURIComponent(section)}`;
}

export function readClientRequestPreview(search: string): string | null {
  return readSearchParam(search, "cerere");
}

/** N-018 · a request previewed over the client page (?cerere=…); the section stays in the URL. */
export function clientRequestPreviewHref(customerId: string, section: ClientHubSection, requestId: string | null): string {
  const base = clientHref(customerId, section);
  if (!requestId) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams({ cerere: requestId }).toString()}`;
}

export function requestHref(requestId: string): string {
  return `/cereri/${encodeURIComponent(requestId)}`;
}

export function newRequestHref(customerId?: string | null): string {
  return customerId ? `/cereri/noua?customer=${encodeURIComponent(customerId)}` : "/cereri/noua";
}

/**
 * Registry selections: the row shown in the dossier lives in the URL, so direct links,
 * refresh and Back/Forward restore it. The detail pages keep their own paths.
 */
export function parseClientsSelection(search: string): string | null {
  return readSearchParam(search, "client");
}

export function clientsHref(customerId?: string | null): string {
  return customerId ? `/clienti?${new URLSearchParams({ client: customerId }).toString()}` : "/clienti";
}

export function parseRequestsSelection(search: string): string | null {
  return readSearchParam(search, "cerere");
}

export function requestsHref(requestId?: string | null): string {
  return requestId ? `/cereri?${new URLSearchParams({ cerere: requestId }).toString()}` : "/cereri";
}

export function parseJobsSelection(search: string): string | null {
  return readSearchParam(search, "lucrare");
}

export function jobsHref(jobId?: string | null): string {
  return jobId ? `/lucrari?${new URLSearchParams({ lucrare: jobId }).toString()}` : "/lucrari";
}

export const JOB_SHEET_SECTIONS = ["situatie", "operatii", "fisiere", "oameni", "istoric", "date"] as const;
const LEGACY_JOB_SECTIONS = ["documente", "rezultate", "materiale", "sursa", "plan", "operatie"] as const;
export type JobSheetSection = (typeof JOB_SHEET_SECTIONS)[number];
export type JobSheetSectionInput = JobSheetSection | (typeof LEGACY_JOB_SECTIONS)[number];

export function parseJobSheetSection(search: string): JobSheetSection {
  const value = readSearchParam(search, "sectiune");
  if (value && [...JOB_SHEET_SECTIONS, ...LEGACY_JOB_SECTIONS].includes(value as JobSheetSectionInput)) {
    return canonicalJobSection(value as JobSheetSectionInput);
  }
  // Existing task links continue to open that operation's dossier.
  return readSearchParam(search, "task") ? "operatii" : "situatie";
}

export function canonicalJobSection(section: JobSheetSectionInput): JobSheetSection {
  if (section === "plan" || section === "operatie" || section === "rezultate") return "operatii";
  if (section === "documente") return "fisiere";
  if (section === "materiale" || section === "sursa") return "date";
  return section;
}

export function jobHref(
  jobId: string,
  context: { taskId?: string | null; section?: JobSheetSectionInput; fileId?: string | null } = {},
): string {
  const path = `/lucrari/${encodeURIComponent(jobId)}`;
  const params = new URLSearchParams();
  if (context.taskId) params.set("task", context.taskId);
  if (context.section) params.set("sectiune", canonicalJobSection(context.section));
  // N-018 · the file open in the viewer, so Back, refresh and a direct link keep it.
  if (context.fileId) params.set("fisier", context.fileId);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function executionHref(
  planId: string,
  context: { taskId?: string | null; jobId?: string | null } = {},
): string {
  return atelierHref({ planId, ...context });
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
  return jobsViewHref("resources");
}

export type JobsView = "jobs" | "resources";

export function parseJobsView(search: string): JobsView {
  return readSearchParam(search, "vedere") === "utilaje" ? "resources" : "jobs";
}

export function jobsViewHref(view: JobsView): string {
  return view === "resources" ? "/lucrari?vedere=utilaje" : "/lucrari";
}

/** The Oferte dossier: which offer is open and which sheet is in front. */
export type QuotesSheet = "oferta" | "comanda";

export type QuotesSelection = { quoteId: string | null; sheet: QuotesSheet };

export function parseQuotesSelection(search: string): QuotesSelection {
  const quoteId = readSearchParam(search, "oferta");
  return {
    quoteId,
    sheet: quoteId && readSearchParam(search, "foaie") === "comanda" ? "comanda" : "oferta",
  };
}

export function quotesHref(selection: { quoteId?: string | null; sheet?: QuotesSheet } = {}): string {
  if (!selection.quoteId) {
    return "/oferte";
  }
  const params = new URLSearchParams({ oferta: selection.quoteId });
  if (selection.sheet === "comanda") params.set("foaie", "comanda");
  return `/oferte?${params.toString()}`;
}

export function atelierHref(
  context: { jobId?: string | null; planId?: string | null; taskId?: string | null; returnTo?: string | null } = {},
): string {
  const params = new URLSearchParams();
  if (context.jobId) {
    params.set("job", context.jobId);
  }
  if (context.planId) params.set("plan", context.planId);
  if (context.taskId) params.set("task", context.taskId);
  const returnTo = sanitizeOperationalReturn(context.returnTo);
  if (returnTo) {
    params.set("return", returnTo);
  }
  const query = params.toString();
  return query ? `/atelier?${query}` : "/atelier";
}

const OPERATIONAL_RETURN_PATH = /^\/(?:lucrari\/[^/]+|(?:executie|execution)\/[^/]+|atelier)$/;

export function sanitizeOperationalReturn(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("://")
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed, "https://workos.local");
  } catch {
    return null;
  }
  if (url.origin !== "https://workos.local" || !OPERATIONAL_RETURN_PATH.test(url.pathname)) {
    return null;
  }
  const params = new URLSearchParams();
  const task = url.searchParams.get("task");
  const job = url.searchParams.get("job");
  if (task && /^[\w:.-]+$/.test(task)) {
    params.set("task", task);
  }
  const section = url.searchParams.get("sectiune");
  if (url.pathname.startsWith("/lucrari/") && section && [...JOB_SHEET_SECTIONS, ...LEGACY_JOB_SECTIONS].includes(section as JobSheetSectionInput)) {
    params.set("sectiune", canonicalJobSection(section as JobSheetSectionInput));
  }
  if (
    (url.pathname === "/atelier" || /^\/(?:executie|execution)\//.test(url.pathname)) &&
    job &&
    /^[\w:.-]+$/.test(job)
  ) {
    params.set("job", job);
  }
  const legacy = url.pathname.match(/^\/(?:executie|execution)\/([^/]+)$/);
  let plan = url.searchParams.get("plan");
  if (legacy) {
    try { plan = decodeURIComponent(legacy[1]); } catch { return null; }
  }
  if ((legacy || url.pathname === "/atelier") && plan && /^[\w:.-]+$/.test(plan)) params.set("plan", plan);
  const path = legacy ? "/atelier" : url.pathname;
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function parseOperationalReturn(search: string): string | null {
  return sanitizeOperationalReturn(readSearchParam(search, "return"));
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

export function requestProductHref(requestId: string): string {
  return `${requestHref(requestId)}?alege-produs=1#alege-produs`;
}

export function assemblyHref(assemblyId: string): string {
  return `/ansamblu?assembly=${encodeURIComponent(assemblyId)}`;
}

export function configuratorHref(context: SpineContext): string {
  return withSpineContext("/configurator", context);
}

export function canonicalLocation(pathname: string, search: string): string | null {
  if (pathname === "/planificare") {
    const params = new URLSearchParams(search);
    params.set("vedere", "utilaje");
    return `/lucrari?${params.toString()}`;
  }
  const legacyExecution = pathname.match(/^\/(?:executie|execution)\/([^/]+)$/);
  if (legacyExecution) return executionHref(decodeURIComponent(legacyExecution[1]), {
    taskId: readSearchParam(search, "task"), jobId: readSearchParam(search, "job"),
  });
  const job = pathname.match(/^\/lucrari\/([^/]+)$/);
  const section = readSearchParam(search, "sectiune");
  if (job && section && (LEGACY_JOB_SECTIONS as readonly string[]).includes(section)) {
    return jobHref(decodeURIComponent(job[1]), {
      taskId: readSearchParam(search, "task"), section: section as JobSheetSectionInput,
    });
  }
  if (pathname === "/catalog") {
    const previous = parseSpineContext(search);
    if (previous.requestId) return requestProductHref(previous.requestId);
    if (previous.customerId) return `/cereri/noua?customer=${encodeURIComponent(previous.customerId)}`;
  }
  if (pathname !== "/") {
    return null;
  }
  const context = parseSpineContext(search);
  if (context.customerId || context.requestId || context.productCode) {
    return `/configurator${search}`;
  }
  return null;
}

export function parseCustomerContext(search: string): string | null {
  return readSearchParam(search, "customer");
}

export function parseJobContext(search: string): string | null {
  return readSearchParam(search, "job");
}

export function parsePlanContext(search: string): string | null {
  return readSearchParam(search, "plan");
}

export function parseFileContext(search: string): string | null {
  return readSearchParam(search, "fisier");
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

export const ADMINISTRATION_HREF = "/admin";

export function isAdministrationPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  return path === "/admin" || path.startsWith("/admin/");
}

export function navItemCurrent(currentHref: string, href: string): boolean {
  const path = currentHref.split("?")[0] ?? currentHref;
  if (href === path) {
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
