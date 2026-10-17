import { useTranslation } from "react-i18next";

import { MapControls } from "./MapControls";
import { mapSheets } from "./map-sheets";
import { useZoomPan } from "./useZoomPan";

const sheets = mapSheets.map((sheet) => sheet.data);

/**
 * A small map: the country, its neighbours for bearings, and a point where
 * there is one. Drawn from outlines shipped with the app (Natural Earth,
 * public domain), so showing it asks no map service for anything — on the
 * sheet that holds the country: Europe's, North or South America's, Oceania's
 * or southern Africa's.
 *
 * It frames the country's mainland, and the point if it lies beyond — the
 * Canaries' wines widen Spain's frame, Rioja's does not.
 */
export function AtlasMap({
  caption = null,
  countryCode,
  label,
  latitude = null,
  longitude = null,
}: {
  /** Who drew the points, where it is not the European atlas's sources. */
  caption?: string | null;
  countryCode: string | null;
  label: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const { t } = useTranslation();
  const code = countryCode?.toUpperCase() ?? null;
  const data = code === null ? undefined : sheets.find((sheet) => sheet.boxes[code] !== undefined);
  const box = code === null ? undefined : data?.boxes[code];
  const point =
    data === undefined || latitude === null || longitude === null
      ? null
      : ([
          (longitude - data.frame.lonMin) * data.squeeze * data.scale,
          (data.frame.latMax - latitude) * data.scale,
        ] as const);
  let [x0, y0, x1, y1] = box ?? [0, 0, 1, 1];
  if (point !== null) {
    x0 = Math.min(x0, point[0]);
    y0 = Math.min(y0, point[1]);
    x1 = Math.max(x1, point[0]);
    y1 = Math.max(y1, point[1]);
  }
  // Some sea around it, and never so close that a small country fills it.
  const size = Math.max(x1 - x0, y1 - y0, 60) * 1.35;
  const centre = [(x0 + x1) / 2, (y0 + y1) / 2];
  const zoom = useZoomPan({ h: size, w: size, x: centre[0]! - size / 2, y: centre[1]! - size / 2 });
  if (data === undefined || box === undefined) return null;
  // Lines and the point keep their size on the screen however close.
  const stroke = size / 260 / zoom.scale;
  return (
    <figure className="library-map">
      <div className="map-frame">
        <svg aria-label={t("library.mapLabel", { place: label })} role="img" {...zoom.svgProps}>
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
              r={size / 45 / Math.sqrt(zoom.scale)}
              strokeWidth={size / 110 / zoom.scale}
            />
          )}
        </svg>
        <MapControls
          onIn={zoom.zoomIn}
          onOut={zoom.zoomOut}
          onReset={zoom.reset}
          zoomed={zoom.zoomed}
        />
      </div>
      {/* The points' sources are credited only where a point is drawn; the
          outline (Natural Earth) is public domain and asks for no credit. */}
      {point === null ? null : (
        <figcaption className="source-note">{caption ?? t("library.mapSource")}</figcaption>
      )}
    </figure>
  );
}
