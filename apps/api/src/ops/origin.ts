export const PRODUCTION_HSTS_VALUE = "max-age=31536000; includeSubDomains" as const;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type ProductionOriginFaultCode =
  | "production_origin_missing"
  | "production_origin_invalid"
  | "production_origin_not_https";

export class ProductionOriginConfigError extends Error {
  readonly code: ProductionOriginFaultCode;

  constructor(code: ProductionOriginFaultCode) {
    super(code);
    this.name = "ProductionOriginConfigError";
    this.code = code;
  }
}

export type OriginAccess = {
  cloud?: boolean;
};

export function parseNormalizedOrigin(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProductionOriginConfigError("production_origin_invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProductionOriginConfigError("production_origin_invalid");
  }
  if (url.username || url.password) {
    throw new ProductionOriginConfigError("production_origin_invalid");
  }
  if (url.search || url.hash) {
    throw new ProductionOriginConfigError("production_origin_invalid");
  }
  if (url.pathname && url.pathname !== "/") {
    throw new ProductionOriginConfigError("production_origin_invalid");
  }
  if (!url.hostname) {
    throw new ProductionOriginConfigError("production_origin_invalid");
  }
  return url.origin;
}

export function resolvePublicOrigin(env: NodeJS.ProcessEnv): string | null {
  const origin = env.WORKOS_PUBLIC_ORIGIN?.trim();
  if (!origin) {
    return null;
  }
  try {
    return parseNormalizedOrigin(origin);
  } catch {
    return origin.replace(/\/$/, "");
  }
}

export function resolveTrustedOrigins(env: NodeJS.ProcessEnv): string[] {
  const extras = (env.WORKOS_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      try {
        return parseNormalizedOrigin(item);
      } catch {
        return item.replace(/\/$/, "");
      }
    });
  const publicOrigin = resolvePublicOrigin(env);
  return publicOrigin ? [publicOrigin, ...extras] : extras;
}

function assertProductionHttpsOrigin(raw: string): string {
  let origin: string;
  try {
    origin = parseNormalizedOrigin(raw);
  } catch (error) {
    if (error instanceof ProductionOriginConfigError) {
      throw error;
    }
    throw new ProductionOriginConfigError("production_origin_invalid");
  }
  if (new URL(origin).protocol !== "https:") {
    throw new ProductionOriginConfigError("production_origin_not_https");
  }
  return origin;
}

export function assertProductionCloudPublicOrigin(env: NodeJS.ProcessEnv): string {
  const raw = env.WORKOS_PUBLIC_ORIGIN?.trim();
  if (!raw) {
    throw new ProductionOriginConfigError("production_origin_missing");
  }
  const origin = assertProductionHttpsOrigin(raw);
  for (const extra of (env.WORKOS_TRUSTED_ORIGINS ?? "").split(",")) {
    const trimmed = extra.trim();
    if (!trimmed) {
      continue;
    }
    assertProductionHttpsOrigin(trimmed);
  }
  return origin;
}

export function cookieSecure(env: NodeJS.ProcessEnv): boolean {
  const publicOrigin = resolvePublicOrigin(env);
  if (publicOrigin?.startsWith("https://")) {
    return true;
  }
  if (publicOrigin?.startsWith("http://127.0.0.1") || publicOrigin?.startsWith("http://localhost")) {
    return false;
  }
  return env.NODE_ENV === "production";
}

export function shouldSendHsts(env: NodeJS.ProcessEnv, proto: string | undefined): boolean {
  if (env.NODE_ENV !== "production") {
    return false;
  }
  const publicOrigin = resolvePublicOrigin(env);
  if (publicOrigin?.startsWith("https://")) {
    return true;
  }
  return proto === "https";
}

export function mutatingOriginAllowed(
  env: NodeJS.ProcessEnv,
  method: string,
  originHeader: string | undefined,
  access: OriginAccess = {},
): boolean {
  if (env.NODE_ENV !== "production") {
    return true;
  }
  if (!MUTATING.has(method.toUpperCase())) {
    return true;
  }
  const trusted = resolveTrustedOrigins(env);
  if (trusted.length === 0) {
    return access.cloud !== true;
  }
  const origin = originHeader?.trim() ? tryNormalizeOriginHeader(originHeader) : "";
  if (!origin) {
    return false;
  }
  return trusted.includes(origin);
}

function tryNormalizeOriginHeader(originHeader: string): string {
  const trimmed = originHeader.trim();
  try {
    return parseNormalizedOrigin(trimmed);
  } catch {
    return trimmed.replace(/\/$/, "");
  }
}
