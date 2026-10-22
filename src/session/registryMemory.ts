/**
 * Per-tab memory of a register's search and filters, so returning from a detail page
 * finds the register as it was left. Preferences only: failures never block reading data.
 */
export function readRegistryMemory<T extends Record<string, unknown>>(key: string, fallback: T, accept: (value: Record<string, unknown>) => T | null): T {
  if (typeof sessionStorage === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return fallback;
    return accept(parsed as Record<string, unknown>) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeRegistryMemory(key: string, value: Record<string, unknown>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Register preferences must not prevent reading the register.
  }
}

export function clearRegistryMemory(...keys: string[]): void {
  if (typeof sessionStorage === "undefined") return;
  for (const key of keys) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Session isolation does not depend on preference storage being available.
    }
  }
}
