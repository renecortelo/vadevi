import type { ThemePreference } from "@vadevi/contracts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSession } from "../session/SessionContext";
import { applyTheme, resolveTheme, themePreferences } from "../theme/theme";

/** The account's theme, with a local choice shown until it is saved. */
function useThemeChoice() {
  const { bootstrap, updateProfile } = useSession();
  const saved = bootstrap.data.user.preferredTheme;
  const [pending, setPending] = useState<ThemePreference | null>(null);
  const [failed, setFailed] = useState(false);
  // The account is the source of truth. A pending local choice wins only until
  // the save round-trips, which is also how a change made on another device
  // arrives here without a state cascade.
  const preference = pending ?? saved;

  async function choose(next: ThemePreference) {
    setFailed(false);
    setPending(next);
    applyTheme(next);
    try {
      await updateProfile({ preferredTheme: next });
      setPending(null);
    } catch {
      setFailed(true);
    }
  }

  return { choose, failed, preference };
}

/**
 * The theme in the top bar: one button, a sun or a moon.
 *
 * It shows the palette being painted and switches to the other. Following
 * the device's own setting — the default — stays available on the About
 * screen (`ThemeMenu`); a member who taps here has chosen for themselves.
 *
 * This is also where the chosen palette is applied, since the bar is always
 * on screen. A failed save is reported rather than silently reverted, but the
 * interface still switches, so the control never feels broken while offline.
 */
export function ThemeButton() {
  const { t } = useTranslation();
  const { choose, failed, preference } = useThemeChoice();
  // Re-read when the device switches while "system" is followed; the
  // listener below bumps it.
  const [, setDeviceChanges] = useState(0);
  const painted = resolveTheme(preference);

  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  // While following the system, track it live rather than only at load.
  useEffect(() => {
    if (preference !== "system") return;
    const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (query === undefined) return;
    const onChange = () => {
      applyTheme("system");
      setDeviceChanges((count) => count + 1);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

  const next = painted === "dark" ? "light" : "dark";
  return (
    <>
      <button
        aria-label={t(next === "light" ? "theme.toLight" : "theme.toDark")}
        className="theme-button"
        data-painted={painted}
        onClick={() => void choose(next)}
        title={t(next === "light" ? "theme.toLight" : "theme.toDark")}
        type="button"
      >
        {painted === "dark" ? <MoonIcon /> : <SunIcon />}
      </button>
      {failed ? (
        <span className="form-error" role="alert">
          {t("theme.saveError")}
        </span>
      ) : null}
    </>
  );
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6Z" />
    </svg>
  );
}

/**
 * The three choices — system, light, dark — as a menu, on the About screen.
 *
 * `system` is kept deliberately: a member who has already told their
 * operating system what they want should not have to repeat it here, and
 * should keep following it when it changes.
 */
export function ThemeMenu() {
  const { t } = useTranslation();
  const { choose, failed, preference } = useThemeChoice();

  return (
    <div className="theme-toggle">
      <label htmlFor="preferred-theme">{t("theme.label")}</label>
      <select
        id="preferred-theme"
        onChange={(event) => void choose(event.target.value as ThemePreference)}
        value={preference}
      >
        {themePreferences.map((option) => (
          <option key={option} value={option}>
            {t(`theme.${option}`)}
          </option>
        ))}
      </select>
      {failed ? (
        <span className="form-error" role="alert">
          {t("theme.saveError")}
        </span>
      ) : null}
    </div>
  );
}
