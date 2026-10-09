import { useQuery } from "@tanstack/react-query";
import { type CurrencyCode, fromMinorUnits, type WineStats } from "@vadevi/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { useSession } from "../session/SessionContext";
import { getStats, type StatsPeriod } from "../services/stats";

/** The name the server gives every personal Space when it is created. */
const defaultPersonalName = "Personal space";

const periods = ["all", "year", "twelveMonths"] as const;
type Period = (typeof periods)[number];

function periodRange(period: Period, today = new Date()): StatsPeriod {
  if (period === "year") return { from: `${today.getFullYear()}-01-01` };
  if (period === "twelveMonths") {
    const from = new Date(today);
    from.setFullYear(from.getFullYear() - 1);
    return { from: from.toISOString().slice(0, 10) };
  }
  return {};
}

/** A list of counts as bars, each against the largest. */
function Bars({ items }: { items: { count: number; label: string }[] }) {
  const largest = Math.max(1, ...items.map((item) => item.count));
  return (
    <ul className="stats-bars">
      {items.map((item) => (
        <li key={item.label}>
          <span className="stats-bars__label">{item.label}</span>
          <span aria-hidden="true" className="stats-bars__track">
            <span style={{ inlineSize: `${(item.count / largest) * 100}%` }} />
          </span>
          <span className="stats-bars__count">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The reader's numbers: what they have tasted, bought and kept — their own
 * across every Space, or everyone's in one Space — counted from the records
 * and nothing else.
 */
export function StatsPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const [scope, setScope] = useState<string>("personal");
  const [period, setPeriod] = useState<Period>("all");
  const spaceId = scope === "personal" ? null : scope;

  const query = useQuery({
    enabled: user !== null,
    queryFn: ({ signal }) => getStats(user!, spaceId, periodRange(period), signal),
    queryKey: ["stats", spaceId, period],
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
  const activeSpaceId = bootstrap.data.user.activeSpaceId;
  const wineLink = (wine: { spaceId: string; wineId: string; wineName: string }) =>
    // A wine opens where it lives: only the active Space's wines are reachable.
    wine.spaceId === activeSpaceId ? (
      <Link className="text-link" to={`/wines/${wine.wineId}/evidence`}>
        {wine.wineName}
      </Link>
    ) : (
      wine.wineName
    );

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
        <label>
          <span>{t("stats.scopeLabel")}</span>
          <select onChange={(event) => setScope(event.target.value)} value={scope}>
            <option value="personal">{t("stats.scopePersonal")}</option>
            {bootstrap.data.spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {t("stats.scopeSpace", {
                  name:
                    space.type === "personal" && space.name === defaultPersonalName
                      ? t("spaces.type.personal")
                      : space.name,
                })}
              </option>
            ))}
          </select>
        </label>
        <div aria-label={t("stats.periodLabel")} className="segmented-control" role="group">
          {periods.map((option) => (
            <button
              aria-pressed={period === option}
              key={option}
              onClick={() => setPeriod(option)}
              type="button"
            >
              {t(`stats.period.${option}`)}
            </button>
          ))}
        </div>
      </div>

      {stats === null ? (
        <p role={query.isError ? "alert" : "status"}>
          {query.isError ? t("stats.error") : t("stats.loading")}
        </p>
      ) : stats.wines.total === 0 && stats.tastings.total === 0 ? (
        <p className="settings-card">{t("stats.empty")}</p>
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

          {stats.tastings.scored === 0 ? null : (
            <section aria-labelledby="stats-scores" className="settings-card">
              <h2 id="stats-scores">{t("stats.scoresTitle")}</h2>
              <Bars
                items={stats.tastings.scoreBands.map((band) => ({
                  count: band.count,
                  label: t(`stats.band.${band.band}`),
                }))}
              />
              <p className="section-help">
                {t("stats.answers", {
                  again: stats.tastings.wouldDrinkAgain.yes,
                  buy: stats.tastings.wouldBuy.yes,
                  memorable: stats.tastings.memorable,
                })}
                {stats.tastings.pairingSuccessAverage === null
                  ? null
                  : ` · ${t("stats.pairing", { value: number(stats.tastings.pairingSuccessAverage) })}`}
              </p>
              {stats.tastings.topWines.length === 0 ? null : (
                <>
                  <h3>{t("stats.topWines")}</h3>
                  <ol className="stats-list">
                    {stats.tastings.topWines.map((wine) => (
                      <li key={wine.wineId}>
                        <strong>{wine.score}</strong> {wineLink(wine)}
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
            <div className="stats-columns">
              <div>
                <h3>{t("stats.byType")}</h3>
                <Bars
                  items={stats.wines.byType.map((row) => ({
                    count: row.count,
                    label: typeName(row.key),
                  }))}
                />
              </div>
              <div>
                <h3>{t("stats.byCountry")}</h3>
                <Bars
                  items={stats.wines.byCountry.map((row) => ({
                    count: row.count,
                    label: countryName(row.key),
                  }))}
                />
              </div>
              {stats.wines.byRegion.length === 0 ? null : (
                <div>
                  <h3>{t("stats.byRegion")}</h3>
                  <Bars
                    items={stats.wines.byRegion.map((row) => ({
                      count: row.count,
                      label: row.key,
                    }))}
                  />
                </div>
              )}
              {stats.wines.byGrape.length === 0 ? null : (
                <div>
                  <h3>{t("stats.byGrape")}</h3>
                  <Bars
                    items={stats.wines.byGrape.map((row) => ({ count: row.count, label: row.key }))}
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
