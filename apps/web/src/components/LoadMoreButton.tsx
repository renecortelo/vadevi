import { useTranslation } from "react-i18next";

/** The way to the rest of a list that comes a page at a time. */
export function LoadMoreButton({
  count,
  loading,
  onClick,
}: {
  count: number;
  loading: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="memory-paging">
      <p aria-live="polite">{t("memory.shownCount", { count })}</p>
      <button
        className="action-link action-link--secondary"
        disabled={loading || !navigator.onLine}
        onClick={onClick}
        type="button"
      >
        {loading ? t("memory.loadingMore") : t("memory.loadMore")}
      </button>
    </div>
  );
}
