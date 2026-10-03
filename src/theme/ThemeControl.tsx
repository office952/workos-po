import { useEffect, useState } from "react";
import {
  applyColorScheme,
  COLOR_SCHEME_EVENT,
  readColorSchemePreference,
  resolveColorScheme,
  writeColorSchemePreference,
  type ColorSchemePreference,
} from "./colorScheme";

export function ThemeSync() {
  useColorSchemePreference();
  return null;
}

export function ThemeControl() {
  const [preference, setPreference] = useColorSchemePreference();
  const prefersDark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolved = resolveColorScheme(preference, prefersDark);
  const dark = resolved === "dark";

  return (
    <div className="theme-control">
      <span className="theme-control__label">Iluminare WorkOS</span>
      <button
        type="button"
        className="theme-control__switch"
        role="switch"
        aria-checked={dark}
        aria-label="Schimbă prezentarea WorkOS"
        onClick={() => {
          setPreference(dark ? "light" : "dark");
        }}
      >
        <span className="theme-control__track" aria-hidden="true">
          <span className="theme-control__knob" />
        </span>
        <span className="theme-control__state">{dark ? "DARK" : "LIGHT"}</span>
      </button>
    </div>
  );
}

function useColorSchemePreference(): [
  ColorSchemePreference,
  (preference: ColorSchemePreference) => void,
] {
  const [preference, setPreference] = useState<ColorSchemePreference>(readColorSchemePreference);

  useEffect(() => {
    applyColorScheme(preference);
    const onPreference = () => {
      setPreference(readColorSchemePreference());
    };
    window.addEventListener(COLOR_SCHEME_EVENT, onPreference);
    if (typeof window.matchMedia !== "function") {
      return () => {
        window.removeEventListener(COLOR_SCHEME_EVENT, onPreference);
      };
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onMedia = () => {
      if (readColorSchemePreference() === "system") {
        applyColorScheme("system");
        setPreference("system");
      }
    };
    media.addEventListener("change", onMedia);
    return () => {
      media.removeEventListener("change", onMedia);
      window.removeEventListener(COLOR_SCHEME_EVENT, onPreference);
    };
  }, [preference]);

  return [preference, writeColorSchemePreference];
}
