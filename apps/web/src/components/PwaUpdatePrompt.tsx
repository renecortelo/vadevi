import { Button } from "@vadevi/ui";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRegisterSW } from "virtual:pwa-register/react";

/** The install event is still non-standard, so it is typed locally. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const dismissedKey = "vadevi.installPromptDismissed";

/**
 * `localStorage` is unavailable during server rendering and can throw in
 * restrictive browser modes, so the dismissal preference degrades to "not
 * dismissed" rather than breaking the shell.
 */
function readDismissed(): boolean {
  try {
    return globalThis.localStorage?.getItem?.(dismissedKey) === "true";
  } catch {
    return false;
  }
}

function writeDismissed(): void {
  try {
    globalThis.localStorage?.setItem?.(dismissedKey, "true");
  } catch {
    // A device that refuses storage still gets a dismissible prompt this session.
  }
}

/**
 * Install guidance appears only when the browser says the app is installable
 * and the user has not dismissed it before, which is what §14.1 asks for.
 */
export function InstallPrompt() {
  const { t } = useTranslation();
  const [event, setEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    const capture = (incoming: Event) => {
      incoming.preventDefault();
      setEvent(incoming as InstallPromptEvent);
    };
    const installed = () => setEvent(null);
    globalThis.addEventListener("beforeinstallprompt", capture);
    globalThis.addEventListener("appinstalled", installed);
    return () => {
      globalThis.removeEventListener("beforeinstallprompt", capture);
      globalThis.removeEventListener("appinstalled", installed);
    };
  }, []);

  if (event === null || dismissed) return null;

  function dismiss() {
    writeDismissed();
    setDismissed(true);
  }

  return (
    <aside aria-label={t("pwa.installTitle")} className="update-prompt">
      <p>
        <strong>{t("pwa.installTitle")}</strong> {t("pwa.installBody")}
      </p>
      <div className="update-prompt__actions">
        <Button
          onClick={() => {
            void event.prompt().then(() => setEvent(null));
          }}
        >
          {t("pwa.installAction")}
        </Button>
        <Button onClick={dismiss} variant="secondary">
          {t("dismiss")}
        </Button>
      </div>
    </aside>
  );
}

/** Warning at 70% of the browser storage estimate, critical at 90%. */
const storageWarningRatio = 0.7;
const storageCriticalRatio = 0.9;

/**
 * Offline storage pressure. A full quota must never silently drop a text note,
 * so the warning explains that photos stop being kept while notes keep saving.
 */
export function StoragePressureNotice() {
  const { t } = useTranslation();
  const [level, setLevel] = useState<"critical" | "ok" | "warning">("ok");

  useEffect(() => {
    let active = true;
    async function measure() {
      const estimate = await navigator.storage?.estimate?.();
      if (!active || estimate?.quota === undefined || estimate.usage === undefined) return;
      if (estimate.quota === 0) return;
      const ratio = estimate.usage / estimate.quota;
      setLevel(
        ratio >= storageCriticalRatio
          ? "critical"
          : ratio >= storageWarningRatio
            ? "warning"
            : "ok",
      );
    }
    void measure();
    const timer = globalThis.setInterval(() => void measure(), 60_000);
    return () => {
      active = false;
      globalThis.clearInterval(timer);
    };
  }, []);

  if (level === "ok") return null;
  return (
    <aside aria-live="polite" className="update-prompt" role="status">
      <p>{level === "critical" ? t("pwa.storageCritical") : t("pwa.storageWarning")}</p>
    </aside>
  );
}

export function PwaUpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) {
    return null;
  }

  return (
    <aside aria-label={t("pwa.updateTitle")} className="update-prompt">
      <p>
        <strong>{t("pwa.updateTitle")}</strong> {t("pwa.updateBody")}
      </p>
      <div className="update-prompt__actions">
        <Button onClick={() => void updateServiceWorker(true)}>{t("reload")}</Button>
        <Button onClick={() => setNeedRefresh(false)} variant="secondary">
          {t("dismiss")}
        </Button>
      </div>
    </aside>
  );
}
