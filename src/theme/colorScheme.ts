export type ColorSchemePreference = "light" | "dark" | "system";

export const COLOR_SCHEME_STORAGE_KEY = "workos-color-scheme";
export const COLOR_SCHEME_EVENT = "workos-color-scheme";

export function readColorSchemePreference(
  storage: Pick<Storage, "getItem"> | null = readStorage(),
): ColorSchemePreference {
  try {
    const value = storage?.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    return "system";
  }
  return "system";
}

export function resolveColorScheme(
  preference: ColorSchemePreference,
  prefersDark: boolean,
): "light" | "dark" {
  switch (preference) {
    case "light":
      return "light";
    case "dark":
      return "dark";
    case "system":
      return prefersDark ? "dark" : "light";
    default: {
      const exhaustive: never = preference;
      return exhaustive;
    }
  }
}

export function applyColorScheme(
  preference: ColorSchemePreference,
  prefersDark = readPrefersDark(),
): "light" | "dark" {
  const resolved = resolveColorScheme(preference, prefersDark);
  const root = document.documentElement;
  root.dataset.theme = preference;
  root.dataset.resolvedTheme = resolved;
  root.style.colorScheme = resolved;
  return resolved;
}

export function writeColorSchemePreference(preference: ColorSchemePreference): void {
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, preference);
  } catch {
    // Storage failures must not block the shell.
  }
  applyColorScheme(preference);
  window.dispatchEvent(new Event(COLOR_SCHEME_EVENT));
}

function readStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function readPrefersDark(): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
