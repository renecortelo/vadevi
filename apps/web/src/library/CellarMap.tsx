import type { WineStats } from "@vadevi/contracts";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { MapControls } from "./MapControls";
import { mapSheets, type SheetId } from "./map-sheets";
import type { LibraryTrail } from "./trail";
import { useZoomPan } from "./useZoomPan";

type Place = WineStats["wines"]["regionPlaces"][number];

/**
 * Where the cellar's wines come from: a point for each registered name its
 * wines are from, larger with more wines, on one sheet of the map at a time.
 * A point the atlas places approximately (an area, a place of the name) is
 * drawn hollow. Touching a point names it and its wines, with a way to the
 * name's page in the atlas that leads back here; the list of regions beside
 * it says the same in words.
 */
export function CellarMap({
  places,
  trail,
}: {
  places: readonly Place[];
  /** Where the atlas page's way back leads: the page this map is on. */
  trail?: { libraryTrail: LibraryTrail };
}) {
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
  const [tag, setTag] = useState<Place | null>(null);
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
  // It opens on the points and goes out as far as their whole sheet.
  const zoom = useZoomPan(
    { h: data?.height ?? 1, w: data?.width ?? 1, x: 0, y: 0 },
    { h: size, w: size, x: centre[0] - size / 2, y: centre[1] - size / 2 },
  );
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
        <svg aria-label={t("stats.cellarMap.label")} key={sheet.id} {...zoom.svgProps}>
          <rect className="library-map__sea" height={data.height} width={data.width} />
          {Object.entries(data.countries).map(([code, path]) => (
            <path
              className={
                countries.has(code) ? "library-map__country is-held" : "library-map__country"
              }
              d={path}
              key={code}
              strokeWidth={zoom.view.w / 400}
            />
          ))}
          {points
            .toSorted((left, right) => right.place.count - left.place.count)
            .map(({ place, xy }, index) => {
              const label = t("stats.cellarMap.point", {
                count: place.count,
                name: place.key,
                wines: new Intl.NumberFormat(i18n.language).format(place.count),
              });
              return (
                <g
                  aria-label={label}
                  className={tag === place ? "cellar-map__spot is-tagged" : "cellar-map__spot"}
                  key={place.regionId}
                  onClick={() => setTag(place)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setTag(place);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <title>{label}</title>
                  <circle
                    className={
                      ["area", "place"].includes(place.pointSource)
                        ? "cellar-map__point is-approximate"
                        : "cellar-map__point"
                    }
                    cx={xy[0]}
                    cy={xy[1]}
                    r={(zoom.view.w / 70) * (0.7 + Math.sqrt(place.count / largest))}
                    strokeWidth={zoom.view.w / 160}
                    style={{ "--motion-index": Math.min(index, 12) } as CSSProperties}
                  />
                </g>
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
        {tag === null ? null : (
          <div
            className="map-tag"
            role="status"
            style={{
              insetInlineStart: `${((project(tag)[0] - zoom.view.x) / zoom.view.w) * 100}%`,
              insetBlockStart: `${((project(tag)[1] - zoom.view.y) / zoom.view.h) * 100}%`,
            }}
          >
            <strong>{tag.key}</strong>
            <span>
              {t("stats.cellarMap.wines", {
                count: tag.count,
                wines: new Intl.NumberFormat(i18n.language).format(tag.count),
              })}
            </span>
            <Link className="text-link" state={trail} to={`/library/regions/${tag.regionId}`}>
              {t("map.open")}
            </Link>
            <button aria-label={t("map.closeTag")} onClick={() => setTag(null)} type="button">
              ×
            </button>
          </div>
        )}
      </div>
      <figcaption className="section-help">{t("stats.cellarMap.caption")}</figcaption>
    </figure>
  );
}
