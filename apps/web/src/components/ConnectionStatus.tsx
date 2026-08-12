import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function ConnectionStatus() {
  const { t } = useTranslation();
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const updateStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);

  return (
    <span aria-live="polite" className="connection-status" data-online={isOnline}>
      <span aria-hidden="true" className="connection-status__dot" />
      {isOnline ? t("online") : t("offline")}
    </span>
  );
}
