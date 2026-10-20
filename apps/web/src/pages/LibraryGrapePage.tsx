import type { LibraryGrape } from "@vadevi/contracts";
import { aromaFromTerm, resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { type CSSProperties, useEffect, useState } from "react";
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
  const sweetSteps = ["dry", "medium", "sweet"] as const;
  // "Trocken bis süß": the range reads as a sentence, its first letter up.
  const sentence = (text: string) =>
    text.charAt(0).toLocaleUpperCase(i18n.language) + text.slice(1);
  const fromSource = grape.pairings;
  const suggested = grape.suggestedPairings;
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
          <p>
            {grape.color === null ? null : (
              <span aria-hidden="true" className={`grape-swatch grape-swatch--${grape.color}`} />
            )}
            {[
              grape.color === null ? null : t(`library.color.${grape.color}`),
              origin === null
                ? null
                : `${flagOf(grape.originCountryCode)} ${t("library.origin", { country: origin })}`,
            ]
              .filter(Boolean)
              .join(" · ")}
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
                // sources give three levels, and the gauge claims no more.
                const reach =
                  level === null ? "0%" : { high: "85%", low: "25%", medium: "55%" }[level];
                return (
                  <div
                    className={level === null ? "library-bar library-bar--none" : "library-bar"}
                    key={axis}
                  >
                    <dt>{t(`library.axis.${axis}`)}</dt>
                    <dd>
                      <span aria-hidden="true" className="library-gauge">
                        <i style={{ "--from": "0%", "--to": reach } as CSSProperties} />
                      </span>
                      {level === null ? t("library.noSourceValue") : t(`library.level.${level}`)}
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
                  <span aria-hidden="true" className="library-gauge">
                    {grape.sweetness === null ? null : (
                      <i
                        style={
                          {
                            "--from": `${sweetSteps.indexOf(grape.sweetness.from) * 33}%`,
                            "--to": `${(sweetSteps.indexOf(grape.sweetness.to) + 1) * 33 + (grape.sweetness.to === "sweet" ? 1 : 0)}%`,
                          } as CSSProperties
                        }
                      />
                    )}
                  </span>
                  <span aria-hidden="true" className="library-bar__ends">
                    <span>{t("library.sweetness.dry")}</span>
                    <span>{t("library.sweetness.sweet")}</span>
                  </span>
                  {grape.sweetness === null
                    ? t("library.noSourceValue")
                    : grape.sweetness.from === grape.sweetness.to
                      ? t(`library.sweetness.${grape.sweetness.from}`)
                      : sentence(
                          t("library.sweetnessRange", {
                            from: t(`library.sweetness.${grape.sweetness.from}`).toLocaleLowerCase(
                              i18n.language,
                            ),
                            to: t(`library.sweetness.${grape.sweetness.to}`).toLocaleLowerCase(
                              i18n.language,
                            ),
                          }),
                        )}
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
                <strong>{entry.value}</strong> — “{entry.quote}”
                {/* A fact read from another article — the grape's own
                    language's — links that article, not the English one. */}
                {entry.sourceUrl === grape.evidence[0]!.sourceUrl ? null : (
                  <>
                    {" "}
                    <a
                      className="text-link"
                      href={entry.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      ({new URL(entry.sourceUrl).hostname})
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="section-help">
            <a
              className="text-link"
              href={grape.evidence[0]!.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("library.evidenceSource")}
            </a>
          </p>
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
