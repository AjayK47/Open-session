import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";
const STORAGE_KEY = "open-session-theme";

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

/**
 * Site-wide light/dark toggle. Dark is the default for every visitor —
 * deliberately not deferring to the OS/browser's prefers-color-scheme, so
 * the product has one consistent first impression regardless of a visitor's
 * system settings — and stays that way until they explicitly toggle, at
 * which point the choice is persisted per browser. `index.html` applies the
 * same choice synchronously before React mounts, so there's no flash of the
 * wrong theme on load.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme() ?? "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "light" ? "dark" : "light";
      window.localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return [theme, toggle];
}
