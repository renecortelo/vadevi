import { Button } from "@vadevi/ui";
import { useTranslation } from "react-i18next";
import { useRegisterSW } from "virtual:pwa-register/react";

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
    <aside aria-label={t("updateReady")} className="update-prompt">
      <p>{t("updateReady")}</p>
      <div className="update-prompt__actions">
        <Button onClick={() => void updateServiceWorker(true)}>{t("reload")}</Button>
        <Button onClick={() => setNeedRefresh(false)} variant="secondary">
          {t("dismiss")}
        </Button>
      </div>
    </aside>
  );
}
