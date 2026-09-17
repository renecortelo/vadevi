import { useTranslation } from "react-i18next";

/**
 * "Open this place in Google Maps."
 *
 * A recorded venue is only half useful if you cannot get directions to it, so
 * the point travels to a map the reader already has. Coordinates are preferred
 * over the name: a point is unambiguous, while two bars share a name.
 *
 * It is a plain link the reader chooses to follow, not an embed — nothing is
 * requested from Google unless they click, so opening a tasting does not tell
 * anyone where it happened. `noreferrer` keeps this application's URL out of
 * what the map is told.
 */
export function MapLink({
  className,
  latitude,
  longitude,
  name,
}: {
  className?: string | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  name?: string | null | undefined;
}) {
  const { t } = useTranslation();
  const hasPoint = typeof latitude === "number" && typeof longitude === "number";
  const label = name?.trim() ?? "";
  if (!hasPoint && label.length === 0) return null;
  const query = hasPoint ? `${latitude},${longitude}` : label;
  const href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return (
    <a
      className={className ?? "map-link"}
      href={href}
      rel="noreferrer noopener"
      target="_blank"
      // A name alone lands on a search rather than on the place, which is worth
      // saying before the reader follows it and wonders why.
      title={hasPoint ? t("tasting.venue.mapTitle") : t("tasting.venue.mapTitleByName")}
    >
      {t("tasting.venue.mapAction")}
    </a>
  );
}
