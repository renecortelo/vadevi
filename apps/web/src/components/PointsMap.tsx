import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/** One wine at a point on the map. */
export type MapPoint = Readonly<{
  latitude: number;
  longitude: number;
  /** Where it links to, and what it is. */
  subtitle: string;
  title: string;
  wineId: string;
}>;

/**
 * A schematic points map, drawn as inline SVG.
 *
 * The application's Content-Security-Policy is `default-src 'self'`: nothing
 * loads from another host, tiles included, so a Google or Leaflet map cannot
 * draw here at all. This is the map that can: the points projected onto a
 * coordinate grid, each one a place you tasted at or a place a wine is from. It
 * shows the shape of where your wine has taken you, and every point opens the
 * wine behind it. For the street underneath, each point keeps its "open in
 * Google Maps" link on the wine's own page.
 *
 * Points at the same spot — several bottles at one bar — gather into one marker
 * whose panel lists them all.
 */

/** A cluster of points close enough to share a marker. */
type Cluster = Readonly<{ latitude: number; longitude: number; points: MapPoint[] }>;

const WIDTH = 1_000;
const HEIGHT = 640;
const PADDING = 48;

/** Group points that round to the same hundredth of a degree (~1 km). */
function cluster(points: readonly MapPoint[]): Cluster[] {
  const byCell = new Map<string, MapPoint[]>();
  for (const point of points) {
    const key = `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`;
    byCell.set(key, [...(byCell.get(key) ?? []), point]);
  }
  return [...byCell.values()].map((group) => ({
    latitude: group[0]!.latitude,
    longitude: group[0]!.longitude,
    points: group,
  }));
}

export function PointsMap({ emptyLabel, points }: { emptyLabel: string; points: MapPoint[] }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Cluster | null>(null);

  const clusters = useMemo(() => cluster(points), [points]);

  // The bounding box of every point, padded so a lone point is not stranded in a
  // corner and a tight cluster is not a single pixel.
  const bounds = useMemo(() => {
    if (clusters.length === 0) return null;
    const lats = clusters.map((entry) => entry.latitude);
    const lons = clusters.map((entry) => entry.longitude);
    const pad = 0.5;
    const minLat = Math.min(...lats) - pad;
    const maxLat = Math.max(...lats) + pad;
    const minLon = Math.min(...lons) - pad;
    const maxLon = Math.max(...lons) + pad;
    return { maxLat, maxLon, minLat, minLon };
  }, [clusters]);

  if (bounds === null) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  // Equirectangular projection into the drawing box. Longitude runs left→right,
  // latitude bottom→top, and the aspect is corrected for the latitude so the
  // shape is not stretched at Spain's or Chile's distance from the equator.
  const midLat = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
  const lonSpan = Math.max((bounds.maxLon - bounds.minLon) * Math.cos(midLat), 0.001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.001);
  const inner = { height: HEIGHT - 2 * PADDING, width: WIDTH - 2 * PADDING };
  const project = (latitude: number, longitude: number) => ({
    x: PADDING + (((longitude - bounds.minLon) * Math.cos(midLat)) / lonSpan) * inner.width,
    y: PADDING + ((bounds.maxLat - latitude) / latSpan) * inner.height,
  });

  // A few grid lines with coordinate labels, for orientation without a coastline.
  const gridLats = [0.25, 0.5, 0.75].map(
    (f) => bounds.minLat + f * (bounds.maxLat - bounds.minLat),
  );
  const gridLons = [0.25, 0.5, 0.75].map(
    (f) => bounds.minLon + f * (bounds.maxLon - bounds.minLon),
  );

  return (
    <div className="points-map">
      <svg
        aria-label={t("memory.mapLabel")}
        className="points-map__canvas"
        role="group"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <rect className="points-map__frame" height={HEIGHT} rx={12} width={WIDTH} x={0} y={0} />
        {gridLats.map((lat) => {
          const { y } = project(lat, bounds.minLon);
          return (
            <g key={`lat-${lat}`}>
              <line className="points-map__grid" x1={PADDING} x2={WIDTH - PADDING} y1={y} y2={y} />
              <text className="points-map__tick" x={8} y={y + 4}>
                {lat.toFixed(1)}°
              </text>
            </g>
          );
        })}
        {gridLons.map((lon) => {
          const { x } = project(bounds.minLat, lon);
          return (
            <g key={`lon-${lon}`}>
              <line className="points-map__grid" x1={x} x2={x} y1={PADDING} y2={HEIGHT - PADDING} />
              <text className="points-map__tick" textAnchor="middle" x={x} y={HEIGHT - 16}>
                {lon.toFixed(1)}°
              </text>
            </g>
          );
        })}
        {clusters.map((entry) => {
          const { x, y } = project(entry.latitude, entry.longitude);
          const active = selected === entry;
          return (
            <g key={`${entry.latitude},${entry.longitude}`}>
              {/* A circle is not a button: it announces nothing on its own, and
                  focus reaches it without Enter or Space doing anything, so a
                  keyboard could land on every point and open none of them. The
                  name comes from the wines standing there, and the key handler
                  is what a native button would have given us for free. */}
              <circle
                aria-label={entry.points.map((point) => point.title).join(", ")}
                className={active ? "points-map__dot points-map__dot--active" : "points-map__dot"}
                cx={x}
                cy={y}
                onClick={() => setSelected(active ? null : entry)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(active ? null : entry);
                  }
                }}
                r={entry.points.length > 1 ? 12 : 8}
                role="button"
                tabIndex={0}
              />
              {entry.points.length > 1 ? (
                <text className="points-map__count" textAnchor="middle" x={x} y={y + 4}>
                  {entry.points.length}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>

      {selected === null ? (
        <p className="points-map__hint">{t("memory.mapHint")}</p>
      ) : (
        <ul className="points-map__panel">
          {selected.points.map((point) => (
            <li key={`${point.wineId}-${point.title}`}>
              <Link to={`/wines/${point.wineId}/evidence`}>
                <strong>{point.title}</strong>
                <span>{point.subtitle}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
