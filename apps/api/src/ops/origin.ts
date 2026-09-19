const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function resolvePublicOrigin(env: NodeJS.ProcessEnv): string | null {
  const origin = env.WORKOS_PUBLIC_ORIGIN?.trim();
  return origin && origin.length > 0 ? origin.replace(/\/$/, "") : null;
}

export function resolveTrustedOrigins(env: NodeJS.ProcessEnv): string[] {
  const extras = (env.WORKOS_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim().replace(/\/$/, ""))
    .filter((item) => item.length > 0);
  const publicOrigin = resolvePublicOrigin(env);
  return publicOrigin ? [publicOrigin, ...extras] : extras;
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
): boolean {
  if (env.NODE_ENV !== "production") {
    return true;
  }
  if (!MUTATING.has(method.toUpperCase())) {
    return true;
  }
  const trusted = resolveTrustedOrigins(env);
  if (trusted.length === 0) {
    return true;
  }
  const origin = originHeader?.trim().replace(/\/$/, "") ?? "";
  if (!origin) {
    return false;
  }
  return trusted.includes(origin);
}
