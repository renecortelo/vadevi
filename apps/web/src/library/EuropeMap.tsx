import { useTranslation } from "react-i18next";

import map from "./europe-map.json";

type MapData = {
  boxes: Record<string, [number, number, number, number]>;
  countries: Record<string, string>;
  frame: { latMax: number; latMin: number; lonMax: number; lonMin: number };
  height: number;
  scale: number;
  squeeze: number;
  width: number;
};
const data = map as unknown as MapData;

/**
 * A small map: the country, its neighbours for bearings, and a point where
 * there is one. Drawn from outlines shipped with the app (Natural Earth,
 * public domain), so showing it asks no map service for anything.
 *
 * It frames the country's mainland, and the point if it lies beyond — the
 * Canaries' wines widen Spain's frame, Rioja's does not.
 */
export function EuropeMap({
  countryCode,
  label,
  latitude = null,
  longitude = null,
}: {
  countryCode: string | null;
  label: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const { t } = useTranslation();
  const code = countryCode?.toUpperCase() ?? null;
  const box = code === null ? undefined : data.boxes[code];
  if (box === undefined) return null;
  const point =
    latitude === null || longitude === null
      ? null
      : ([
          (longitude - data.frame.lonMin) * data.squeeze * data.scale,
          (data.frame.latMax - latitude) * data.scale,
        ] as const);
  let [x0, y0, x1, y1] = box;
  if (point !== null) {
    x0 = Math.min(x0, point[0]);
    y0 = Math.min(y0, point[1]);
    x1 = Math.max(x1, point[0]);
    y1 = Math.max(y1, point[1]);
  }
  // Some sea around it, and never so close that a small country fills it.
  const size = Math.max(x1 - x0, y1 - y0, 60) * 1.35;
  const centre = [(x0 + x1) / 2, (y0 + y1) / 2];
  const viewBox = [centre[0]! - size / 2, centre[1]! - size / 2, size, size]
    .map((value) => value.toFixed(1))
    .join(" ");
  const stroke = size / 260;
  return (
    <figure className="library-map">
      <svg aria-label={t("library.mapLabel", { place: label })} role="img" viewBox={viewBox}>
        <rect
          className="library-map__sea"
          height={size}
          width={size}
          x={centre[0]! - size / 2}
          y={centre[1]! - size / 2}
        />
        {Object.entries(data.countries).map(([country, path]) => (
          <path
            className={
              country === code ? "library-map__country is-selected" : "library-map__country"
            }
            d={path}
            key={country}
            strokeWidth={stroke}
          />
        ))}
        {point === null ? null : (
          <circle
            className="library-map__point"
            cx={point[0]}
            cy={point[1]}
            r={size / 45}
            strokeWidth={size / 110}
          />
        )}
      </svg>
      <figcaption className="section-help">{t("library.mapSource")}</figcaption>
    </figure>
  );
}
