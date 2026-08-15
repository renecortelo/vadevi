import type { ThemePreference } from "@vadevi/contracts";

/**
 * Theme resolution.
 *
 * The account preference is the source of truth, so a member who chooses dark on
 * a phone gets dark on a laptop. `localStorage` mirrors it purely so the first
 * paint after a reload is already correct — `theme-init.js` reads that mirror
 * before the application renders.
 */

export const themeStorageKey = "vadevi.theme";

export const themePreferences: readonly ThemePreference[] = ["system", "light", "dark"];

/** The palette actually painted, once `system` is resolved against the device. */
export type ResolvedTheme = "dark" | "light";

export function prefersDark(): boolean {
  return globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return prefersDark() ? "dark" : "light";
  return preference;
}

/** Kept in step with the palette so the mobile status bar matches the page. */
const themeColors: Record<ResolvedTheme, string> = {
  dark: "#210a0f",
  light: "#fbe9e5",
};

/**
 * Applies a preference to the document.
 *
 * `system` removes the attribute rather than pinning a value, so the page keeps
 * following the device if the user changes it while the tab is open.
 */
export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference);
  const root = document.documentElement;

  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", themeColors[resolved]);

  try {
    if (preference === "system") globalThis.localStorage?.removeItem(themeStorageKey);
    else globalThis.localStorage?.setItem(themeStorageKey, preference);
  } catch {
    // A browser that refuses storage still themes correctly this session; only
    // the pre-paint optimisation is lost.
  }

  return resolved;
}
