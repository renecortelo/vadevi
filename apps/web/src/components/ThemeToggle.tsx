import type { ThemePreference } from "@vadevi/contracts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useSession } from "../session/SessionContext";
import { applyTheme, themePreferences } from "../theme/theme";

/**
 * Three-state theme control: system, light, dark.
 *
 * `system` is offered deliberately rather than a two-way switch, because a
 * member who has already told their operating system what they want should not
 * have to repeat it here — and should keep following it when it changes.
 *
 * The choice is saved to the account so it follows the member between devices.
 * A failed save is reported rather than silently reverted, but the interface
 * still switches, so the control never feels broken while offline.
 */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { bootstrap, updateProfile } = useSession();
  const saved = bootstrap.data.user.preferredTheme;
  const [pending, setPending] = useState<ThemePreference | null>(null);
  const [failed, setFailed] = useState(false);
  // The account is the source of truth. A pending local choice wins only until
  // the save round-trips, which is also how a change made on another device
  // arrives here without a state cascade.
  const preference = pending ?? saved;

  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  // While following the system, track it live rather than only at load.
  useEffect(() => {
    if (preference !== "system") return;
    const query = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    if (query === undefined) return;
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [preference]);

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

  return (
    <div className="theme-toggle">
      <div aria-label={t("theme.label")} className="segmented-control" role="group">
        {themePreferences.map((option) => (
          <button
            aria-pressed={preference === option}
            key={option}
            onClick={() => void choose(option)}
            type="button"
          >
            {t(`theme.${option}`)}
          </button>
        ))}
      </div>
      {failed ? (
        <span className="form-error" role="alert">
          {t("theme.saveError")}
        </span>
      ) : null}
    </div>
  );
}
