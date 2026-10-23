import type { LibraryRegion } from "@vadevi/contracts";
import { useTranslation } from "react-i18next";

/**
 * A registered name's card at a glance — how many varieties its
 * specification allows, how much vineyard and wine — and its climate, each
 * figure with where it comes from. A figure no source gives is not shown.
 */
const glanceDrawings = {
  grapes: [
    "M16 22a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM24 22a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM32 22a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M20 29a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM28 29a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M24 36a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M24 14V8M24 9c3-2 6-2 8 0",
  ],
  glass: ["M16 8h16l-1 12a7 7 0 0 1-14 0z", "M24 27v13M18 40h12"],
  vineyard: ["M6 38l10-22 8 14 6-8 12 16z", "M6 38h36", "M14 32h4M22 35h4M30 35h4"],
} as const;

function GlanceIcon({ name }: { name: keyof typeof glanceDrawings }) {
  return (
    <svg aria-hidden="true" className="aroma-icon" focusable="false" viewBox="0 0 48 48">
      {glanceDrawings[name].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

export function RegionGlance({ region }: { region: LibraryRegion }) {
  const { i18n, t } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  // Large figures in short ("65 mil", "3,2 M"), so the three fit on one row
  // on a phone; the exact figure is the element's title.
  const short = (digits: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: digits, notation: "compact" });
  const amount = (value: number) =>
    value >= 1_000_000
      ? short(1).format(value)
      : value >= 10_000
        ? short(0).format(value)
        : number.format(value);
  const varieties = region.register?.grapes.length ?? 0;
  const { planted, production } = region.figures;
  if (varieties === 0 && planted === null && production === null) return null;
  // Only a figure the article gives in acres: "{{convert|65326|ha|acres}}"
  // gives hectares, and converts them for its own readers.
  const converted = (quote: string) =>
    /\{\{\s*convert\s*\|\s*[\d.,]+\s*\|\s*acres?\b|\d\s*acres?\b/i.test(quote);
  const year = (value: string | null) =>
    value === null ? null : ` · ${t("library.glanceYear", { year: value })}`;
  const sources = [planted, production].filter((figure) => figure !== null);

  return (
    <section aria-labelledby="region-glance" className="settings-card">
      <h2 id="region-glance">{t("library.glanceTitle")}</h2>
      <ul className="region-glance">
        {varieties === 0 ? null : (
          <li>
            <GlanceIcon name="grapes" />
            <strong>{number.format(varieties)}</strong>
            <span>{t("library.glanceVarieties", { count: varieties })}</span>
          </li>
        )}
        {planted === null ? null : (
          <li>
            <GlanceIcon name="vineyard" />
            <strong title={`${number.format(planted.amount)} ha`}>
              {converted(planted.quote) ? "≈ " : ""}
              {amount(Math.round(planted.amount * 10) / 10)} ha
            </strong>
            <span>
              {t("library.glancePlanted")}
              {year(planted.year)}
              {converted(planted.quote) ? ` · ${t("library.glanceConverted")}` : ""}
            </span>
          </li>
        )}
        {production === null ? null : (
          <li>
            <GlanceIcon name="glass" />
            <strong title={`${number.format(production.amount)} hl`}>
              {amount(production.amount)} hl
            </strong>
            <span>
              {t("library.glanceProduction")}
              {year(production.year)}
            </span>
          </li>
        )}
      </ul>
      {/* Credited as the library credits every Wikipedia text: the article,
          and its licence. */}
      {sources.length === 0 ? null : (
        <p className="section-help">
          {t("library.glanceSource")}{" "}
          {[...new Map(sources.map((figure) => [figure.sourceUrl, figure])).values()].map(
            (figure, index) => (
              <span key={figure.sourceUrl}>
                {index === 0 ? "" : " · "}
                <a className="text-link" href={figure.sourceUrl} rel="noreferrer" target="_blank">
                  {figure.publisher === "mapa"
                    ? t("library.glanceSourceMapa", { campaign: figure.year ?? "" })
                    : figure.publisher === "douane"
                      ? t("library.glanceSourceDouane", { campaign: figure.year ?? "" })
                      : figure.publisher === "inv"
                        ? t("library.glanceSourceInv", { campaign: figure.year ?? "" })
                        : figure.publisher === "destatis"
                          ? t("library.glanceSourceDestatis", { campaign: figure.year ?? "" })
                          : figure.publisher === "statistik-austria"
                            ? t(
                                figure === production
                                  ? "library.glanceSourceStatistikAustriaHarvest"
                                  : "library.glanceSourceStatistikAustria",
                                { campaign: figure.year ?? "" },
                              )
                            : figure.publisher === "artea"
                              ? t("library.glanceSourceArtea", { campaign: figure.year ?? "" })
                              : figure.publisher === "regione-umbria"
                                ? t("library.glanceSourceUmbria", { campaign: figure.year ?? "" })
                                : figure.publisher === "regione-lombardia"
                                  ? t("library.glanceSourceLombardia", {
                                      campaign: figure.year ?? "",
                                    })
                                  : figure.publisher === "ksh"
                                    ? t("library.glanceSourceKsh", { campaign: figure.year ?? "" })
                                    : figure.publisher === "federal-register"
                                      ? t("library.glanceSourceFederalRegister", {
                                          campaign: figure.year ?? "",
                                        })
                                      : figure.publisher === "blw"
                                        ? t("library.glanceSourceBlw", {
                                            campaign: figure.year ?? "",
                                          })
                                        : figure.publisher === "ine-portugal"
                                          ? t("library.glanceSourceInePortugal", {
                                              campaign: figure.year ?? "",
                                            })
                                          : figure.publisher === "abs"
                                            ? t("library.glanceSourceAbs", {
                                                campaign: figure.year ?? "",
                                              })
                                            : figure.publisher === "adelaide"
                                              ? t("library.glanceSourceAdelaide", {
                                                  campaign: figure.year ?? "",
                                                })
                                              : t("library.summarySource")}
                </a>
              </span>
            ),
          )}
        </p>
      )}
    </section>
  );
}

const winklerSteps = ["I", "II", "III", "IV", "V"] as const;

/** Twelve months of rain as bars and of temperature as a line. */
function Climograph({ pr, tas }: { pr: readonly number[]; tas: readonly number[] }) {
  const { i18n } = useTranslation();
  const months = Array.from({ length: 12 }, (_, month) =>
    new Date(Date.UTC(2001, month, 1)).toLocaleDateString(i18n.language, {
      month: "narrow",
      timeZone: "UTC",
    }),
  );
  const width = 300;
  const height = 120;
  const column = width / 12;
  const rainTop = Math.max(100, ...pr);
  const low = Math.min(0, ...tas);
  const high = Math.max(30, ...tas);
  const y = (temperature: number) => 8 + ((high - temperature) / (high - low)) * (height - 16);
  const line = tas
    .map(
      (temperature, month) =>
        `${month === 0 ? "M" : "L"}${column * month + column / 2} ${y(temperature)}`,
    )
    .join(" ");
  return (
    <svg
      aria-hidden="true"
      className="climograph"
      focusable="false"
      viewBox={`0 0 ${width} ${height + 14}`}
    >
      {pr.map((rain, month) => {
        const barHeight = (rain / rainTop) * (height - 8);
        return (
          <rect
            className="climograph__rain"
            height={barHeight}
            key={`rain-${month}`}
            rx={2}
            width={column - 6}
            x={column * month + 3}
            y={height - barHeight}
          />
        );
      })}
      <path className="climograph__temperature" d={line} />
      {months.map((label, month) => (
        <text
          className="climograph__month"
          key={`month-${month}`}
          textAnchor="middle"
          x={column * month + column / 2}
          y={height + 12}
        >
          {label}
        </text>
      ))}
    </svg>
  );
}

export function RegionClimate({ climate }: { climate: NonNullable<LibraryRegion["climate"]> }) {
  const { i18n, t } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const group = climate.koppen.slice(0, 2);
  const detail = climate.koppen.slice(2, 3);
  const koppenName = [
    t(`library.koppenGroup.${group}`),
    detail === "" ? null : t(`library.koppenDetail.${detail}`),
  ]
    .filter(Boolean)
    .join(", ");
  const filled = climate.winkler === null ? 0 : winklerSteps.indexOf(climate.winkler) + 1;
  const monthly = climate.tas
    .map(
      (temperature, month) =>
        `${number.format(temperature)} °C, ${number.format(climate.pr[month]!)} mm`,
    )
    .join("; ");

  return (
    <section aria-labelledby="region-climate" className="settings-card">
      <h2 id="region-climate">{t("library.climateTitle")}</h2>
      <dl className="region-climate">
        <div>
          <dt>{t("library.climateKoppen")}</dt>
          <dd>
            {koppenName} ({climate.koppen})
          </dd>
        </div>
        <div>
          <dt>{t("library.climateRainfall")}</dt>
          <dd>{number.format(climate.rainfall)} mm</dd>
        </div>
        <div>
          <dt>{t("library.climateMean")}</dt>
          <dd>{number.format(climate.meanTemperature)} °C</dd>
        </div>
        {climate.elevation === null ? null : (
          <div>
            <dt>{t("library.climateElevation")}</dt>
            <dd>{number.format(climate.elevation)} m</dd>
          </div>
        )}
        <div className={climate.winkler === null ? "library-bar library-bar--none" : "library-bar"}>
          <dt>{t("library.climateWinkler")}</dt>
          <dd>
            <span aria-hidden="true" className="library-bar__steps library-bar__steps--five">
              {winklerSteps.map((step, index) => (
                <i className={index < filled ? "is-on" : undefined} key={step} />
              ))}
            </span>
            <span aria-hidden="true" className="library-bar__ends">
              <span>{t("library.climateCool")}</span>
              <span>{t("library.climateWarm")}</span>
            </span>
            {climate.winkler === null ? t("library.climateBelow") : climate.winkler}
            {" · "}
            {t("library.climateDegreeDays", { value: number.format(climate.growingDegreeDays) })}
          </dd>
        </div>
      </dl>
      <figure className="region-climograph">
        <Climograph pr={climate.pr} tas={climate.tas} />
        <figcaption className="section-help">
          {t("library.climateMonths")}
          <span className="sr-only">: {monthly}</span>
        </figcaption>
      </figure>
      <p className="section-help">
        {t("library.climateNote")}
        {climate.elevation === null ? null : ` ${t("library.climateElevationSource")}`}
      </p>
    </section>
  );
}

/**
 * The soil at the name's point in the top 30 cm: clay, silt and sand as one
 * bar, its pH in words, and its organic carbon. One point: a guide.
 */
export function RegionSoil({ soil }: { soil: NonNullable<LibraryRegion["soil"]> }) {
  const { i18n, t } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const reaction = soil.ph < 6.5 ? "acid" : soil.ph > 7.5 ? "alkaline" : "neutral";
  const parts = [
    ["clay", soil.clay],
    ["silt", soil.silt],
    ["sand", soil.sand],
  ] as const;
  return (
    <section aria-labelledby="region-soil" className="settings-card">
      <h2 id="region-soil">{t("library.soilTitle")}</h2>
      <div aria-hidden="true" className="soil-bar">
        {parts.map(([name, share]) => (
          <i className={`soil-bar__${name}`} key={name} style={{ flexGrow: share }} />
        ))}
      </div>
      <dl className="region-climate">
        {parts.map(([name, share]) => (
          <div key={name}>
            <dt>{t(`library.soil.${name}`)}</dt>
            <dd>{number.format(share)} %</dd>
          </div>
        ))}
        <div>
          <dt>{t("library.soil.ph")}</dt>
          <dd>
            {number.format(soil.ph)} · {t(`library.soil.${reaction}`)}
          </dd>
        </div>
        <div>
          <dt>{t("library.soil.organicCarbon")}</dt>
          <dd>{number.format(soil.organicCarbon)} g/kg</dd>
        </div>
      </dl>
      <p className="section-help">
        {t("library.soilNote")}
        {soil.nearKm === null
          ? null
          : ` ${t("library.soilNear", { km: number.format(soil.nearKm) })}`}
      </p>
    </section>
  );
}
