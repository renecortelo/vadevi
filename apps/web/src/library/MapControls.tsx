import { useTranslation } from "react-i18next";

/** The map's zoom as buttons: for a keyboard, and for whoever prefers them. */
export function MapControls({
  onIn,
  onOut,
  onReset,
  zoomed,
}: {
  onIn: () => void;
  onOut: () => void;
  onReset: () => void;
  zoomed: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="map-controls" role="group" aria-label={t("map.controls")}>
      <button aria-label={t("map.zoomIn")} onClick={onIn} type="button">
        +
      </button>
      <button aria-label={t("map.zoomOut")} disabled={!zoomed} onClick={onOut} type="button">
        −
      </button>
      <button aria-label={t("map.reset")} disabled={!zoomed} onClick={onReset} type="button">
        ⤢
      </button>
    </div>
  );
}
