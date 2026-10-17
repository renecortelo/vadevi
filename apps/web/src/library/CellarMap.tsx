import type { WineStats } from "@vadevi/contracts";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { MapControls } from "./MapControls";
import { mapSheets, type SheetId } from "./map-sheets";
import { useZoomPan } from "./useZoomPan";

type Place = WineStats["wines"]["regionPlaces"][number];

/**
 * Where the cellar's wines come from: a point for each registered name its
 * wines are from, larger with more wines, on one sheet of the map at a time.
 * A point the atlas places approximately (an area, a place of the name) is
 * drawn hollow. Each point opens the name's page in the atlas; the list of
 * regions beside it says the same in words.
 */
export function CellarMap({ places }: { places: readonly Place[] }) {
  const { i18n, t } = useTranslation();
  // The sheets that hold a point, the one with most wines first.
  const held = mapSheets
    .map((sheet) => ({
      ...sheet,
      places: places.filter((place) => sheet.data.boxes[place.countryCode] !== undefined),
    }))
    .filter((sheet) => sheet.places.length > 0)
    .map((sheet) => ({
      ...sheet,
      wines: sheet.places.reduce((sum, place) => sum + place.count, 0),
    }));
  const [chosen, setChosen] = useState<SheetId | null>(null);
  const sheet =
    held.find((candidate) => candidate.id === chosen) ??
    [...held].sort((left, right) => right.wines - left.wines)[0];
  const data = sheet?.data;
  const project = (place: Place) =>
    data === undefined
      ? ([0, 0] as const)
      : ([
          (place.longitude - data.frame.lonMin) * data.squeeze * data.scale,
          (data.frame.latMax - place.latitude) * data.scale,
        ] as const);
  const points = (sheet?.places ?? []).map((place) => ({ place, xy: project(place) }));
  // The frame: the points and their countries, with some land around them.
  const boxes = (sheet?.places ?? []).map((place) => data!.boxes[place.countryCode]!);
  const x0 = Math.min(...boxes.map((box) => box[0]), ...points.map((point) => point.xy[0]));
  const y0 = Math.min(...boxes.map((box) => box[1]), ...points.map((point) => point.xy[1]));
  const x1 = Math.max(...boxes.map((box) => box[2]), ...points.map((point) => point.xy[0]));
  const y1 = Math.max(...boxes.map((box) => box[3]), ...points.map((point) => point.xy[1]));
  const size = Number.isFinite(x0) ? Math.max(x1 - x0, y1 - y0, 60) * 1.2 : 1;
  const centre = Number.isFinite(x0)
    ? ([(x0 + x1) / 2, (y0 + y1) / 2] as const)
    : ([0, 0] as const);
  const zoom = useZoomPan({ h: size, w: size, x: centre[0] - size / 2, y: centre[1] - size / 2 });
  if (sheet === undefined || data === undefined) return null;
  const largest = Math.max(1, ...sheet.places.map((place) => place.count));
  const countries = new Set(sheet.places.map((place) => place.countryCode));
  return (
    <figure className="library-map cellar-map">
      {held.length < 2 ? null : (
        <div aria-label={t("library.coverage.sheets")} className="segmented-control" role="group">
          {held.map((candidate) => (
            <button
              aria-pressed={candidate.id === sheet.id}
              key={candidate.id}
              onClick={() => setChosen(candidate.id)}
              type="button"
            >
              {t(`library.coverage.sheet.${candidate.id}`)}
            </button>
          ))}
        </div>
      )}
      <div className="map-frame">
        <svg aria-label={t("stats.cellarMap.label")} key={sheet.id} {...zoom.svgProps}>
          <rect
            className="library-map__sea"
            height={size}
            width={size}
            x={centre[0] - size / 2}
            y={centre[1] - size / 2}
          />
          {Object.entries(data.countries).map(([code, path]) => (
            <path
              className={
                countries.has(code) ? "library-map__country is-held" : "library-map__country"
              }
              d={path}
              key={code}
              strokeWidth={size / 400 / zoom.scale}
            />
          ))}
          {points
            .toSorted((left, right) => right.place.count - left.place.count)
            .map(({ place, xy }, index) => (
              <Link
                aria-label={t("stats.cellarMap.point", {
                  count: place.count,
                  name: place.key,
                  wines: new Intl.NumberFormat(i18n.language).format(place.count),
                })}
                key={place.regionId}
                to={`/library/regions/${place.regionId}`}
              >
                <circle
                  className={
                    ["area", "place"].includes(place.pointSource)
                      ? "cellar-map__point is-approximate"
                      : "cellar-map__point"
                  }
                  cx={xy[0]}
                  cy={xy[1]}
                  r={
                    ((size / 70) * (0.7 + Math.sqrt(place.count / largest))) / Math.sqrt(zoom.scale)
                  }
                  strokeWidth={size / 160 / zoom.scale}
                  style={{ "--motion-index": Math.min(index, 12) } as CSSProperties}
                />
              </Link>
            ))}
        </svg>
        <MapControls
          onIn={zoom.zoomIn}
          onOut={zoom.zoomOut}
          onReset={zoom.reset}
          zoomed={zoom.zoomed}
        />
      </div>
      <figcaption className="section-help">{t("stats.cellarMap.caption")}</figcaption>
    </figure>
  );
}
