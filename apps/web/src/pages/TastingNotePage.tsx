import type { DeepTastingNote } from "@vadevi/contracts";
import { descriptorText, resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { MapLink } from "../components/MapLink";
import { getDeepTastingNote } from "../services/tasting";
import { useSession } from "../session/SessionContext";

/**
 * A tasting you already wrote, to read.
 *
 * Until now the only way to see a past tasting was to reopen the form that
 * created it: an editable, multi-step thing you had to navigate to find the one
 * line you were after. That makes an application for recording wine, not for
 * remembering it — and it put the place, and its directions, behind a scroll
 * through the whole form.
 *
 * Read-only on purpose. Correcting a tasting is a different act with a different
 * screen, one button away.
 */

/** A scale value as "4/5", or nothing when it was never recorded. */
function Scale({ label, value }: { label: string; value: number | null | undefined }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="tasting-read__fact">
      <dt>{label}</dt>
      <dd>{value}/5</dd>
    </div>
  );
}

function Prose({ text, title }: { text: string | null | undefined; title: string }) {
  if (text === null || text === undefined || text.trim().length === 0) return null;
  return (
    <section className="tasting-read__prose">
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

export function TastingNotePage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const { noteId = "", wineId = "" } = useParams();
  const [note, setNote] = useState<DeepTastingNote | null>(null);
  const [status, setStatus] = useState<"loading" | "missing" | "ready">("loading");

  useEffect(() => {
    if (user === null || noteId.length === 0) return;
    const controller = new AbortController();
    void getDeepTastingNote(user, spaceId, noteId, controller.signal)
      .then((loaded) => {
        setNote(loaded);
        setStatus("ready");
      })
      // A tasting that is not yours is not readable at all, which the server
      // decides; either way there is nothing to show here.
      .catch(() => setStatus("missing"));
    return () => controller.abort();
  }, [noteId, spaceId, user]);

  const locale = resolveSupportedLocale(i18n.language);
  const descriptorsFor = (phase: "nose" | "palate") =>
    (note?.descriptors ?? [])
      .filter((descriptor) => descriptor.phase === phase)
      .map((descriptor) => descriptorText(descriptor.code, locale)?.label ?? descriptor.code);

  if (status === "loading") {
    return (
      <div aria-live="polite" className="empty-state">
        <h2>{t("tastingRead.loadingTitle")}</h2>
      </div>
    );
  }

  if (status === "missing" || note === null) {
    return (
      <div className="empty-state">
        <h2>{t("tastingRead.missingTitle")}</h2>
        <p>{t("tastingRead.missingBody")}</p>
        <Link className="action-link action-link--primary" to={`/wines/${wineId}/evidence`}>
          {t("evidence.openAction")}
        </Link>
      </div>
    );
  }

  const nose = descriptorsFor("nose");
  const palate = descriptorsFor("palate");
  const venue = note.context?.venueName ?? null;

  return (
    <section className="tasting-read">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t("tastingRead.eyebrow")}</p>
          <h1>{new Date(note.tastedAt).toLocaleDateString(i18n.language)}</h1>
          {venue === null ? null : (
            <p className="tasting-read__venue">
              {venue}{" "}
              <MapLink
                className="text-link"
                latitude={note.context?.venueLatitude}
                longitude={note.context?.venueLongitude}
                name={venue}
              />
            </p>
          )}
        </div>
        <Link className="text-link" to={`/wines/${wineId}/evidence`}>
          {t("tastingRead.backAction")}
        </Link>
      </header>

      <div className="tasting-read__score">
        <strong>{note.score100 === null ? t("memory.notRated") : `${note.score100}/100`}</strong>
        {/* Optional on a deep note — absent, not null — and a null check let
            "quickLog.sentimentValue.undefined" through as the label. */}
        {note.sentiment === undefined ? null : (
          <span>{t(`quickLog.sentimentValue.${note.sentiment}`)}</span>
        )}
      </div>

      <dl className="tasting-read__facts">
        <Scale label={t("tasting.field.acidity")} value={note.acidity} />
        <Scale label={t("tasting.field.tannin")} value={note.tanninLevel} />
        <Scale label={t("tasting.field.body")} value={note.body} />
        <Scale label={t("tasting.field.sweetness")} value={note.sweetness} />
        <Scale label={t("tasting.field.finish")} value={note.finishLength} />
        <Scale label={t("tasting.field.balance")} value={note.balance} />
      </dl>

      {nose.length === 0 ? null : (
        <section className="tasting-read__descriptors">
          <h3>{t("tasting.step.nose")}</h3>
          <p>{nose.join(" · ")}</p>
        </section>
      )}
      {palate.length === 0 ? null : (
        <section className="tasting-read__descriptors">
          <h3>{t("tasting.step.palate")}</h3>
          <p>{palate.join(" · ")}</p>
        </section>
      )}

      <Prose text={note.appearanceText} title={t("tasting.step.appearance")} />
      <Prose text={note.noseText} title={t("tasting.field.noseText")} />
      <Prose text={note.palateText} title={t("tasting.field.palateText")} />
      <Prose text={note.conclusionText} title={t("tasting.field.conclusionText")} />
      <Prose text={note.context?.foodText} title={t("tasting.field.food")} />

      {/* Correcting a tasting is a different act, and it keeps its own screen. */}
      <Link
        className="action-link action-link--secondary"
        to={`/wines/${wineId}/taste?noteId=${noteId}`}
      >
        {t("tastingRead.editAction")}
      </Link>
    </section>
  );
}
