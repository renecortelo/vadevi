import type { RegionDesignation } from "@vadevi/contracts";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { designationKey } from "./designation";
import { MapControls } from "./MapControls";
import { mapSheets, type SheetId } from "./map-sheets";
import { useZoomPan } from "./useZoomPan";

export type CoveragePoint = Readonly<{
  approximate: boolean;
  giType: RegionDesignation;
  id: string;
  latitude: number;
  longitude: number;
  name: string;
}>;

/**
 * The atlas on a map: each country shaded by how many registered names the
 * library holds for it, on one sheet at a time, which comes closer and moves.
 * Touching a country chooses it — the page shows its figures — and frames
 * it, with a point for each of its names; touching a point names it, with
 * its kind and the way to its page. The figures below say the same in words,
 * for screen readers and keyboards; the map is their picture.
 */
export function CoverageMap({
  countries,
  onSelect,
  points,
  selected,
}: {
  countries: { countryCode: string; names: number }[];
  onSelect: (countryCode: string | null) => void;
  points: readonly CoveragePoint[];
  selected: string | null;
}) {
  const { i18n, t } = useTranslation();
  const names = new Map(countries.map((country) => [country.countryCode, country.names]));
  // The sheets that hold a country of the atlas, the one with most names first.
  const held = mapSheets
    .map((sheet) => ({
      ...sheet,
      total: Object.keys(sheet.data.countries).reduce(
        (sum, code) => sum + (names.get(code) ?? 0),
        0,
      ),
    }))
    .filter((sheet) => sheet.total > 0);
  const [chosen, setChosen] = useState<SheetId | null>(null);
  const [tag, setTag] = useState<CoveragePoint | null>(null);
  const sheet =
    held.find((candidate) => candidate.id === chosen) ??
    held.find((candidate) => selected !== null && candidate.data.boxes[selected] !== undefined) ??
    [...held].sort((left, right) => right.total - left.total)[0];
  const data = sheet?.data;
  const zoom = useZoomPan({ h: data?.height ?? 1, w: data?.width ?? 1, x: 0, y: 0 });
  if (sheet === undefined || data === undefined) return null;
  const largest = Math.max(1, ...countries.map((country) => country.names));
  const regionNames = new Intl.DisplayNames([i18n.language], { type: "region" });
  // Lines and points keep their size on the screen however close the map is.
  const stroke = Math.max(data.width, data.height) / 520 / zoom.scale;
  const radius = Math.max(data.width, data.height) / 260 / Math.sqrt(zoom.scale);
  const project = (point: CoveragePoint) =>
    [
      (point.longitude - data.frame.lonMin) * data.squeeze * data.scale,
      (data.frame.latMax - point.latitude) * data.scale,
    ] as const;
  const choose = (code: string) => {
    setTag(null);
    if (code === selected) {
      onSelect(null);
      zoom.reset();
      return;
    }
    onSelect(code);
    const box = data.boxes[code];
    if (box !== undefined)
      zoom.zoomTo({ h: box[3] - box[1], w: box[2] - box[0], x: box[0], y: box[1] });
  };
  const tagAt = tag === null ? null : project(tag);
  return (
    <figure className="library-map coverage-map">
      {held.length < 2 ? null : (
        <div aria-label={t("library.coverage.sheets")} className="segmented-control" role="group">
          {held.map((candidate) => (
            <button
              aria-pressed={candidate.id === sheet.id}
              key={candidate.id}
              onClick={() => {
                setChosen(candidate.id);
                setTag(null);
                onSelect(null);
              }}
              type="button"
            >
              {t(`library.coverage.sheet.${candidate.id}`)}
            </button>
          ))}
        </div>
      )}
      <div className="map-frame">
        <svg
          aria-label={t("library.coverage.mapLabel")}
          key={sheet.id}
          role="img"
          {...zoom.svgProps}
        >
          <rect className="library-map__sea" height={data.height} width={data.width} />
          {Object.entries(data.countries).map(([code, path], index) => {
            const count = names.get(code) ?? 0;
            return count === 0 ? (
              <path className="library-map__country" d={path} key={code} strokeWidth={stroke} />
            ) : (
              <path
                className={`library-map__country coverage-map__held${code === selected ? " is-selected" : ""}`}
                d={path}
                key={code}
                onClick={() => choose(code)}
                strokeWidth={stroke}
                style={
                  {
                    "--motion-index": index % 12,
                    // Darker with more names; the square root keeps the small
                    // registers visible beside Italy's and France's hundreds.
                    "--share": `${Math.round(25 + 75 * Math.sqrt(count / largest))}%`,
                  } as CSSProperties
                }
              >
                <title>
                  {`${regionNames.of(code) ?? code}: ${t("library.coverage.names", {
                    count,
                    names: new Intl.NumberFormat(i18n.language).format(count),
                  })}`}
                </title>
              </path>
            );
          })}
          {points.map((point) => {
            const [x, y] = project(point);
            return (
              <circle
                className={`coverage-map__point${point.approximate ? " is-approximate" : ""}${tag?.id === point.id ? " is-tagged" : ""}`}
                cx={x}
                cy={y}
                key={point.id}
                onClick={() => setTag(point)}
                r={radius}
                strokeWidth={stroke * 1.5}
              >
                <title>{point.name}</title>
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
          zoomed={zoom.zoomed}
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
            <strong>{tag.name}</strong>
            <span>{t(designationKey(tag.giType))}</span>
            <Link className="text-link" to={`/library/regions/${tag.id}`}>
              {t("map.open")}
            </Link>
            <button aria-label={t("map.closeTag")} onClick={() => setTag(null)} type="button">
              ×
            </button>
          </div>
        )}
      </div>
    </figure>
  );
}
