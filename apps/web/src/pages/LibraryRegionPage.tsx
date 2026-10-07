import type { LibraryRegion } from "@vadevi/contracts";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { MapLink } from "../components/MapLink";
import { EuropeMap } from "../library/EuropeMap";
import { flagOf } from "../library/flag";
import { TrailBackLink } from "../library/TrailBackLink";
import { useLibraryTrail } from "../library/trail";
import { getLibraryRegion, searchLibraryRegions } from "../services/library";

/**
 * A registered wine name from the atlas: what the EU register records about
 * it, a summary from Wikipedia where there is one, and the grapes whose own
 * articles say they are grown there — each with the sentence that says so.
 *
 * Reached by id (`/library/regions/:regionId`) or by a name as a wine records
 * it (`/library/region?name=Rioja&country=ES`), resolved to the entry.
 */
export function LibraryRegionPage() {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const { user } = useAuth();
  const navigate = useNavigate();
  const trail = useLibraryTrail();
  const { regionId } = useParams();
  const [search] = useSearchParams();
  const name = search.get("name");
  const country = search.get("country");
  const [region, setRegion] = useState<LibraryRegion | null>(null);
  const [state, setState] = useState<"error" | "loading" | "missing" | "ready">("loading");

  useEffect(() => {
    if (user === null) return;
    const controller = new AbortController();
    const load = async () => {
      setState("loading");
      try {
        if (regionId === undefined) {
          const found =
            name === null ? [] : await searchLibraryRegions(user, name, country, controller.signal);
          if (found[0] === undefined) {
            setState("missing");
            return;
          }
          void navigate(`/library/regions/${found[0].id}`, { replace: true, state: trail });
          return;
        }
        const entry = await getLibraryRegion(user, regionId, locale, controller.signal);
        setRegion(entry);
        setState(entry === null ? "missing" : "ready");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    };
    void load();
    return () => controller.abort();
  }, [country, locale, name, navigate, regionId, trail, user]);

  if (state !== "ready" || region === null) {
    return (
      <section className="library-page">
        <header className="page-heading">
          <div>
            <p className="eyebrow">{t("library.atlasEyebrow")}</p>
            <h1>{name ?? t("library.atlasEyebrow")}</h1>
            <p role={state === "error" ? "alert" : "status"}>
              {state === "loading"
                ? t("library.loading")
                : state === "error"
                  ? t("library.error")
                  : t("library.regionMissing")}
            </p>
          </div>
        </header>
      </section>
    );
  }

  const countryName =
    new Intl.DisplayNames([i18n.language], { type: "region" }).of(region.countryCode) ??
    region.countryCode;
  const registered =
    region.registeredOn === null
      ? null
      : new Date(`${region.registeredOn}T00:00:00Z`).toLocaleDateString(i18n.language, {
          dateStyle: "long",
          timeZone: "UTC",
        });

  return (
    <section className="library-page">
      <p className="section-help library-back">
        <TrailBackLink />
        <Link
          className="text-link"
          state={trail}
          to={`/library?tab=regions&country=${region.countryCode}`}
        >
          ← {t("library.home.title")}
        </Link>
      </p>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("library.atlasEyebrow")}</p>
          <h1>{region.name}</h1>
          <p>
            {t(region.giType === "PDO" ? "library.pdo" : "library.pgi")} ·{" "}
            {flagOf(region.countryCode)} {countryName}
          </p>
          {/* A point where Wikidata has one; otherwise the map searches the
              name in its country — most registered names have no point. */}
          <p>
            <MapLink
              className="venue-link"
              latitude={region.latitude}
              longitude={region.longitude}
              name={`${region.name}, ${countryName}`}
            />
          </p>
        </div>
      </header>

      {region.summary === null ? null : (
        <section className="settings-card library-summary">
          <p lang={region.summary.locale === "pt-PT" ? "pt" : region.summary.locale}>
            {region.summary.text}
          </p>
          <p className="section-help">
            <a
              className="text-link"
              href={region.summary.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("library.summarySource")}
            </a>
            {region.summary.translated
              ? ` · ${t("library.summaryTranslated")}`
              : region.summary.locale.split("-")[0] !== locale.split("-")[0]
                ? ` · ${t("library.summaryOtherLanguage")}`
                : null}
          </p>
        </section>
      )}

      <section aria-labelledby="region-map" className="settings-card">
        <h2 id="region-map">{t("library.whereTitle")}</h2>
        <EuropeMap
          countryCode={region.countryCode}
          label={region.name}
          latitude={region.latitude}
          longitude={region.longitude}
        />
        {region.latitude === null ? (
          <p className="section-help">{t("library.mapCountryOnly")}</p>
        ) : region.pointSource === "area" || region.pointSource === "place" ? (
          <p className="section-help">{t(`library.mapApproximate.${region.pointSource}`)}</p>
        ) : null}
      </section>

      <section aria-labelledby="region-register" className="settings-card">
        <h2 id="region-register">{t("library.registerTitle")}</h2>
        <p>
          {registered === null
            ? t(region.giType === "PDO" ? "library.pdo" : "library.pgi")
            : t("library.registeredOn", { date: registered })}
        </p>
        {region.legalUrl === null ? null : (
          <p className="section-help">
            <a className="text-link" href={region.legalUrl} rel="noreferrer" target="_blank">
              {t("library.registerLink")}
            </a>
          </p>
        )}
        {/* What the name's own document in the register says: its categories
            and main varieties, as written there, with the document itself. */}
        {region.register === null ? null : (
          <>
            {region.register.categories.length === 0 ? null : (
              <div className="library-pairing-group">
                <h3>{t("library.registerCategories")}</h3>
                <ul className="library-chips">
                  {region.register.categories.map((category) => (
                    <li key={category}>{t(`library.wineCategory.${category}`)}</li>
                  ))}
                </ul>
              </div>
            )}
            {region.register.grapes.length === 0 ? null : (
              <div className="library-pairing-group">
                <h3>{t("library.registerGrapes")}</h3>
                <ul className="library-chips">
                  {region.register.grapes.map((variety) => (
                    <li key={variety.name}>
                      {variety.grapeId === null ? (
                        variety.name
                      ) : (
                        <Link
                          className="text-link"
                          state={trail}
                          to={`/library/grapes/${variety.grapeId}`}
                        >
                          {variety.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="section-help">{t("library.registerGrapesNote")}</p>
              </div>
            )}
            <p className="section-help">
              <a
                className="text-link"
                href={region.register.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                {t("library.registerDocument")}
              </a>
            </p>
          </>
        )}
      </section>

      {region.grapes.length === 0 ? null : (
        <section aria-labelledby="region-grapes" className="settings-card">
          <h2 id="region-grapes">{t("library.grapesHere")}</h2>
          <ul className="library-chips">
            {region.grapes.map((grape) => (
              <li key={grape.id}>
                <Link className="text-link" state={trail} to={`/library/grapes/${grape.id}`}>
                  {grape.name}
                </Link>
              </li>
            ))}
          </ul>
          <p className="section-help">{t("library.grapesHereNote")}</p>
          <details className="library-evidence">
            <summary>{t("library.evidenceTitle", { count: region.grapes.length })}</summary>
            <ul>
              {region.grapes.map((grape) => (
                <li key={grape.id}>
                  <strong>{grape.name}</strong> — “{grape.quote}”
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {region.otherNames.length === 0 ? null : (
        <section aria-labelledby="region-names" className="settings-card">
          <h2 id="region-names">{t("library.synonymsTitle")}</h2>
          <p>{region.otherNames.slice(0, 20).join(" · ")}</p>
        </section>
      )}

      <p className="section-help">
        <Link className="text-link" to="/vicenc">
          {t("library.askVicenc", { name: region.name })}
        </Link>
      </p>
    </section>
  );
}
