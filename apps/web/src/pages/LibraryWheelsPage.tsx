import type { LibrarySearchResponse } from "@vadevi/contracts";
import { aromaFromTerm, resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { AromaIcon } from "../library/AromaIcon";
import { LibraryTabs } from "../library/LibraryTabs";
import { trailFrom } from "../library/trail";
import { Wheel, type WheelNode } from "../library/Wheel";
import { aromaWheel, colourKinds, colourWheel, hueColours } from "../library/wheels";
import { getLibraryAromaCounts, listGrapesWithAroma } from "../services/library";

type Kind = "aromas" | "colours";
type Aromas = Map<string, { grapeCount: number; label: string }>;

/**
 * The library's wheels: the aroma vocabulary, by family and group, with the
 * grapes whose sources name each aroma; and the colours of wine, by the kind
 * of wine that shows them. A wheel narrows by touch; what is chosen is shown
 * beneath it.
 */
export function LibraryWheelsPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const locale = resolveSupportedLocale(i18n.language);
  const [kind, setKind] = useState<Kind>("aromas");
  const [selected, setSelected] = useState<string | null>(null);
  const [aromas, setAromas] = useState<{ key: string; map: Aromas } | null>(null);
  const [grapes, setGrapes] = useState<{
    term: string;
    list: LibrarySearchResponse["data"];
  } | null>(null);
  const key = `${locale}:${user?.uid ?? ""}`;

  useEffect(() => {
    if (user === null) return;
    const controller = new AbortController();
    getLibraryAromaCounts(user, locale, controller.signal)
      .then((data) =>
        setAromas({
          key,
          map: new Map(data.map((aroma) => [aroma.term, aroma])),
        }),
      )
      .catch(() => undefined);
    return () => controller.abort();
  }, [key, locale, user]);

  const term = selected?.startsWith("aroma:") === true ? selected.slice("aroma:".length) : null;
  useEffect(() => {
    if (user === null || term === null) return;
    const controller = new AbortController();
    listGrapesWithAroma(user, term, locale, controller.signal)
      .then((list) => setGrapes({ list, term }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [locale, term, user]);

  const map: Aromas = aromas?.key === key ? aromas.map : new Map();
  const root: WheelNode = kind === "aromas" ? aromaWheel(t, map) : colourWheel(t);
  const switchTo = (next: Kind) => {
    setKind(next);
    setSelected(null);
  };

  const hue = selected?.startsWith("hue:") === true ? selected.slice("hue:".length) : null;
  const hueKind =
    hue === null
      ? null
      : colourKinds.find((entry) => (entry.hues as readonly string[]).includes(hue));
  const descriptor = term === null ? null : aromaFromTerm(term);
  const known = term === null ? undefined : map.get(term);
  const list = grapes?.term === term ? grapes.list : null;
  const trail = trailFrom(t("library.wheels.title"), "/library/wheels");

  return (
    <section className="library-page">
      <LibraryTabs current="wheels" />
      <header className="page-header">
        <h1>{t("library.wheels.title")}</h1>
        <p className="section-help">{t("library.wheels.intro")}</p>
      </header>
      <section className="settings-card wheel-card">
        <div aria-label={t("library.wheels.title")} className="segmented-control" role="group">
          {(["aromas", "colours"] as const).map((option) => (
            <button
              aria-pressed={kind === option}
              key={option}
              onClick={() => switchTo(option)}
              type="button"
            >
              {t(`library.wheels.${option}`)}
            </button>
          ))}
        </div>
        <Wheel
          key={kind}
          label={t(`library.wheels.${kind}`)}
          onSelect={(node) => setSelected(node.id)}
          root={root}
          selected={selected}
        />
        <div aria-live="polite" className="wheel-choice">
          {selected === null ? <p className="section-help">{t("library.wheels.pick")}</p> : null}
          {term !== null ? (
            <>
              <h2 className="wheel-choice__title">
                {descriptor === null ? null : <AromaIcon descriptor={descriptor} />}
                <span>{known?.label ?? term}</span>
              </h2>
              {list === null ? null : list.length === 0 ? (
                <p className="section-help">{t("library.wheels.noGrape")}</p>
              ) : (
                <>
                  <p className="section-help">
                    {t("library.wheels.grapesWith", { count: list.length })}
                  </p>
                  <ul className="library-chips">
                    {list.map((grape) => (
                      <li key={grape.id}>
                        <Link
                          className="text-link"
                          state={trail}
                          to={`/library/grapes/${grape.id}`}
                        >
                          {grape.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : null}
          {hue !== null && hueKind != null ? (
            <h2 className="wheel-choice__title">
              <span
                aria-hidden="true"
                className="wheel-choice__swatch"
                style={{ background: hueColours[hue] }}
              />
              <span>
                {t(`tasting.hueOption.${hue}`)}
                <small>
                  {" "}
                  · {t("library.wheels.colourOf", { kind: t(`tasting.value.${hueKind.kind}`) })}
                </small>
              </span>
            </h2>
          ) : null}
        </div>
      </section>
    </section>
  );
}
