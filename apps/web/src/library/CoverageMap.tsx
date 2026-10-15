import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";

import { mapSheets, type SheetId } from "./map-sheets";

/**
 * The atlas on a map: each country shaded by how many registered names the
 * library holds for it, on one sheet at a time. Touching a country brings its
 * figures into view. The table below says the same in words, for screen
 * readers and keyboards; the map is its picture.
 */
export function CoverageMap({
  countries,
  onSelect,
}: {
  countries: { countryCode: string; names: number }[];
  onSelect: (countryCode: string) => void;
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
  const sheet =
    held.find((candidate) => candidate.id === chosen) ??
    [...held].sort((left, right) => right.total - left.total)[0];
  if (sheet === undefined) return null;
  const largest = Math.max(1, ...countries.map((country) => country.names));
  const regionNames = new Intl.DisplayNames([i18n.language], { type: "region" });
  const stroke = Math.max(sheet.data.width, sheet.data.height) / 520;
  return (
    <figure className="library-map coverage-map">
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
      <svg
        aria-label={t("library.coverage.mapLabel")}
        key={sheet.id}
        role="img"
        viewBox={`0 0 ${sheet.data.width} ${sheet.data.height}`}
      >
        <rect className="library-map__sea" height={sheet.data.height} width={sheet.data.width} />
        {Object.entries(sheet.data.countries).map(([code, path], index) => {
          const count = names.get(code) ?? 0;
          return count === 0 ? (
            <path className="library-map__country" d={path} key={code} strokeWidth={stroke} />
          ) : (
            <path
              className="library-map__country coverage-map__held"
              d={path}
              key={code}
              onClick={() => onSelect(code)}
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
      </svg>
    </figure>
  );
}
