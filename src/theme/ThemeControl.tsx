import { useEffect, useState } from "react";
import {
  applyColorScheme,
  COLOR_SCHEME_EVENT,
  readColorSchemePreference,
  writeColorSchemePreference,
  type ColorSchemePreference,
} from "./colorScheme";

const OPTIONS: readonly { value: ColorSchemePreference; label: string }[] = [
  { value: "light", label: "Luminos" },
  { value: "dark", label: "Întunecat" },
  { value: "system", label: "Sistem" },
];

export function ThemeSync() {
  useColorSchemePreference();
  return null;
}

export function ThemeControl() {
  const [preference, setPreference] = useColorSchemePreference();

  return (
    <div className="theme-control">
      <label className="theme-control__label" htmlFor="color-scheme">
        Aspect
      </label>
      <select
        id="color-scheme"
        className="field__control theme-control__select"
        value={preference}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "light" || next === "dark" || next === "system") {
            setPreference(next);
          }
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
