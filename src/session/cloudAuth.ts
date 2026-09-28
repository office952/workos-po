import type {
  CloudOrganizationPresentation,
  CloudSessionPresentation,
  CloudUserPresentation,
} from "../adapters/cloudSessionAdapter";

export type CloudAuthGateKind =
  | "boot"
  | "auth_config_missing"
  | "network"
  | "unauthenticated"
  | "session_expired";

export type CloudBootDecision = CloudAuthGateKind | "authenticated";

const WAS_AUTHENTICATED_KEY = "workos-ui20.cloud.wasAuthenticated";

export function safeAppPath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  if (trimmed.startsWith("//")) {
    return null;
  }
  if (trimmed.includes("\\")) {
    return null;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function intendedReturnPath(pathname: string, search = ""): string {
  const combined = `${pathname}${search}`;
  return safeAppPath(combined) ?? "/";
}

/** Auth entry URLs that are not product routes after a successful session. */
const AUTH_ENTRY_PATHS = new Set(["/login"]);

export function isAuthEntryPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  const normalized = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  return AUTH_ENTRY_PATHS.has(normalized);
}

/**
 * Where to land after authentication succeeds.
 * Auth-entry paths such as `/login` go to Launchpad `/`.
 * Valid product deep links are preserved. Arbitrary unknown paths stay unknown.
 */
export function resolvePostAuthenticationPath(pathname: string, search = ""): string {
  if (isAuthEntryPath(pathname)) {
    return "/";
  }
  return intendedReturnPath(pathname, search);
}

export function rememberCloudAuthenticated(): void {
  try {
    sessionStorage.setItem(WAS_AUTHENTICATED_KEY, "1");
  } catch {
    // Private mode must not block login.
  }
}

export function clearCloudAuthenticatedMark(): void {
  try {
    sessionStorage.removeItem(WAS_AUTHENTICATED_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function consumeCloudSessionExpiredMark(): boolean {
  try {
    const marked = sessionStorage.getItem(WAS_AUTHENTICATED_KEY) === "1";
    if (marked) {
      sessionStorage.removeItem(WAS_AUTHENTICATED_KEY);
    }
    return marked;
  } catch {
    return false;
  }
}

export function resolveCloudAuthGate(input: {
  ready: boolean;
  unavailable: boolean;
  mode: CloudSessionPresentation["mode"];
  authConfigured: boolean;
  user: CloudUserPresentation | null;
  organization: CloudOrganizationPresentation | null;
  sessionExpired: boolean;
}): CloudBootDecision {
  if (!input.ready) {
    return "boot";
  }
  if (input.unavailable) {
    return "network";
  }
  if (input.mode !== "cloud") {
    return "authenticated";
  }
  if (input.authConfigured === false) {
    return "auth_config_missing";
  }
  if (input.user && input.organization) {
    return "authenticated";
  }
  if (input.sessionExpired) {
    return "session_expired";
  }
  return "unauthenticated";
}

export function loginErrorLabel(error: string): string {
  switch (error) {
    case "invalid_credentials":
      return "Email sau parolă greșită.";
    case "cloud_disabled":
    case "auth_config_missing":
      return "Autentificarea Cloud nu este configurată.";
    case "rate_limited":
      return "Prea multe încercări. Așteaptă un minut.";
    case "disabled":
      return "Contul este dezactivat.";
    case "no_membership":
      return "Acest cont nu are o organizație activă.";
    case "organization_disabled":
      return "Organizația este dezactivată.";
    case "forbidden":
      return "Nu ai acces la organizația aleasă.";
    case "invalid_payload":
    case "login_failed":
    case "switch_failed":
    case "invalid_session":
      return "Autentificarea nu a reușit.";
    default:
      return "Autentificarea nu a reușit.";
  }
}
