import type { LibraryGrape } from "@vadevi/contracts";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { EuropeMap } from "../library/EuropeMap";
import { flagOf } from "../library/flag";
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
          void navigate(`/library/grapes/${found[0].id}`, { replace: true });
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
  }, [grapeId, locale, name, navigate, user]);

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

  const structure = (["acidity", "tannin", "body"] as const).filter((axis) => grape[axis] !== null);
  const fromSource = grape.pairings;
  const suggested = grape.suggestedPairings;
  const origin = country(grape.originCountryCode);

  return (
    <section className="library-page">
      <p className="section-help">
        <Link className="text-link" to="/library">
          ← {t("library.home.title")}
        </Link>
      </p>
      <header className="page-heading library-heading">
        <div>
          <p className="eyebrow">{t("library.eyebrow")}</p>
          <h1>{grape.name}</h1>
          <p>
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
            <figcaption>
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
          <p className="section-help">
            <a
              className="text-link"
              href={grape.summary.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("library.summarySource")}
            </a>
            {grape.summary.locale === i18n.language.split("-")[0] || grape.summary.locale === locale
              ? null
              : ` · ${t("library.summaryOtherLanguage")}`}
          </p>
        </section>
      )}

      {structure.length === 0 && grape.aromas.length === 0 ? null : (
        <section aria-labelledby="library-profile" className="settings-card">
          <h2 id="library-profile">{t("library.profileTitle")}</h2>
          {structure.length === 0 ? null : (
            <dl className="library-structure">
              {structure.map((axis) => (
                <div key={axis}>
                  <dt>{t(`library.axis.${axis}`)}</dt>
                  <dd>{t(`library.level.${grape[axis]!}`)}</dd>
                </div>
              ))}
            </dl>
          )}
          {grape.aromas.length === 0 ? null : (
            <>
              <h3>{t("library.aromas")}</h3>
              <ul className="library-chips">
                {grape.aromas.map((aroma) => (
                  <li key={aroma}>{aroma}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {fromSource.length === 0 && suggested === null ? null : (
        <section aria-labelledby="library-pairing" className="settings-card">
          <h2 id="library-pairing">{t("library.suggestedTitle")}</h2>
          {fromSource.length === 0 ? null : (
            <>
              <h3>{t("library.fromSource")}</h3>
              <ul className="library-chips">
                {fromSource.map((food) => (
                  <li key={food}>{food}</li>
                ))}
              </ul>
            </>
          )}
          {suggested === null ? null : (
            <>
              <ul className="library-chips library-chips--suggested">
                {suggested.families.map((family) => (
                  <li key={family}>{t(`library.dish.${family}`)}</li>
                ))}
              </ul>
              <p className="section-help">
                {t(
                  suggested.basis === "catalogue"
                    ? "library.suggestedBasisCatalogue"
                    : "library.suggestedBasisProfile",
                  {
                    styles: suggested.styles.map((style) => t(`library.style.${style}`)).join(", "),
                  },
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
                    <Link className="text-link" to={`/library/regions/${region.regionId}`}>
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
          <EuropeMap countryCode={grape.originCountryCode} label={origin} />
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
