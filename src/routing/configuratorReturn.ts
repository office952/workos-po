const IDENTIFIER = /^[\w:.-]+$/;
const ALLOWED_KEYS = new Set(["customer", "request", "product", "assembly", "role"]);
const ASSEMBLY_MEMBER_ROLES = ["SUPPORT_PANEL", "SIGNAGE_LETTERS", "SIGNAGE_LOGO"] as const;

export type ConfiguratorReturnRole = (typeof ASSEMBLY_MEMBER_ROLES)[number];

export type ConfiguratorReturnContext = {
  customerId?: string | null;
  requestId?: string | null;
  productCode?: string | null;
  assemblyId?: string | null;
  memberRole?: string | null;
};

function presentToken(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function safeIdentifier(value: string | null | undefined): string | null {
  const token = presentToken(value);
  if (!token || token.includes("..") || !IDENTIFIER.test(token)) {
    return null;
  }
  return token;
}

function readRole(value: string | null | undefined): ConfiguratorReturnRole | null {
  const token = presentToken(value);
  return token && (ASSEMBLY_MEMBER_ROLES as readonly string[]).includes(token)
    ? (token as ConfiguratorReturnRole)
    : null;
}

/** Builds an in-app Configurator return path, including assembly member context when both facts exist. */
export function configuratorReturnHref(context: ConfiguratorReturnContext): string {
  const params = new URLSearchParams();
  const customerId = safeIdentifier(context.customerId);
  const requestId = safeIdentifier(context.requestId);
  const productCode = safeIdentifier(context.productCode);
  const assemblyId = safeIdentifier(context.assemblyId);
  const memberRole = readRole(context.memberRole);
  if (customerId) {
    params.set("customer", customerId);
  }
  if (requestId) {
    params.set("request", requestId);
  }
  if (productCode) {
    params.set("product", productCode);
  }
  if (assemblyId && memberRole) {
    params.set("assembly", assemblyId);
    params.set("role", memberRole);
  }
  const query = params.toString();
  return query ? `/configurator?${query}` : "/configurator";
}

export function configuratorAdminHref(
  path: "/admin/technical" | "/admin/formulas",
  typeId: string,
  context: ConfiguratorReturnContext,
): string {
  const params = new URLSearchParams();
  params.set("component", typeId);
  params.set("return", configuratorReturnHref(context));
  return `${path}?${params.toString()}`;
}

function readPresentIdentifier(params: URLSearchParams, key: string): string | null | undefined {
  if (!params.has(key)) {
    return undefined;
  }
  return safeIdentifier(params.get(key));
}

/** Accepts only `/configurator` with already-supported spine and assembly member params. */
export function sanitizeConfiguratorReturn(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    !trimmed.startsWith("/configurator") ||
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
  if (
    url.origin !== "https://workos.local" ||
    url.pathname !== "/configurator" ||
    url.username ||
    url.password ||
    url.hash !== ""
  ) {
    return null;
  }
  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_KEYS.has(key) || seen.has(key)) {
      return null;
    }
    seen.add(key);
  }
  const customerId = readPresentIdentifier(url.searchParams, "customer");
  const requestId = readPresentIdentifier(url.searchParams, "request");
  const productCode = readPresentIdentifier(url.searchParams, "product");
  const assemblyId = readPresentIdentifier(url.searchParams, "assembly");
  if (customerId === null || requestId === null || productCode === null || assemblyId === null) {
    return null;
  }
  let memberRole: ConfiguratorReturnRole | null = null;
  if (url.searchParams.has("role")) {
    memberRole = readRole(url.searchParams.get("role"));
    if (!memberRole) {
      return null;
    }
  }
  const hasAssembly = assemblyId !== undefined;
  const hasRole = memberRole !== null;
  if (hasAssembly !== hasRole) {
    return null;
  }
  return configuratorReturnHref({
    customerId: customerId ?? null,
    requestId: requestId ?? null,
    productCode: productCode ?? null,
    assemblyId: assemblyId ?? null,
    memberRole,
  });
}
