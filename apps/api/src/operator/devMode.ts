/**
 * Development-only operator identity helpers.
 * Never enable in production. Fail closed.
 */

export const DEV_OPERATOR_BYPASS_ENV = "WORKOS_DEV_OPERATOR_BYPASS";
export const DEV_OPERATOR_PERSON_ID_ENV = "WORKOS_DEV_OPERATOR_PERSON_ID";

export type DevOperatorEnv = {
  NODE_ENV?: string;
  WORKOS_DEV_OPERATOR_BYPASS?: string;
  WORKOS_DEV_OPERATOR_PERSON_ID?: string;
};

export function isProductionRuntime(env: DevOperatorEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

export function isDevOperatorBypassRequested(env: DevOperatorEnv = process.env): boolean {
  return env.WORKOS_DEV_OPERATOR_BYPASS === "1";
}

/** Both non-production runtime AND explicit bypass flag required. */
export function isDevOperatorModeEnabled(env: DevOperatorEnv = process.env): boolean {
  return !isProductionRuntime(env) && isDevOperatorBypassRequested(env);
}

export function getConfiguredDevOperatorPersonId(
  env: DevOperatorEnv = process.env,
): string | null {
  const raw = env.WORKOS_DEV_OPERATOR_PERSON_ID?.trim() ?? "";
  return raw.length > 0 ? raw : null;
}

/**
 * Production must never start with the bypass flag set.
 * Call once at API process boot before listen.
 */
export function assertDevOperatorConfigSafe(env: DevOperatorEnv = process.env): void {
  if (isProductionRuntime(env) && isDevOperatorBypassRequested(env)) {
    throw new Error(
      "Refusing to start: WORKOS_DEV_OPERATOR_BYPASS=1 is forbidden when NODE_ENV=production.",
    );
  }
}
