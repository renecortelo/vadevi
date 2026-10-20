import type { LibrarySearchResponse } from "@vadevi/contracts";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { getLibraryAromaCounts, listGrapesWithAroma } from "../services/library";
import { YourWines } from "./RegionTastings";
import { trailFrom, useLibraryTrail } from "./trail";
import { Wheel, type WheelNode } from "./Wheel";
import { aromaWheel, colourKinds, colourWheel } from "./wheels";

type Kind = "aromas" | "colours";
type Aromas = Map<string, { grapeCount: number; label: string }>;

/**
 * The library's wheels, a shelf of its page like the grapes: the aroma
 * vocabulary, by family and group, with the grapes whose sources name each
 * aroma; and the colours of wine, by the kind of wine that shows them. A
 * wheel narrows by touch; what is chosen is shown beneath it.
 */
export function LibraryWheels() {
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
  const root: WheelNode =
    kind === "aromas"
      ? aromaWheel(
          t,
          (term) => map.get(term)?.label ?? term,
          (term) => (map.get(term)?.grapeCount ?? 0) === 0,
        )
      : colourWheel(t);
  const switchTo = (next: Kind) => {
    setKind(next);
    setSelected(null);
  };

  const list = grapes?.term === term ? grapes.list : null;
  const hue = selected?.startsWith("hue:") === true ? selected.slice("hue:".length) : null;
  // Grapes and wines reached from here lead back here, and on from here.
  const trail = trailFrom(t("library.wheels.title"), "/library?tab=wheels", useLibraryTrail());

  return (
    <>
      <p className="section-help">{t("library.wheels.intro")}</p>
      <section aria-label={t("library.wheels.title")} className="settings-card wheel-card">
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
          detail={(node) => {
            if (node.id.startsWith("aroma:")) {
              const count = map.get(node.id.slice("aroma:".length))?.grapeCount ?? 0;
              return count === 0
                ? t("library.wheels.noGrapeShort")
                : t("library.wheels.grapeCount", { count });
            }
            if (node.id.startsWith("hue:")) {
              const found = colourKinds.find((entry) =>
                (entry.hues as readonly string[]).includes(node.id.slice("hue:".length)),
              );
              return found === undefined
                ? null
                : t("library.wheels.colourOf", { kind: t(`tasting.value.${found.kind}`) });
            }
            return null;
          }}
          key={kind}
          label={t(`library.wheels.${kind}`)}
          onSelect={(node) => setSelected(node.id)}
          root={root}
          selected={selected}
        />
        <div aria-live="polite" className="wheel-choice">
          {selected === null ? <p className="section-help">{t("library.wheels.pick")}</p> : null}
          {term !== null && list !== null && list.length > 0 ? (
            <>
              <p className="section-help">
                {t("library.wheels.grapesWith", { count: list.length })}
              </p>
              <ul className="library-chips">
                {list.map((grape) => (
                  <li key={grape.id}>
                    <Link className="text-link" state={trail} to={`/library/grapes/${grape.id}`}>
                      {grape.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        {/* A colour chosen: the reader's own wines tasted in it. */}
        {hue === null ? null : (
          <YourWines
            backHere={trail}
            empty={t("library.wheels.noWinesInColour")}
            filter={{ hue }}
            key={hue}
            title={t("library.wheels.yourWinesInColour", {
              colour: t(`tasting.hueOption.${hue}`).toLowerCase(),
            })}
          />
        )}
      </section>
    </>
  );
}
