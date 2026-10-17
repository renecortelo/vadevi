import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import type { MapPoint } from "../components/PointsMap";
import { MapControls } from "./MapControls";
import { mapSheets, type SheetId } from "./map-sheets";
import { useZoomPan } from "./useZoomPan";

type Spot = { latitude: number; longitude: number; points: MapPoint[]; subtitle: string };

/**
 * Points on the app's own map sheets — the atlas's and the cellar book's
 * style and colours — that come closer and move: one point for each place,
 * larger with more wines; touching one names its wines, each a link.
 */
export function SheetPointsMap({ label, points }: { label: string; points: readonly MapPoint[] }) {
  const { t } = useTranslation();
  // One spot per place.
  const spots = [
    ...points
      .reduce((all, point) => {
        const key = `${point.latitude.toFixed(3)} ${point.longitude.toFixed(3)}`;
        const spot = all.get(key) ?? {
          latitude: point.latitude,
          longitude: point.longitude,
          points: [],
          subtitle: point.subtitle,
        };
        spot.points.push(point);
        return all.set(key, spot);
      }, new Map<string, Spot>())
      .values(),
  ];
  const inside = (spot: Spot, frame: (typeof mapSheets)[number]["data"]["frame"]) =>
    spot.latitude <= frame.latMax &&
    spot.latitude >= frame.latMin &&
    spot.longitude <= frame.lonMax &&
    spot.longitude >= frame.lonMin;
  const held = mapSheets
    .map((sheet) => ({ ...sheet, spots: spots.filter((spot) => inside(spot, sheet.data.frame)) }))
    .filter((sheet) => sheet.spots.length > 0);
  const [chosen, setChosen] = useState<SheetId | null>(null);
  const [tag, setTag] = useState<Spot | null>(null);
  // With no point yet, the map still shows, on Europe's sheet.
  const sheet = held.find((candidate) => candidate.id === chosen) ??
    [...held].sort((left, right) => right.spots.length - left.spots.length)[0] ?? {
      ...mapSheets[0]!,
      spots: [] as Spot[],
    };
  const data = sheet?.data;
  const project = (spot: { latitude: number; longitude: number }) =>
    data === undefined
      ? ([0, 0] as const)
      : ([
          (spot.longitude - data.frame.lonMin) * data.squeeze * data.scale,
          (data.frame.latMax - spot.latitude) * data.scale,
        ] as const);
  const xy = (sheet?.spots ?? []).map(project);
  const x0 = Math.min(...xy.map((point) => point[0]));
  const y0 = Math.min(...xy.map((point) => point[1]));
  const x1 = Math.max(...xy.map((point) => point[0]));
  const y1 = Math.max(...xy.map((point) => point[1]));
  // The points with some land around them, never closer than a region.
  const size = Number.isFinite(x0) ? Math.max(x1 - x0, y1 - y0, 50) * 1.5 : 1;
  const centre = Number.isFinite(x0) ? [(x0 + x1) / 2, (y0 + y1) / 2] : [0, 0];
  // It opens on the points and goes out as far as their whole sheet.
  const whole = { h: data?.height ?? 1, w: data?.width ?? 1, x: 0, y: 0 };
  const zoom = useZoomPan(
    whole,
    Number.isFinite(x0)
      ? { h: size, w: size, x: centre[0]! - size / 2, y: centre[1]! - size / 2 }
      : whole,
  );
  if (sheet === undefined || data === undefined) return null;
  const largest = Math.max(1, ...sheet.spots.map((spot) => spot.points.length));
  const tagAt = tag === null ? null : project(tag);
  return (
    <figure className="library-map cellar-map">
      {held.length < 2 ? null : (
        <div aria-label={t("library.coverage.sheets")} className="segmented-control" role="group">
          {held.map((candidate) => (
            <button
              aria-pressed={candidate.id === sheet.id}
              key={candidate.id}
              onClick={() => {
                setChosen(candidate.id);
                setTag(null);
              }}
              type="button"
            >
              {t(`library.coverage.sheet.${candidate.id}`)}
            </button>
          ))}
        </div>
      )}
      <div className="map-frame">
        <svg aria-label={label} key={sheet.id} role="img" {...zoom.svgProps}>
          <rect className="library-map__sea" height={data.height} width={data.width} />
          {Object.entries(data.countries).map(([code, path]) => (
            <path
              className="library-map__country"
              d={path}
              key={code}
              strokeWidth={zoom.view.w / 400}
            />
          ))}
          {sheet.spots.map((spot, index) => {
            const [x, y] = xy[index]!;
            return (
              <circle
                className={`cellar-map__point${tag === spot ? " is-tagged" : ""}`}
                cx={x}
                cy={y}
                key={`${spot.latitude} ${spot.longitude}`}
                onClick={() => setTag(spot)}
                r={(zoom.view.w / 70) * (0.7 + Math.sqrt(spot.points.length / largest))}
                strokeWidth={zoom.view.w / 160}
              >
                <title>{spot.subtitle}</title>
              </circle>
            );
          })}
        </svg>
        <MapControls
          onIn={zoom.zoomIn}
          onOut={zoom.zoomOut}
          onReset={() => {
            zoom.reset();
            setTag(null);
          }}
          canOut={zoom.canZoomOut}
          moved={zoom.moved}
        />
        {tag === null || tagAt === null ? null : (
          <div
            className="map-tag"
            role="status"
            style={{
              insetInlineStart: `${((tagAt[0] - zoom.view.x) / zoom.view.w) * 100}%`,
              insetBlockStart: `${((tagAt[1] - zoom.view.y) / zoom.view.h) * 100}%`,
            }}
          >
            <strong>{tag.subtitle}</strong>
            {tag.points.slice(0, 6).map((point) => (
              <Link className="text-link" key={point.wineId} to={`/wines/${point.wineId}/evidence`}>
                {point.title}
              </Link>
            ))}
            {tag.points.length > 6 ? <span>+{tag.points.length - 6}</span> : null}
            <button aria-label={t("map.closeTag")} onClick={() => setTag(null)} type="button">
              ×
            </button>
          </div>
        )}
      </div>
    </figure>
  );
}
