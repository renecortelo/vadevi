import type { LibraryAtlasCoverageResponse } from "@vadevi/contracts";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { flagOf } from "../library/flag";
import { getLibraryAtlasCoverage } from "../services/library";

type Coverage = LibraryAtlasCoverageResponse["data"];
type Country = Coverage["countries"][number];

/** On the map: every point, exact or approximate. */
const placed = (country: Country) => country.names - country.points.none;

/** One figure as a bar of its country's names, with the count beside it. */
function Measure({ label, of, value }: { label: string; of: number; value: number }) {
  const { i18n } = useTranslation();
  const share = of === 0 ? 0 : value / of;
  return (
    <li>
      <span className="stats-bars__label">{label}</span>
      <span aria-hidden="true" className="stats-bars__track">
        <span style={{ inlineSize: `${share * 100}%` }} />
      </span>
      <span className="stats-bars__count">
        {new Intl.NumberFormat(i18n.language, { style: "percent" }).format(share)}
      </span>
    </li>
  );
}

/**
 * The atlas in figures: for each country, how many registered names the
 * library holds, how many it describes in the reader's language, how many are
 * on the map and how many name their grapes — the library saying what it
 * knows, and what it does not yet.
 */
export function LibraryAtlasPage() {
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
  const names = new Intl.DisplayNames([i18n.language], { type: "region" });
  const number = new Intl.NumberFormat(i18n.language);
  const countries = current?.coverage?.countries ?? [];
  const total = (pick: (country: Country) => number) =>
    countries.reduce((sum, country) => sum + pick(country), 0);
  const all = total((country) => country.names);

  return (
    <section className="library-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("library.atlasEyebrow")}</p>
          <h1>{t("library.coverage.title")}</h1>
          <p>{t("library.coverage.intro")}</p>
        </div>
      </header>
      {current === null ? (
        <p role="status">{t("library.loading")}</p>
      ) : current.coverage === null ? (
        <p role="alert">{t("library.error")}</p>
      ) : (
        <>
          <ul className="stats-bars atlas-coverage">
            <Measure
              label={t("library.coverage.described")}
              of={all}
              value={total((country) => country.described)}
            />
            <Measure label={t("library.coverage.onMap")} of={all} value={total(placed)} />
            <Measure
              label={t("library.coverage.grapes")}
              of={all}
              value={total((country) => country.withGrapes)}
            />
          </ul>
          <p className="section-help">
            {t("library.coverage.total", {
              count: all,
              countries: number.format(countries.length),
              names: number.format(all),
            })}
          </p>
          {countries.map((country) => (
            <article className="atlas-coverage__country" key={country.countryCode}>
              <h2>
                <Link
                  className="text-link"
                  to={`/library?tab=regions&country=${country.countryCode}`}
                >
                  {flagOf(country.countryCode)}{" "}
                  {names.of(country.countryCode) ?? country.countryCode}
                </Link>{" "}
                <span className="section-help">
                  {t("library.coverage.names", {
                    count: country.names,
                    names: number.format(country.names),
                  })}
                </span>
              </h2>
              <ul className="stats-bars atlas-coverage">
                <Measure
                  label={t("library.coverage.described")}
                  of={country.names}
                  value={country.described}
                />
                <Measure
                  label={t("library.coverage.onMap")}
                  of={country.names}
                  value={placed(country)}
                />
                <Measure
                  label={t("library.coverage.grapes")}
                  of={country.names}
                  value={country.withGrapes}
                />
              </ul>
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
    </section>
  );
}
