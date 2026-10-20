import type { LibraryAtlasCoverageResponse } from "@vadevi/contracts";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { type CSSProperties, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { CountUp } from "../motion/CountUp";
import { useArrival } from "../motion/useArrival";
import { getLibraryAtlasCoverage, listLibraryRegions } from "../services/library";
import { type CoveragePoint, CoverageMap } from "./CoverageMap";
import { flagOf } from "./flag";
import { trailFrom } from "./trail";

type Coverage = LibraryAtlasCoverageResponse["data"];
type Country = Coverage["countries"][number];

/** On the map: every point, exact or approximate. */
const placed = (country: Country) => country.names - country.points.none;

/** A country's figures as bars of its names, growing as they come into view. */
function Measures({ items }: { items: { label: string; of: number; value: number }[] }) {
  const { i18n } = useTranslation();
  const arrival = useArrival<HTMLUListElement>();
  const percent = new Intl.NumberFormat(i18n.language, { style: "percent" });
  return (
    <ul className="stats-bars" {...arrival.props}>
      {items.map(({ label, of, value }, index) => {
        const share = of === 0 ? 0 : value / of;
        return (
          <li key={label} style={{ "--motion-index": index } as CSSProperties}>
            <span className="stats-bars__label">{label}</span>
            <span aria-hidden="true" className="stats-bars__track">
              <span style={{ inlineSize: `${share * 100}%` }} />
            </span>
            <span className="stats-bars__count">
              <CountUp
                format={(whole) => percent.format(whole / 100)}
                play={arrival.arrived}
                value={Math.round(share * 100)}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The atlas in figures: for each country, how many registered names the
 * library holds, how many it describes in the reader's language, how many are
 * on the map and how many name their grapes — the library saying what it
 * knows, and what it does not yet. A shelf of the library's page.
 */
export function LibraryAtlas() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const locale = resolveSupportedLocale(i18n.language);
  const [state, setState] = useState<{ coverage: Coverage | null; key: string } | null>(null);
  const key = `${locale}:${user?.uid ?? ""}`;
  useEffect(() => {
    if (user === null) return;
    const controller = new AbortController();
    getLibraryAtlasCoverage(user, locale, controller.signal)
      .then((coverage) => setState({ coverage, key }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ coverage: null, key });
      });
    return () => controller.abort();
  }, [key, locale, user]);
  const current = state?.key === key ? state : null;
  // A country chosen on the map: its figures alone, and its names as points.
  const [selected, setSelected] = useState<string | null>(null);
  const [points, setPoints] = useState<{ code: string; points: CoveragePoint[] } | null>(null);
  useEffect(() => {
    if (user === null || selected === null) return;
    const controller = new AbortController();
    listLibraryRegions(user, selected, controller.signal)
      .then((regions) =>
        setPoints({
          code: selected,
          points: regions.flatMap((region) =>
            region.point == null
              ? []
              : [
                  {
                    approximate: region.point.approximate,
                    giType: region.giType,
                    id: region.id,
                    latitude: region.point.latitude,
                    longitude: region.point.longitude,
                    name: region.name,
                  },
                ],
          ),
        }),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [selected, user]);
  const names = new Intl.DisplayNames([i18n.language], { type: "region" });
  const number = new Intl.NumberFormat(i18n.language);
  const countries = current?.coverage?.countries ?? [];
  const total = (pick: (country: Country) => number) =>
    countries.reduce((sum, country) => sum + pick(country), 0);
  const all = total((country) => country.names);

  return (
    <>
      <p className="section-help">{t("library.coverage.intro")}</p>
      {current === null ? (
        <p role="status">{t("library.loading")}</p>
      ) : current.coverage === null ? (
        <p role="alert">{t("library.error")}</p>
      ) : (
        <>
          <Measures
            items={[
              {
                label: t("library.coverage.described"),
                of: all,
                value: total((country) => country.described),
              },
              { label: t("library.coverage.onMap"), of: all, value: total(placed) },
              {
                label: t("library.coverage.grapes"),
                of: all,
                value: total((country) => country.withGrapes),
              },
            ]}
          />
          <p className="section-help">
            {t("library.coverage.total", {
              count: all,
              countries: number.format(countries.length),
              names: number.format(all),
            })}
          </p>
          <CoverageMap
            countries={countries}
            onSelect={setSelected}
            points={selected !== null && points?.code === selected ? points.points : []}
            selected={selected}
            trail={trailFrom(t("library.coverage.title"), "/library?tab=atlas")}
          />
          {selected === null ? null : (
            <p className="atlas-coverage__meta">
              <button className="text-button" onClick={() => setSelected(null)} type="button">
                ← {t("library.coverage.allCountries")}
              </button>
            </p>
          )}
          {countries
            .filter((country) => selected === null || country.countryCode === selected)
            .map((country) => (
              <article
                className="atlas-coverage__country"
                id={`coverage-${country.countryCode}`}
                key={country.countryCode}
              >
                <h2>
                  {flagOf(country.countryCode)}{" "}
                  {names.of(country.countryCode) ?? country.countryCode}
                </h2>
                <p className="atlas-coverage__meta">
                  {t("library.coverage.names", {
                    count: country.names,
                    names: number.format(country.names),
                  })}{" "}
                  ·{" "}
                  <Link
                    className="text-link"
                    to={`/library?tab=regions&country=${country.countryCode}`}
                  >
                    {t("library.coverage.seeList")}
                  </Link>
                </p>
                <Measures
                  items={[
                    {
                      label: t("library.coverage.described"),
                      of: country.names,
                      value: country.described,
                    },
                    {
                      label: t("library.coverage.onMap"),
                      of: country.names,
                      value: placed(country),
                    },
                    {
                      label: t("library.coverage.grapes"),
                      of: country.names,
                      value: country.withGrapes,
                    },
                  ]}
                />
                {country.points.area + country.points.place > 0 ? (
                  <p className="section-help">
                    {t("library.coverage.approximate", {
                      count: country.points.area + country.points.place,
                      names: number.format(country.points.area + country.points.place),
                    })}
                  </p>
                ) : null}
              </article>
            ))}
        </>
      )}
    </>
  );
}
