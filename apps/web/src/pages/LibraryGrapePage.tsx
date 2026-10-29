import type { LibraryGrape } from "@vadevi/contracts";
import { aromaFromTerm, resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { type CSSProperties, Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { AromaIcon } from "../library/AromaIcon";
import { AromaRing } from "../library/AromaRing";
import { AtlasMap } from "../library/AtlasMap";
import { flagOf } from "../library/flag";
import { TrailBackLink } from "../library/TrailBackLink";
import { trailFrom, useLibraryTrail } from "../library/trail";
import { getLibraryGrape, searchLibraryGrapes } from "../services/library";

/**
 * A grape's card from the wine library: what the open sources say about it,
 * each value with the sentence it came from, and what the pairing rules
 * suggest it goes with — kept apart, and labelled, so a suggestion is never
 * read as a source's claim.
 *
 * Reached by id (`/library/grapes/:grapeId`) or by a name as a wine records it
 * (`/library/grape?name=Tinto%20Fino`), which is resolved to the card.
 */
/**
 * The site a source is from, as the reader would name it: an Internet Archive
 * copy shows the site it keeps (the Ministry's, whose page is gone).
 */
function sourceHost(url: string): string {
  const archived = /^https?:\/\/web\.archive\.org\/web\/\d+[a-z_]*\/(https?:\/\/[^/]+)/.exec(url);
  return new URL(archived?.[1] ?? url).hostname;
}

export function LibraryGrapePage() {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const { user } = useAuth();
  const navigate = useNavigate();
  const trail = useLibraryTrail();
  const { grapeId } = useParams();
  const [search] = useSearchParams();
  const name = search.get("name");
  const [grape, setGrape] = useState<LibraryGrape | null>(null);
  const [state, setState] = useState<"error" | "loading" | "missing" | "ready">("loading");

  useEffect(() => {
    if (user === null) return;
    const controller = new AbortController();
    const load = async () => {
      setState("loading");
      try {
        if (grapeId === undefined) {
          const found =
            name === null ? [] : await searchLibraryGrapes(user, name, locale, controller.signal);
          if (found[0] === undefined) {
            setState("missing");
            return;
          }
          void navigate(`/library/grapes/${found[0].id}`, { replace: true, state: trail });
          return;
        }
        const card = await getLibraryGrape(user, grapeId, locale, controller.signal);
        setGrape(card);
        setState(card === null ? "missing" : "ready");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    };
    void load();
    return () => controller.abort();
  }, [grapeId, locale, name, navigate, trail, user]);

  const country = (code: string | null) =>
    code === null
      ? null
      : (new Intl.DisplayNames([i18n.language], { type: "region" }).of(code) ?? code);

  if (state !== "ready" || grape === null) {
    return (
      <section className="library-page">
        <header className="page-heading">
          <div>
            <p className="eyebrow">{t("library.eyebrow")}</p>
            <h1>{name ?? t("library.title")}</h1>
            <p role={state === "error" ? "alert" : "status"}>
              {state === "loading"
                ? t("library.loading")
                : state === "error"
                  ? t("library.error")
                  : t("library.missing")}
            </p>
          </div>
        </header>
      </section>
    );
  }

  // A white grape's wine has next to no tannin: no gauge for it, rather than
  // an empty one that reads as a figure missing — unless a source gives one.
  const axes = (["acidity", "tannin", "body", "alcohol"] as const).filter(
    (axis) => !(axis === "tannin" && grape.color === "white" && grape.tannin === null),
  );
  const structure = [
    ...axes.filter((axis) => grape[axis] !== null),
    ...(grape.sweetness === null ? [] : ["sweetness"]),
  ];
  // Alcohol read from the producers' sheets: the lowest and highest figure of
  // most of its wines (the tenth at each end left out, so one sweet Mosel or
  // one fortified bottle does not stretch it), on an axis from 8 % to 17 %
  // whose thirds are WSET's low, medium and high.
  const figures = (
    grape.evidence.find((entry) => entry.field === "alcohol" && entry.basis === "producers-abv")
      ?.wines ?? []
  )
    .flatMap((wine) => (wine.abv === undefined ? [] : [wine.abv]))
    .sort((one, other) => one - other);
  const trimmed = figures.slice(
    Math.floor(figures.length / 10),
    figures.length - Math.floor(figures.length / 10),
  );
  const degrees = trimmed.length === 0 ? null : { high: trimmed.at(-1)!, low: trimmed[0]! };
  const onAxis = (abv: number) => Math.min(100, Math.max(0, ((abv - 8) / 9) * 100));
  const percent = (abv: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1, style: "percent" }).format(
      abv / 100,
    );
  // Under a gauge, where its fill starts and where it ends: «Seco» under the
  // start, «Dulce» under the end. A narrow fill takes both as one label
  // («14,5 % – 14,8 %»), kept inside the bar.
  const ends = (from: number, to: number, start: string, end: string, spoken: string) => {
    const one = start === end ? start : to - from < 34 ? `${start} – ${end}` : null;
    return (
      <>
        <span
          aria-hidden="true"
          className="library-bar__span"
          style={{ "--from": `${from}%`, "--to": `${to}%` } as CSSProperties}
        >
          {one === null ? (
            <>
              <span className="library-bar__start">{start}</span>
              <span className="library-bar__end">{end}</span>
            </>
          ) : (
            <span className={from < 50 ? "library-bar__start" : "library-bar__end"}>{one}</span>
          )}
        </span>
        <span className="sr-only">{spoken}</span>
      </>
    );
  };
  // "Trocken bis süß": the range reads as a sentence, its first letter up.
  const sentence = (text: string) =>
    text.charAt(0).toLocaleUpperCase(i18n.language) + text.slice(1);
  const fromSource = grape.pairings;
  const suggested = grape.suggestedPairings;
  // The grape's own article: the Wikipedia page most of its facts are read
  // from. The facts come sorted by field, so a book's or a paper's may come
  // first; each fact from anywhere else links its own source.
  const quoted = new Map<string, number>();
  for (const entry of grape.evidence) {
    if (new URL(entry.sourceUrl).hostname.endsWith("wikipedia.org")) {
      quoted.set(entry.sourceUrl, (quoted.get(entry.sourceUrl) ?? 0) + 1);
    }
  }
  const article = [...quoted].sort((one, other) => other[1] - one[1])[0]?.[0] ?? null;
  // A fact said of one place's wine — a DOC's, the region where nearly all of
  // the grape grows — names the place beside it, linked where it is in the
  // atlas.
  const placeNote = (
    entry:
      | {
          basis: "producers" | "producers-abv" | "producers-sugar" | null;
          place: string | null;
          placeId: string | null;
          wines: unknown[] | null;
        }
      | undefined,
  ) =>
    entry?.basis === "producers" ||
    entry?.basis === "producers-abv" ||
    entry?.basis === "producers-sugar" ? (
      // Taken from the grape's single-variety wines: as many producers agree,
      // in words or in the figure on each sheet (alcohol, residual sugar).
      <span className="library-place">
        {t(
          entry.basis === "producers-abv"
            ? "library.saidOfProducersAbv"
            : entry.basis === "producers-sugar"
              ? "library.saidOfProducersSugar"
              : "library.saidOfProducers",
          { count: entry.wines?.length ?? 3 },
        )}
      </span>
    ) : entry?.place == null ? null : (
      <span className="library-place">
        {entry.placeId === null ? (
          t("library.saidOfPlace", { place: entry.place })
        ) : (
          <Link className="text-link" state={backHere} to={`/library/regions/${entry.placeId}`}>
            {t("library.saidOfPlace", { place: entry.place })}
          </Link>
        )}
      </span>
    );
  // A fact's wines, each linked, with the alcohol or residual sugar its
  // sheet gives where that is what the fact was read from.
  const wineLinks = (
    wines: {
      abv?: number | undefined;
      producer: string;
      sourceUrl: string;
      sugar?: number | undefined;
      wine: string;
    }[],
  ) =>
    wines.map((wine, index) => (
      <Fragment key={wine.sourceUrl}>
        {index === 0 ? null : " · "}
        <a className="text-link" href={wine.sourceUrl} rel="noreferrer" target="_blank">
          {wine.producer}, {wine.wine}
          {wine.abv === undefined
            ? null
            : ` (${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2, style: "percent" }).format(wine.abv / 100)})`}
          {wine.sugar === undefined
            ? null
            : ` (${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(wine.sugar)} g/l)`}
        </a>
      </Fragment>
    ));
  // Each fact's value in the reader's language, where the library has a label
  // for it; a dish or a name it has none for stays as the source wrote it.
  const shown = (entry: { field: string; value: string }) => {
    const { field, value } = entry;
    if (field === "acidity" || field === "tannin" || field === "body" || field === "alcohol") {
      return t(`library.level.${value}`, { defaultValue: value });
    }
    if (field === "sweetness") {
      const [from, to] = value.split("-");
      const label = (end: string) => t(`library.sweetness.${end}`, { defaultValue: end });
      return to === undefined
        ? label(from!)
        : sentence(
            t("library.sweetnessRange", {
              from: label(from!).toLocaleLowerCase(i18n.language),
              to: label(to).toLocaleLowerCase(i18n.language),
            }),
          );
    }
    if (field === "color") return t(`library.color.${value}`, { defaultValue: value });
    if (field === "origin") return country(value) ?? value;
    if (field === "styles") return t(`library.kind.${value}`, { defaultValue: value });
    if (field === "aromas" || field === "pairings") {
      const [terms, labels] =
        field === "aromas"
          ? [grape.aromaTerms, grape.aromas]
          : [grape.pairingTerms, grape.pairings];
      // The source's own word, which may be the plural of the term
      // («apples», «cherries» for «apple», «cherry»).
      const index = [value, value.replace(/ies$/, "y"), value.replace(/e?s$/, "")]
        .map((form) => terms.indexOf(form))
        .find((found) => found !== -1);
      return index === undefined ? value : labels[index]!;
    }
    return value;
  };
  const origin = country(grape.originCountryCode);

  // The pages this card links to lead back here, and on from here.
  const backHere = trailFrom(grape.name, `/library/grapes/${grape.id}`, trail);

  return (
    <section className="library-page">
      <p className="section-help library-back">
        <TrailBackLink />
        <Link className="text-link" state={backHere} to="/library">
          ← {t("library.home.title")}
        </Link>
      </p>
      <header className="page-heading library-heading">
        <div>
          <p className="eyebrow">{t("library.eyebrow")}</p>
          <h1>{grape.name}</h1>
          {/* The grape's colour on one line, where it comes from on the next. */}
          <p className="library-heading__facts">
            {grape.color === null ? null : (
              <span>
                <span aria-hidden="true" className={`grape-swatch grape-swatch--${grape.color}`} />
                {t(`library.color.${grape.color}`)}
              </span>
            )}
            {origin === null ? null : (
              <span>
                {`${flagOf(grape.originCountryCode)} ${t("library.origin", { country: origin })}`}
              </span>
            )}
          </p>
        </div>
        {grape.image === null ? null : (
          <figure className="library-photo">
            <img alt={t("library.photoAlt", { name: grape.name })} src={`/${grape.image.path}`} />
            <figcaption className="source-note">
              <a
                className="text-link"
                href={grape.image.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {t("library.photoCredit", {
                  author: grape.image.author,
                  license: grape.image.license,
                })}
              </a>
            </figcaption>
          </figure>
        )}
      </header>

      {grape.summary === null ? null : (
        <section className="settings-card library-summary">
          <p lang={grape.summary.locale === "pt-PT" ? "pt" : grape.summary.locale}>
            {grape.summary.text}
          </p>
          <p className="source-note">
            <a
              className="text-link"
              href={grape.summary.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("library.summarySource")}
            </a>
            {grape.summary.translated
              ? ` · ${t("library.summaryTranslated")}`
              : grape.summary.locale === i18n.language.split("-")[0] ||
                  grape.summary.locale === locale
                ? null
                : ` · ${t("library.summaryOtherLanguage")}`}
          </p>
        </section>
      )}

      {structure.length === 0 && grape.aromas.length === 0 ? null : (
        <section aria-labelledby="library-profile" className="settings-card">
          <h2 id="library-profile">{t("library.profileTitle")}</h2>
          {grape.aromas.length === 0 ? null : (
            <>
              <h3>{t("library.aromas")}</h3>
              <AromaRing
                descriptors={grape.aromaTerms.flatMap((term) => {
                  const descriptor = aromaFromTerm(term);
                  return descriptor === null ? [] : [descriptor];
                })}
                trail={backHere}
              />
              {/* Each aroma with its drawing over its name in the reader's
                  language. */}
              <ul className="aroma-grid">
                {grape.aromas.map((aroma, index) => {
                  const term = grape.aromaTerms[index];
                  const descriptor = term === undefined ? null : aromaFromTerm(term);
                  return (
                    <li key={term ?? aroma}>
                      {descriptor === null ? null : <AromaIcon descriptor={descriptor} />}
                      <span>{aroma}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {structure.length === 0 ? null : (
            <dl className="library-bars">
              {axes.map((axis) => {
                const level = grape[axis];
                // One continuous gauge, filled to where the level sits; the
                // sources give three levels, and the gauge claims no more —
                // but for alcohol read from figures, which it shows as they are.
                const reach =
                  level === null ? "0%" : { high: "85%", low: "25%", medium: "55%" }[level];
                const span =
                  axis === "alcohol" && degrees !== null
                    ? {
                        from: onAxis(degrees.low),
                        // A single figure still shows as a mark.
                        to: onAxis(Math.max(degrees.high, degrees.low + 0.2)),
                      }
                    : null;
                return (
                  <div
                    className={level === null ? "library-bar library-bar--none" : "library-bar"}
                    key={axis}
                  >
                    <dt>{t(`library.axis.${axis}`)}</dt>
                    <dd>
                      <span aria-hidden="true" className="library-gauge">
                        <i
                          style={
                            (span === null
                              ? { "--from": "0%", "--to": reach }
                              : {
                                  "--from": `${span.from}%`,
                                  "--to": `${span.to}%`,
                                }) as CSSProperties
                          }
                        />
                      </span>
                      {span === null || degrees === null
                        ? level === null
                          ? t("library.noSourceValue")
                          : t(`library.level.${level}`)
                        : ends(
                            span.from,
                            span.to,
                            percent(degrees.low),
                            percent(degrees.high),
                            sentence(
                              t("library.sweetnessRange", {
                                from: percent(degrees.low),
                                to: percent(degrees.high),
                              }),
                            ),
                          )}
                    </dd>
                  </div>
                );
              })}
              {/* From dry to sweet: the range of the wines it makes, as its
                  sources give it — Riesling's runs the whole bar. */}
              <div
                className={
                  grape.sweetness === null ? "library-bar library-bar--none" : "library-bar"
                }
              >
                <dt>{t("library.axis.sweetness")}</dt>
                <dd>
                  {/* Dry, off-dry and sweet are thirds of the gauge; the
                      range fills from one to the other. */}
                  {(() => {
                    if (grape.sweetness === null) {
                      return (
                        <>
                          <span aria-hidden="true" className="library-gauge" />
                          {t("library.noSourceValue")}
                        </>
                      );
                    }
                    // A level like the others, filled from the left: dry
                    // leaves it empty, semi-dry fills half, sweet all of it.
                    // A grape made both ways (Riesling, dry to sweet) fills to
                    // the middle of its range, and the line says the range.
                    const reach = { dry: 0, medium: 50, sweet: 100 };
                    const fill = (reach[grape.sweetness.from] + reach[grape.sweetness.to]) / 2;
                    const start = t(`library.sweetness.${grape.sweetness.from}`);
                    const end = t(`library.sweetness.${grape.sweetness.to}`);
                    return (
                      <>
                        <span aria-hidden="true" className="library-gauge">
                          <i style={{ "--from": "0%", "--to": `${fill}%` } as CSSProperties} />
                        </span>
                        {start === end
                          ? start
                          : sentence(
                              t("library.sweetnessRange", {
                                from: start.toLocaleLowerCase(i18n.language),
                                to: end.toLocaleLowerCase(i18n.language),
                              }),
                            )}
                      </>
                    );
                  })()}
                </dd>
              </div>
            </dl>
          )}
        </section>
      )}

      {fromSource.length === 0 && suggested === null ? null : (
        <section aria-labelledby="library-pairing" className="settings-card">
          <h2 id="library-pairing">{t("library.suggestedTitle")}</h2>
          {fromSource.length === 0 ? null : (
            <div className="library-pairing-group">
              <h3>{t("library.fromSource")}</h3>
              <ul className="library-chips">
                {fromSource.map((food) => (
                  <li key={food}>{food}</li>
                ))}
              </ul>
            </div>
          )}
          {suggested === null ? null : (
            <>
              {/* Each style its own dishes: a dry Riesling and a sweet one do
                  not go with the same things. */}
              {suggested.groups.map((group) => (
                <div className="library-pairing-group" key={group.style}>
                  <h3>
                    {t(`library.style.${group.style}`)}
                    {group.basis === "profile" && suggested.basis === "catalogue"
                      ? ` ${t("library.suggestedByProfile")}`
                      : null}
                  </h3>
                  <ul className="library-chips library-chips--suggested">
                    {group.families.map((family) => (
                      <li key={family}>{t(`library.dish.${family}`)}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="section-help">
                {t(
                  suggested.basis === "catalogue"
                    ? "library.suggestedBasisCatalogue"
                    : "library.suggestedBasisProfile",
                )}
              </p>
            </>
          )}
        </section>
      )}

      {grape.regions.length === 0 && grape.styles.length === 0 ? null : (
        <section aria-labelledby="library-where" className="settings-card">
          <h2 id="library-where">{t("library.whereTitle")}</h2>
          {grape.regions.length === 0 ? null : (
            <ul className="library-chips">
              {grape.regions.map((region) => (
                <li key={`${region.countryCode}-${region.name}`}>
                  {region.regionId === null ? (
                    region.name
                  ) : (
                    <Link
                      className="text-link"
                      state={backHere}
                      to={`/library/regions/${region.regionId}`}
                    >
                      {region.name}
                    </Link>
                  )}
                  {/* "Chile · Chile" says nothing twice: a region that is the
                      country itself stands alone. */}
                  {region.countryCode === null ||
                  country(region.countryCode)?.toLowerCase() === region.name.toLowerCase() ||
                  region.countryCode.toLowerCase() === region.name.toLowerCase()
                    ? ""
                    : ` · ${country(region.countryCode)}`}
                </li>
              ))}
            </ul>
          )}
          {grape.styles.length === 0 ? null : (
            <p>
              {t("library.stylesLine", {
                styles: grape.styles.map((style) => t(`library.kind.${style}`)).join(", "),
              })}
            </p>
          )}
        </section>
      )}

      {grape.originCountryCode === null || origin === null ? null : (
        <section aria-labelledby="library-origin" className="settings-card">
          <h2 id="library-origin">{t("library.originTitle")}</h2>
          <AtlasMap countryCode={grape.originCountryCode} label={origin} />
        </section>
      )}

      {grape.synonyms.length === 0 ? null : (
        <section aria-labelledby="library-names" className="settings-card">
          <h2 id="library-names">{t("library.synonymsTitle")}</h2>
          <p>{grape.synonyms.slice(0, 30).join(" · ")}</p>
        </section>
      )}

      {grape.evidence.length === 0 ? null : (
        <details className="settings-card library-evidence">
          <summary>{t("library.evidenceTitle", { count: grape.evidence.length })}</summary>
          <ul>
            {grape.evidence.map((entry) => (
              <li key={`${entry.field}-${entry.value}`}>
                <strong>{shown(entry)}</strong>
                {/* A page that is not openly licensed gives the fact, not its
                    words: the value, then who says it, linked. */}
                {entry.factOnly ? null : <> — “{entry.quote}”</>}
                {placeNote(entry)}
                {entry.wines === null ? null : (
                  <>
                    {": "}
                    {wineLinks(entry.wines.slice(0, 6))}
                    {/* A grape's alcohol may stand on 170 sheets: the first
                        six, and the rest a tap away. */}
                    {entry.wines.length > 6 ? (
                      <details className="library-more-wines">
                        <summary>
                          {t("library.moreWines", { count: entry.wines.length - 6 })}
                        </summary>
                        {wineLinks(entry.wines.slice(6))}
                      </details>
                    ) : null}
                  </>
                )}
                {/* A fact read from another article — the grape's own
                    language's, a book, a paper — links that source. */}
                {entry.sourceUrl === article || entry.wines !== null ? null : (
                  <>
                    {" "}
                    <a
                      className="text-link"
                      href={entry.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      ({entry.publisher ?? sourceHost(entry.sourceUrl)})
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
          {article === null ? null : (
            <p className="section-help">
              <a className="text-link" href={article} rel="noreferrer" target="_blank">
                {t("library.evidenceSource")}
              </a>
            </p>
          )}
        </details>
      )}

      <p className="section-help">
        <Link className="text-link" to="/vicenc">
          {t("library.askVicenc", { name: grape.name })}
        </Link>
      </p>
    </section>
  );
}
