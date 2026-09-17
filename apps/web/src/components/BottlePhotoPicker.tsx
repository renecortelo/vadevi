import type { BottlePhotoCandidate, SupportedLocale } from "@vadevi/contracts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import {
  getBottlePhotoThumbnail,
  importBottlePhoto,
  searchBottlePhotoCandidates,
} from "../services/bottle-photo";
import { ModalDialog } from "./ModalDialog";

/** One candidate thumbnail, fetched through the server so the browser never
 *  reaches the provider CDN itself. */
function CandidateThumbnail({
  candidate,
  onChoose,
  spaceId,
  wineId,
}: {
  candidate: BottlePhotoCandidate;
  onChoose: () => void;
  spaceId: string;
  wineId: string;
}) {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (user === null) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void getBottlePhotoThumbnail(user, spaceId, wineId, candidate.thumbnailUrl, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [candidate.thumbnailUrl, spaceId, user, wineId]);
  if (url === null) return null;
  return (
    <button className="bottle-photo__candidate" onClick={onChoose} type="button">
      <img alt={candidate.title} src={url} />
    </button>
  );
}

/**
 * Find a professional bottle photo for a wine and, once the reader picks one,
 * make it the wine's main image. Shown only where the deployment enabled it.
 */
export function BottlePhotoPicker({
  onAdopted,
  spaceId,
  wineId,
}: {
  onAdopted: () => void;
  spaceId: string;
  wineId: string;
}) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<BottlePhotoCandidate[] | null>(null);
  const [pending, setPending] = useState<BottlePhotoCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which page of results has been asked for, and whether the provider ran out —
  // six photos are often none of the right bottle, so the reader can keep asking.
  const [offset, setOffset] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  async function runSearch(nextOffset = 0) {
    if (user === null) return;
    setBusy(true);
    setError(null);
    try {
      const locale = (i18n.language.split("-")[0] as SupportedLocale) ?? "en";
      const found = await searchBottlePhotoCandidates(user, spaceId, wineId, locale, nextOffset);
      // A page that brings nothing new means the web has no more to offer for
      // this bottle; say so rather than leaving the button looking broken.
      const fresh = found.filter(
        (candidate) =>
          nextOffset === 0 ||
          !(candidates ?? []).some((seen) => seen.thumbnailUrl === candidate.thumbnailUrl),
      );
      setExhausted(fresh.length === 0 && nextOffset > 0);
      setCandidates(nextOffset === 0 ? found : [...(candidates ?? []), ...fresh]);
      setOffset(nextOffset);
    } catch {
      setError(t("evidence.bottlePhoto.searchError"));
    } finally {
      setBusy(false);
    }
  }

  async function adopt(candidate: BottlePhotoCandidate) {
    if (user === null) return;
    setBusy(true);
    setError(null);
    try {
      await importBottlePhoto(user, spaceId, wineId, candidate);
      setPending(null);
      setCandidates(null);
      setOffset(0);
      setExhausted(false);
      onAdopted();
    } catch {
      setError(t("evidence.bottlePhoto.adoptError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bottle-photo">
      <button
        className="action-link"
        disabled={busy}
        onClick={() => void runSearch()}
        type="button"
      >
        {t("evidence.bottlePhoto.searchAction")}
      </button>
      {error === null ? null : <p className="research-panel__notice">{error}</p>}
      {candidates === null ? null : candidates.length === 0 ? (
        <p className="research-panel__notice">{t("evidence.bottlePhoto.none")}</p>
      ) : (
        <>
          <p className="bottle-photo__help">{t("evidence.bottlePhoto.chooseHelp")}</p>
          <div className="bottle-photo__grid">
            {candidates.map((candidate) => (
              <CandidateThumbnail
                candidate={candidate}
                key={candidate.thumbnailUrl}
                onChoose={() => setPending(candidate)}
                spaceId={spaceId}
                wineId={wineId}
              />
            ))}
          </div>
          {exhausted ? (
            <p className="research-panel__notice">{t("evidence.bottlePhoto.noMore")}</p>
          ) : (
            <button
              className="action-link action-link--secondary"
              disabled={busy}
              onClick={() => void runSearch(offset + 1)}
              type="button"
            >
              {t("evidence.bottlePhoto.moreAction")}
            </button>
          )}
        </>
      )}
      {pending === null ? null : (
        <ModalDialog labelledBy="adopt-photo-title" onDismiss={() => setPending(null)} open>
          <h2 id="adopt-photo-title">{t("evidence.bottlePhoto.confirmTitle")}</h2>
          <p>{t("evidence.bottlePhoto.confirmBody")}</p>
          <div className="hero__actions">
            <button
              className="action-link"
              disabled={busy}
              onClick={() => void adopt(pending)}
              type="button"
            >
              {t("evidence.bottlePhoto.confirmAction")}
            </button>
            <button
              className="action-link action-link--secondary"
              onClick={() => setPending(null)}
              type="button"
            >
              {t("evidence.bottlePhoto.cancel")}
            </button>
          </div>
        </ModalDialog>
      )}
    </div>
  );
}
