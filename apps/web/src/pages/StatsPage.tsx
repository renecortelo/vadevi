import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type CurrencyCode, fromMinorUnits, type WineStats } from "@vadevi/contracts";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { CountryIcon, GrapeVarietyIcon, RegionIcon, WineTypeIcon } from "../brand/NavIcons";
import { trailFrom } from "../library/trail";
import { useSession } from "../session/SessionContext";
import { getStats, type StatsPeriod } from "../services/stats";

/** The name the server gives every personal Space when it is created. */
const defaultPersonalName = "Personal space";

const periods = ["all", "year", "twelveMonths"] as const;
type Period = (typeof periods)[number];

/** What the counts can be narrowed to, each a query parameter of its own. */
const facets = ["type", "country", "region", "grape"] as const;
type Facet = (typeof facets)[number];

function periodRange(period: Period, today = new Date()): StatsPeriod {
  if (period === "year") return { from: `${today.getFullYear()}-01-01` };
  if (period === "twelveMonths") {
    const from = new Date(today);
    from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString().slice(0, 10) };
  }
  return {};
}

/** A list of counts as bars, each against the largest; a label may narrow to it. */
function Bars({
  items,
}: {
  items: { count: number; label: string; onSelect?: (() => void) | undefined }[];
}) {
  const largest = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="stats-bars">
      {items.map((item) => (
        <li key={item.label}>
          {item.onSelect === undefined ? (
            <span className="stats-bars__label">{item.label}</span>
          ) : (
            <button className="stats-bars__label" onClick={item.onSelect} type="button">
              {item.label}
            </button>
          )}
          <span aria-hidden="true" className="stats-bars__track">
            <span style={{ inlineSize: `${(item.count / largest) * 100}%` }} />
          </span>
          <span className="stats-bars__count">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

/** Yes, unsure and no as one bar split three ways, with its own key. */
function SplitBar({
  label,
  parts,
}: {
  label: string;
  parts: { count: number; key: "no" | "unsure" | "yes"; label: string }[];
}) {
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  return (
    <figure className="stats-split">
      <figcaption>{label}</figcaption>
      {total === 0 ? (
        <p className="section-help">—</p>
      ) : (
        <>
          <div aria-hidden="true" className="stats-split__bar">
            {parts.map((part) =>
              part.count === 0 ? null : (
                <span
                  data-answer={part.key}
                  key={part.key}
                  style={{ inlineSize: `${(part.count / total) * 100}%` }}
                />
              ),
            )}
          </div>
          <ul className="stats-split__key">
            {parts.map((part) => (
              <li data-answer={part.key} key={part.key}>
                {part.label} <strong>{part.count}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </figure>
  );
}

/** One value against its scale: "12 of 40", "3.8 of 5". */
function Meter({
  label,
  max,
  shown,
  value,
}: {
  label: string;
  max: number;
  shown: string;
  value: number;
}) {
  return (
    <figure className="stats-split">
      <figcaption>{label}</figcaption>
      <div aria-hidden="true" className="stats-split__bar">
        <span
          data-answer="yes"
          style={{ inlineSize: `${max === 0 ? 0 : Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
      <p className="stats-split__value">{shown}</p>
    </figure>
  );
}

/** A breakdown's heading: its icon and name on a band of their own. */
function GroupTitle({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <h3 className="stats-group__title">
      {icon}
      <span>{children}</span>
    </h3>
  );
}

/**
 * The reader's cellar book: what they have tasted, bought and kept — their
 * own across every Space, or everyone's in one Space, narrowed to a type, a
 * country, a region or a grape — counted from the records and nothing else.
 * The view lives in the address, so a wine opened from here comes back to it.
 */
export function StatsPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap, updateProfile } = useSession();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const scope = search.get("space") ?? "personal";
  const periodParameter = search.get("period");
  const period: Period = periods.includes(periodParameter as Period)
    ? (periodParameter as Period)
    : "all";
  const narrowed = Object.fromEntries(
    facets.flatMap((facet) => {
      const value = search.get(facet);
      return value === null || value === "" ? [] : [[facet, value]];
    }),
  ) as Partial<Record<Facet, string>>;
  const spaceId = scope === "personal" ? null : scope;

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    setSearch(next, { replace: true });
  };

  const query = useQuery({
    enabled: user !== null,
    // The last numbers stay on screen while the next ones are counted.
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      getStats(user!, spaceId, { ...periodRange(period), ...narrowed }, signal),
    queryKey: ["stats", spaceId, period, narrowed],
  });
  const stats: WineStats | null = query.data ?? null;

  const money = (amountMinor: number, currency: CurrencyCode) =>
    new Intl.NumberFormat(i18n.language, { currency, style: "currency" }).format(
      fromMinorUnits(amountMinor, currency),
    );
  const number = (value: number) => new Intl.NumberFormat(i18n.language).format(value);
  const countryName = (code: string) =>
    code === "unknown"
      ? t("stats.unknown")
      : (new Intl.DisplayNames([i18n.language], { type: "region" }).of(code) ?? code);
  const typeName = (type: string) =>
    i18n.exists(`quickLog.wineType.${type}`) ? t(`quickLog.wineType.${type}`) : t("stats.unknown");
  const facetLabel = (facet: Facet, value: string) =>
    facet === "type" ? typeName(value) : facet === "country" ? countryName(value) : value;

  // A wine opens in its own Space: one in another is reached by moving there
  // first, and the page it opens shows the way back here.
  const activeSpaceId = bootstrap.data.user.activeSpaceId;
  const backHere = trailFrom(t("stats.title"), `/stats${search.size === 0 ? "" : `?${search}`}`);
  const openWine = async (wine: { spaceId: string; wineId: string }) => {
    if (wine.spaceId !== activeSpaceId) await updateProfile({ activeSpaceId: wine.spaceId });
    void navigate(`/wines/${wine.wineId}/evidence`, { state: backHere });
  };
  const wineLink = (wine: { spaceId: string; wineId: string; wineName: string }) => (
    <Link
      className="text-link"
      onClick={(event) => {
        if (wine.spaceId === activeSpaceId) return;
        event.preventDefault();
        void openWine(wine);
      }}
      state={backHere}
      to={`/wines/${wine.wineId}/evidence`}
    >
      {wine.wineName}
    </Link>
  );
  const spaceName = (space: (typeof bootstrap.data.spaces)[number]) =>
    space.type === "personal" && space.name === defaultPersonalName
      ? t("spaces.type.personal")
      : space.name;
  const answers = (counts: { no: number; unsure: number; yes: number }) =>
    (["yes", "unsure", "no"] as const).map((key) => ({
      count: counts[key],
      key,
      label: t(`stats.answer.${key}`),
    }));
  const anyNarrowing = Object.keys(narrowed).length > 0;
  // A bar narrows the counts to itself, unless they already are.
  const narrowTo = (facet: Facet, value: string) =>
    narrowed[facet] === value || value === "unknown" ? undefined : () => update({ [facet]: value });

  return (
    <section className="library-page stats-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("stats.eyebrow")}</p>
          <h1>{t("stats.title")}</h1>
          <p>{t("stats.intro")}</p>
        </div>
      </header>

      <div className="stats-controls">
        <label className="stats-scope">
          <span>{t("stats.scopeLabel")}</span>
          <select onChange={(event) => update({ space: event.target.value })} value={scope}>
            <option value="personal">{t("stats.scopePersonal")}</option>
            {/* The personal Space first, and as itself: it is only ever the
                reader's, so "everyone's" would say something untrue. */}
            {[...bootstrap.data.spaces]
              .sort(
                (left, right) =>
                  Number(right.type === "personal") - Number(left.type === "personal"),
              )
              .map((space) => (
                <option key={space.id} value={space.id}>
                  {space.type === "personal"
                    ? spaceName(space)
                    : t("stats.scopeSpace", { name: spaceName(space) })}
                </option>
              ))}
          </select>
        </label>
        <div aria-label={t("stats.periodLabel")} className="segmented-control" role="group">
          {periods.map((option) => (
            <button
              aria-pressed={period === option}
              key={option}
              onClick={() => update({ period: option === "all" ? null : option })}
              type="button"
            >
              {t(`stats.period.${option}`)}
            </button>
          ))}
        </div>
      </div>

      {stats === null ? null : (
        <div className="stats-controls stats-filters">
          {facets.map((facet) => {
            const options =
              facet === "type"
                ? stats.facets.types
                : facet === "country"
                  ? stats.facets.countries
                  : facet === "region"
                    ? stats.facets.regions
                    : stats.facets.grapes;
            const current = narrowed[facet] ?? "";
            return (
              <label key={facet}>
                <span>{t(`stats.filter.${facet}`)}</span>
                <select
                  disabled={options.length === 0 && current === ""}
                  onChange={(event) => update({ [facet]: event.target.value })}
                  value={current}
                >
                  <option value="">{t("stats.filter.any")}</option>
                  {/* A narrowing typed into the address still shows as chosen. */}
                  {[...options, ...(current === "" || options.includes(current) ? [] : [current])]
                    .map((value) => ({ label: facetLabel(facet, value), value }))
                    .sort((left, right) => left.label.localeCompare(right.label, i18n.language))
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>
            );
          })}
          {anyNarrowing ? (
            <button
              className="action-link action-link--secondary"
              onClick={() => update({ country: null, grape: null, region: null, type: null })}
              type="button"
            >
              {t("stats.filter.clear")}
            </button>
          ) : null}
        </div>
      )}

      {stats === null ? (
        <p role={query.isError ? "alert" : "status"}>
          {query.isError ? t("stats.error") : t("stats.loading")}
        </p>
      ) : stats.wines.total === 0 && stats.tastings.total === 0 ? (
        <p className="settings-card">
          {anyNarrowing ? t("stats.emptyNarrowed") : t("stats.empty")}
        </p>
      ) : (
        <>
          <dl className="stats-tiles">
            {[
              ["wines", number(stats.wines.total)],
              ["tastings", number(stats.tastings.total)],
              [
                "averageScore",
                stats.tastings.averageScore === null ? "—" : number(stats.tastings.averageScore),
              ],
              ["atOrAbove90", number(stats.tastings.atOrAbove90)],
              ["inCellar", number(stats.cellar.owned)],
              ["wishlist", number(stats.wishlist.active)],
            ].map(([key, value]) => (
              <div key={key}>
                <dt>{t(`stats.tile.${key}`)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {stats.tastings.total === 0 ? null : (
            <section aria-labelledby="stats-scores" className="settings-card">
              <h2 id="stats-scores">{t("stats.scoresTitle")}</h2>
              {stats.tastings.scored === 0 ? null : (
                <Bars
                  items={stats.tastings.scoreBands.map((band) => ({
                    count: band.count,
                    label: t(`stats.band.${band.band}`),
                  }))}
                />
              )}
              <div className="stats-answers">
                <SplitBar label={t("stats.wouldBuy")} parts={answers(stats.tastings.wouldBuy)} />
                <SplitBar
                  label={t("stats.wouldDrinkAgain")}
                  parts={answers(stats.tastings.wouldDrinkAgain)}
                />
                <Meter
                  label={t("stats.memorable")}
                  max={stats.tastings.total}
                  shown={t("stats.ofTastings", {
                    count: stats.tastings.total,
                    value: stats.tastings.memorable,
                  })}
                  value={stats.tastings.memorable}
                />
                {stats.tastings.pairingSuccessAverage === null ? null : (
                  <Meter
                    label={t("stats.pairing")}
                    max={5}
                    shown={t("stats.ofFive", {
                      value: number(stats.tastings.pairingSuccessAverage),
                    })}
                    value={stats.tastings.pairingSuccessAverage}
                  />
                )}
              </div>
              {stats.tastings.topWines.length === 0 ? null : (
                <>
                  <h3>{t("stats.topWines")}</h3>
                  <ol className="stats-list">
                    {stats.tastings.topWines.map((wine) => (
                      <li key={wine.wineId}>
                        <strong>{wine.score}</strong>{" "}
                        {wine.memorable ? (
                          <span
                            aria-label={t("stats.memorableMark")}
                            className="stats-star"
                            role="img"
                            title={t("stats.memorableMark")}
                          >
                            ★
                          </span>
                        ) : null}{" "}
                        {wineLink(wine)}
                        <span className="section-help"> · {wine.producerName}</span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          )}

          <section aria-labelledby="stats-wines" className="settings-card">
            <h2 id="stats-wines">{t("stats.winesTitle")}</h2>
            <p className="section-help">{t("stats.narrowHint")}</p>
            <div className="stats-columns">
              <div className="stats-group">
                <GroupTitle icon={<WineTypeIcon />}>{t("stats.byType")}</GroupTitle>
                <Bars
                  items={stats.wines.byType.map((row) => ({
                    count: row.count,
                    label: typeName(row.key),
                    onSelect: narrowTo("type", row.key),
                  }))}
                />
              </div>
              <div className="stats-group">
                <GroupTitle icon={<CountryIcon />}>{t("stats.byCountry")}</GroupTitle>
                <Bars
                  items={stats.wines.byCountry.map((row) => ({
                    count: row.count,
                    label: countryName(row.key),
                    onSelect: narrowTo("country", row.key),
                  }))}
                />
              </div>
              {stats.wines.byRegion.length === 0 ? null : (
                <div className="stats-group">
                  <GroupTitle icon={<RegionIcon />}>{t("stats.byRegion")}</GroupTitle>
                  <Bars
                    items={stats.wines.byRegion.map((row) => ({
                      count: row.count,
                      label: row.key,
                      onSelect: narrowTo("region", row.key),
                    }))}
                  />
                </div>
              )}
              {stats.wines.byGrape.length === 0 ? null : (
                <div className="stats-group">
                  <GroupTitle icon={<GrapeVarietyIcon />}>{t("stats.byGrape")}</GroupTitle>
                  <Bars
                    items={stats.wines.byGrape.map((row) => ({
                      count: row.count,
                      label: row.key,
                      onSelect: narrowTo("grape", row.key),
                    }))}
                  />
                </div>
              )}
            </div>
          </section>

          {stats.spending.length === 0 ? null : (
            <section aria-labelledby="stats-spending" className="settings-card">
              <h2 id="stats-spending">{t("stats.spendingTitle")}</h2>
              {/* Each currency apart: euros and dollars do not add up. */}
              {stats.spending.map((row) => (
                <div className="library-pairing-group" key={row.currency}>
                  <h3>{money(row.totalMinor, row.currency)}</h3>
                  <p className="section-help">
                    {t("stats.spendingLine", {
                      average:
                        row.averageBottleMinor === null
                          ? "—"
                          : money(row.averageBottleMinor, row.currency),
                      bottles: row.bottles,
                      purchases: row.purchases,
                    })}
                  </p>
                  {row.byYear.length < 2 ? null : (
                    <Bars
                      items={row.byYear.map((year) => ({
                        count: Math.round(fromMinorUnits(year.totalMinor, row.currency)),
                        label: year.year,
                      }))}
                    />
                  )}
                  {row.topMerchants.length === 0 ? null : (
                    <>
                      <h3>{t("stats.merchants")}</h3>
                      <ol className="stats-list">
                        {row.topMerchants.map((merchant) => (
                          <li key={merchant.name}>
                            {merchant.name}
                            <span className="section-help">
                              {" "}
                              · {money(merchant.totalMinor, row.currency)} ·{" "}
                              {t("stats.purchases", { count: merchant.purchases })}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                </div>
              ))}
              {stats.bestValue.length === 0 ? null : (
                <>
                  <h3>{t("stats.bestValue")}</h3>
                  <ol className="stats-list">
                    {stats.bestValue.map((wine) => (
                      <li key={`${wine.wineId}-${wine.currency}`}>
                        {wineLink(wine)}
                        <span className="section-help">
                          {" "}
                          · {wine.score} · {money(wine.unitAmountMinor, wine.currency)}
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="section-help">{t("stats.bestValueNote")}</p>
                </>
              )}
            </section>
          )}

          <section aria-labelledby="stats-cellar" className="settings-card">
            <h2 id="stats-cellar">{t("stats.cellarTitle")}</h2>
            <dl className="stats-tiles stats-tiles--small">
              {(["owned", "opened", "finished", "gifted"] as const).map((state) => (
                <div key={state}>
                  <dt>{t(`stats.cellar.${state}`)}</dt>
                  <dd>{number(stats.cellar[state])}</dd>
                </div>
              ))}
            </dl>
            {stats.cellar.averageDaysToOpen === null ? null : (
              <p className="section-help">
                {t("stats.daysToOpen", { count: stats.cellar.averageDaysToOpen })}
              </p>
            )}
          </section>

          {stats.tastings.byMonth.length < 2 ? null : (
            <section aria-labelledby="stats-months" className="settings-card">
              <h2 id="stats-months">{t("stats.monthsTitle")}</h2>
              <Bars
                items={stats.tastings.byMonth.map((row) => ({
                  count: row.count,
                  label: new Intl.DateTimeFormat(i18n.language, {
                    month: "short",
                    year: "2-digit",
                  }).format(new Date(`${row.month}-15T12:00:00Z`)),
                }))}
              />
            </section>
          )}
        </>
      )}

      <p className="section-help">
        <Link className="text-link" to="/vicenc">
          {t("stats.askVicenc")}
        </Link>
      </p>
    </section>
  );
}
