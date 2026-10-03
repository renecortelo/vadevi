import type { LibrarySearchResponse, LibraryTopic } from "@vadevi/contracts";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { GrapesIcon } from "../brand/NavIcons";
import { flagOf } from "../library/flag";
import { listLibraryGrapes, listLibraryRegions, listLibraryTopics } from "../services/library";

type Tab = "grapes" | "regions" | "topics";
const tabs: Tab[] = ["grapes", "regions", "topics"];

/** The countries the atlas has registered names for. */
const atlasCountries = [
  "AT",
  "BE",
  "BG",
  "CY",
  "CZ",
  "DE",
  "DK",
  "ES",
  "FR",
  "GR",
  "HR",
  "HU",
  "IT",
  "LU",
  "MT",
  "NL",
  "PT",
  "RO",
  "SI",
  "SK",
];

/** Where a reader of each language most likely starts looking. */
const homeCountry: Record<string, string> = {
  ca: "ES",
  de: "DE",
  en: "ES",
  es: "ES",
  fr: "FR",
  it: "IT",
  nl: "NL",
  "pt-PT": "PT",
};

const topicCategories: LibraryTopic["category"][] = ["kind", "farming", "method", "concept"];

/** Accents and case set aside, so "garnaxa" finds "Garnatxa" and "rose" "Rosé". */
function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase();
}

/**
 * The wine library, browsed: the grapes as a gallery, the EU's registered
 * wine names country by country, and the styles and methods explained — all
 * read from the library itself, with no model involved. The tab and the
 * filters live in the address, so going back to the list keeps one's place.
 */
export function LibraryPage() {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const [search, setSearch] = useSearchParams();
  const tab: Tab = tabs.includes(search.get("tab") as Tab) ? (search.get("tab") as Tab) : "grapes";
  const query = search.get("q") ?? "";

  const update = (changes: Record<string, string | null>) =>
    setSearch(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );

  return (
    <section className="library-page">
      <header className="page-heading">
        <div>
          <h1>{t("library.home.title")}</h1>
          <p>{t("library.home.intro")}</p>
        </div>
      </header>

      <div
        aria-label={t("library.home.title")}
        className="segmented-control library-tabs"
        role="group"
      >
        {tabs.map((option) => (
          <button
            aria-pressed={tab === option}
            key={option}
            onClick={() => update({ q: null, tab: option })}
            type="button"
          >
            {t(`library.home.tab.${option}`)}
          </button>
        ))}
      </div>

      <div className="library-filters">
        <label className="library-filters__search">
          <span>{t("library.home.search")}</span>
          <input
            onChange={(event) => update({ q: event.target.value })}
            placeholder={t(`library.home.searchPlaceholder.${tab}`)}
            type="search"
            value={query}
          />
        </label>
        {tab === "grapes" ? (
          <GrapeFilters locale={locale} search={search} update={update} />
        ) : tab === "regions" ? (
          <RegionFilters locale={locale} search={search} update={update} />
        ) : null}
      </div>

      {tab === "grapes" ? (
        <GrapeGallery locale={locale} query={query} search={search} />
      ) : tab === "regions" ? (
        <RegionList
          country={search.get("country") ?? homeCountry[locale] ?? "ES"}
          query={query}
          search={search}
        />
      ) : (
        <TopicList locale={locale} query={query} />
      )}
    </section>
  );
}

type FilterProps = {
  locale: string;
  search: URLSearchParams;
  update: (changes: Record<string, string | null>) => void;
};

function GrapeFilters({ search, update }: FilterProps) {
  const { t } = useTranslation();
  return (
    <label>
      <span>{t("library.home.colorFilter")}</span>
      <select
        onChange={(event) => update({ color: event.target.value })}
        value={search.get("color") ?? ""}
      >
        <option value="">{t("library.home.any")}</option>
        {(["red", "white", "pink"] as const).map((color) => (
          <option key={color} value={color}>
            {t(`library.color.${color}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function RegionFilters({ locale, search, update }: FilterProps) {
  const { i18n, t } = useTranslation();
  const names = new Intl.DisplayNames([i18n.language], { type: "region" });
  const countries = atlasCountries
    .map((code) => ({ code, name: names.of(code) ?? code }))
    .sort((left, right) => left.name.localeCompare(right.name, i18n.language));
  return (
    <>
      <label>
        <span>{t("library.home.countryFilter")}</span>
        <select
          onChange={(event) => update({ country: event.target.value })}
          value={search.get("country") ?? homeCountry[locale] ?? "ES"}
        >
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {flagOf(country.code)} {country.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t("library.home.typeFilter")}</span>
        <select
          onChange={(event) => update({ type: event.target.value })}
          value={search.get("type") ?? ""}
        >
          <option value="">{t("library.home.any")}</option>
          <option value="PDO">{t("library.pdo")}</option>
          <option value="PGI">{t("library.pgi")}</option>
        </select>
      </label>
    </>
  );
}

/** Loads a list once per key, and says when it is loading or failed. */
function useList<T>(key: string, load: (signal: AbortSignal) => Promise<T[]>) {
  const [state, setState] = useState<{ items: T[]; key: string; status: "error" | "ready" } | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((items) => setState({ items, key, status: "ready" }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ items: [], key, status: "error" });
      });
    return () => controller.abort();
    // `load` is rebuilt every render; the key says when the list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state : null;
}

function Status({ state }: { state: { status: "error" | "ready" } | null }) {
  const { t } = useTranslation();
  if (state === null) return <p role="status">{t("library.loading")}</p>;
  if (state.status === "error") return <p role="alert">{t("library.error")}</p>;
  return null;
}

function GrapeGallery({
  locale,
  query,
  search,
}: {
  locale: string;
  query: string;
  search: URLSearchParams;
}) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const state = useList<LibrarySearchResponse["data"][number]>(
    `grapes:${locale}:${user?.uid ?? ""}`,
    (signal) =>
      user === null
        ? Promise.resolve([])
        : listLibraryGrapes(user, resolveSupportedLocale(locale), signal),
  );
  const color = search.get("color") ?? "";
  const names = new Intl.DisplayNames([i18n.language], { type: "region" });
  const shown = useMemo(
    () =>
      (state?.items ?? []).filter(
        (grape) =>
          (color === "" || grape.color === color) &&
          (query === "" || fold(grape.name).includes(fold(query))),
      ),
    [color, query, state],
  );
  if (state === null || state.status === "error") return <Status state={state} />;
  return (
    <>
      <p className="section-help">{t("library.home.count", { count: shown.length })}</p>
      <ul className="library-gallery">
        {shown.map((grape) => (
          <li key={grape.id}>
            <Link to={`/library/grapes/${grape.id}`}>
              {grape.imagePath === null ? (
                <span aria-hidden="true" className="library-gallery__placeholder">
                  <GrapesIcon />
                </span>
              ) : (
                <img alt="" decoding="async" loading="lazy" src={`/${grape.imagePath}`} />
              )}
              <strong>{grape.name}</strong>
              <span>
                {[
                  grape.originCountryCode === null
                    ? null
                    : `${flagOf(grape.originCountryCode)} ${names.of(grape.originCountryCode) ?? grape.originCountryCode}`,
                  grape.color === null ? null : t(`library.color.${grape.color}`),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <p>{t("library.home.none")}</p> : null}
    </>
  );
}

function RegionList({
  country,
  query,
  search,
}: {
  country: string;
  query: string;
  search: URLSearchParams;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const state = useList(`regions:${country}:${user?.uid ?? ""}`, (signal) =>
    user === null ? Promise.resolve([]) : listLibraryRegions(user, country, signal),
  );
  const type = search.get("type") ?? "";
  const shown = useMemo(
    () =>
      (state?.items ?? []).filter(
        (region) =>
          (type === "" || region.giType === type) &&
          (query === "" || fold(region.name).includes(fold(query))),
      ),
    [query, state, type],
  );
  if (state === null || state.status === "error") return <Status state={state} />;
  return (
    <>
      <p className="section-help">{t("library.home.count", { count: shown.length })}</p>
      <ul className="library-rows">
        {shown.map((region) => (
          <li key={region.id}>
            <Link to={`/library/regions/${region.id}`}>
              <span aria-hidden="true">{flagOf(region.countryCode)}</span>
              <strong>{region.name}</strong>
              <span className="library-rows__type">
                {region.giType === "PDO" ? t("library.pdoShort") : t("library.pgiShort")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 ? <p>{t("library.home.none")}</p> : null}
    </>
  );
}

function TopicList({ locale, query }: { locale: string; query: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const state = useList<LibraryTopic>(`topics:${locale}:${user?.uid ?? ""}`, (signal) =>
    user === null
      ? Promise.resolve([])
      : listLibraryTopics(user, resolveSupportedLocale(locale), signal),
  );
  const shown = useMemo(
    () =>
      (state?.items ?? []).filter(
        (topic) =>
          query === "" ||
          [topic.name, ...topic.otherNames, topic.summary?.text ?? ""].some((text) =>
            fold(text).includes(fold(query)),
          ),
      ),
    [query, state],
  );
  if (state === null || state.status === "error") return <Status state={state} />;
  return (
    <>
      {topicCategories.map((category) => {
        const inCategory = shown.filter((topic) => topic.category === category);
        if (inCategory.length === 0) return null;
        return (
          <section aria-labelledby={`topics-${category}`} className="library-topics" key={category}>
            <h2 id={`topics-${category}`}>{t(`library.topicCategory.${category}`)}</h2>
            <ul>
              {inCategory.map((topic) => (
                <li className="settings-card" key={topic.id}>
                  <h3>
                    <Link className="text-link" to={`/library/topics/${topic.id}`}>
                      {topic.name}
                    </Link>
                  </h3>
                  {topic.summary === null ? null : (
                    <p
                      className="library-topics__excerpt"
                      lang={topic.summary.locale === "pt-PT" ? "pt" : topic.summary.locale}
                    >
                      {topic.summary.text}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {shown.length === 0 ? <p>{t("library.home.none")}</p> : null}
    </>
  );
}
