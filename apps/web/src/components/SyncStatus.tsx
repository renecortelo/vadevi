import { useTranslation } from "react-i18next";

import { useOfflineSync } from "../offline/OfflineSyncContext";

export function SyncStatus() {
  const { t } = useTranslation();
  const { flush, pendingCount, status } = useOfflineSync();
  return (
    <button
      aria-label={t(`sync.${status}`)}
      className="sync-status"
      data-state={status}
      disabled={status === "syncing"}
      onClick={() => void flush()}
      type="button"
    >
      <span aria-hidden="true" className="sync-status__dot" />
      <span>{t(`sync.${status}`)}</span>
      {pendingCount > 0 ? <span className="sync-status__count">{pendingCount}</span> : null}
    </button>
  );
}
