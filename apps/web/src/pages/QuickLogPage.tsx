import type { WineGrape } from "@vadevi/contracts";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { resolveSupportedLocale, tastingDescriptors } from "@vadevi/i18n/runtime";
import { useTranslation } from "react-i18next";

import { ModalDialog } from "../components/ModalDialog";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { preprocessImage } from "../media/image";
import { offlineDatabase, partitionId, type QuickLogDraft } from "../offline/database";
import { useOfflineSync } from "../offline/OfflineSyncContext";
import { createIdempotencyKey } from "../security/idempotency";
import { createUlid } from "../security/ulid";
import { useSession } from "../session/SessionContext";

type WineType = "fortified" | "orange" | "other" | "red" | "rose" | "sparkling" | "white";

const descriptors = tastingDescriptors.filter((descriptor) => descriptor.phase !== "appearance");

function newDraft(userId: string, spaceId: string): QuickLogDraft {
  const now = new Date().toISOString();
  return {
    id: partitionId(userId, spaceId),
    // A quick log is a bottle worth remembering; the tasting note is opt-in, so
    // the shortest path — producer, name, save — is not a scroll past a note
    // nobody asked to write.
    includeNote: false,
    noteId: createUlid(),
    noteMutationId: createUlid(),
    notePayload: {
      descriptorCodes: [],
      mode: "quick",
      state: "submitted",
      tastedAt: now,
    },
    spaceId,
    updatedAt: now,
    userId,
    wineId: createUlid(),
    wineMutationId: createUlid(),
    winePayload: {
      displayName: "",
      identityStatus: "confirmed",
      nonVintage: false,
      producerName: "",
      vintageYear: null,
    },
  };
}

function localDateTime(iso: string): string {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function QuickLogPage() {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const { queueDraft, status } = useOfflineSync();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const userId = user?.uid ?? "";
  const [draft, setDraft] = useState<QuickLogDraft>(() => newDraft(userId, spaceId));
  const [ready, setReady] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [quotaWarning, setQuotaWarning] = useState(false);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  // The photo and the finer wine details are folded away so the shortest path —
  // producer, name, save — is not a scroll past everything optional. The photo
  // opens itself once one is attached, so a resumed draft shows what it holds.
  const [photoOpen, setPhotoOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const id = partitionId(userId, spaceId);
    void offlineDatabase.drafts.get(id).then((stored) => {
      if (!active) return;
      setDraft(stored ?? newDraft(userId, spaceId));
      setReviewing(false);
      setSaved(false);
      setPhotoOpen(stored?.photo !== undefined);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [spaceId, userId]);

  useEffect(() => {
    if (!ready || saved) return;
    const timeout = globalThis.setTimeout(() => {
      void offlineDatabase.drafts.put({ ...draft, updatedAt: new Date().toISOString() });
    }, 350);
    return () => globalThis.clearTimeout(timeout);
  }, [draft, ready, saved]);

  const previewUrl = useMemo(
    () => (draft.photo === undefined ? null : URL.createObjectURL(draft.photo.blob)),
    [draft.photo],
  );
  useEffect(
    () => () => {
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  function updateWine<Key extends keyof QuickLogDraft["winePayload"]>(
    key: Key,
    value: QuickLogDraft["winePayload"][Key],
  ) {
    setSaved(false);
    setDraft((current) => ({ ...current, winePayload: { ...current.winePayload, [key]: value } }));
  }

  function updateNote<Key extends keyof QuickLogDraft["notePayload"]>(
    key: Key,
    value: QuickLogDraft["notePayload"][Key],
  ) {
    setSaved(false);
    setDraft((current) => ({ ...current, notePayload: { ...current.notePayload, [key]: value } }));
  }

  async function choosePhoto(file: File | undefined) {
    if (file === undefined) return;
    setPhotoError(null);
    setProcessingPhoto(true);
    try {
      const estimate = await navigator.storage?.estimate();
      if (estimate?.quota !== undefined && estimate.usage !== undefined) {
        setQuotaWarning(estimate.usage / estimate.quota > 0.8);
      }
      const photo = await preprocessImage(file);
      setDraft((current) => ({
        ...current,
        photo: { ...photo, idempotencyKey: createIdempotencyKey() },
      }));
      setPhotoOpen(true);
    } catch {
      setPhotoError(t("quickLog.photoError"));
    } finally {
      setProcessingPhoto(false);
    }
  }

  function beginReview(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (
      draft.winePayload.producerName.trim().length === 0 ||
      draft.winePayload.displayName.trim().length === 0
    ) {
      setError(t("quickLog.requiredError"));
      return;
    }
    setReviewing(true);
  }

  async function confirm() {
    setError(null);
    try {
      await queueDraft({
        ...draft,
        notePayload: {
          ...draft.notePayload,
          comment: draft.notePayload.comment?.trim() || undefined,
          foodText: draft.notePayload.foodText?.trim() || undefined,
        },
        winePayload: {
          ...draft.winePayload,
          displayName: draft.winePayload.displayName.trim(),
          // Empty varietal rows the reader added but never filled are dropped
          // before the record is written.
          grapes: (draft.winePayload.grapes ?? [])
            .map((grape: WineGrape) => ({ ...grape, name: grape.name.trim() }))
            .filter((grape: WineGrape) => grape.name.length > 0),
          producerName: draft.winePayload.producerName.trim(),
        },
      });
      setSaved(true);
      setReviewing(false);
      setDraft(newDraft(userId, spaceId));
    } catch {
      setError(t("quickLog.saveError"));
    }
  }

  const selectedDescriptors = draft.notePayload.descriptorCodes;
  return (
    <section className="quick-log-page">
      <header className="page-heading">
        <p className="eyebrow">{t("quickLog.eyebrow")}</p>
        <h1>{t("quickLog.title")}</h1>
        <p>{t("quickLog.body")}</p>
      </header>

      {saved ? (
        <div className="notice-card" role="status">
          <strong>{t("quickLog.savedTitle")}</strong>
          <p>{t(`quickLog.savedBody.${status}`)}</p>
        </div>
      ) : null}

      <form className="quick-log-form" onSubmit={beginReview}>
        <fieldset className="form-section">
          <legend>{t("quickLog.identityTitle")}</legend>
          <p className="section-help">{t("quickLog.identityHelp")}</p>
          {/* §5.1 lists photo-assisted entry as an entry method for this flow,
              so the way in belongs here, beside the manual fields it replaces. */}
          <Link className="action-link action-link--secondary" to="/log/identify">
            {t("quickLog.identifyAction")}
          </Link>
          <label htmlFor="producer-name">{t("quickLog.producer")}</label>
          <input
            autoComplete="organization"
            id="producer-name"
            maxLength={160}
            onChange={(event) => updateWine("producerName", event.target.value)}
            required
            value={draft.winePayload.producerName}
          />
          <label htmlFor="wine-name">{t("quickLog.wineName")}</label>
          <input
            id="wine-name"
            maxLength={160}
            onChange={(event) => updateWine("displayName", event.target.value)}
            required
            value={draft.winePayload.displayName}
          />
          <details className="form-subsection">
            <summary>{t("quickLog.moreDetails")}</summary>
            <div className="form-grid">
              <label>
                <span>{t("quickLog.vintage")}</span>
                <input
                  disabled={draft.winePayload.nonVintage}
                  inputMode="numeric"
                  max="2100"
                  min="1000"
                  onChange={(event) =>
                    updateWine(
                      "vintageYear",
                      event.target.value === "" ? null : Number(event.target.value),
                    )
                  }
                  type="number"
                  value={draft.winePayload.vintageYear ?? ""}
                />
              </label>
              <label>
                <span>{t("quickLog.type")}</span>
                <select
                  onChange={(event) =>
                    updateWine(
                      "wineType",
                      (event.target.value || undefined) as WineType | undefined,
                    )
                  }
                  value={draft.winePayload.wineType ?? ""}
                >
                  <option value="">{t("quickLog.typeUnknown")}</option>
                  {(
                    ["red", "white", "rose", "sparkling", "fortified", "orange", "other"] as const
                  ).map((type) => (
                    <option key={type} value={type}>
                      {t(`quickLog.wineType.${type}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="check-row">
              <input
                checked={draft.winePayload.nonVintage}
                onChange={(event) => {
                  updateWine("nonVintage", event.target.checked);
                  if (event.target.checked) updateWine("vintageYear", null);
                }}
                type="checkbox"
              />
              <span>{t("quickLog.nonVintage")}</span>
            </label>
            <label htmlFor="region">{t("quickLog.region")}</label>
            <input
              id="region"
              maxLength={160}
              onChange={(event) => updateWine("region", event.target.value || undefined)}
              value={draft.winePayload.region ?? ""}
            />
            <label htmlFor="quicklog-alcohol">{t("wineDetails.alcohol")}</label>
            <input
              id="quicklog-alcohol"
              inputMode="decimal"
              max="100"
              min="0"
              onChange={(event) =>
                updateWine(
                  "alcoholAbv",
                  event.target.value === "" ? null : Number(event.target.value),
                )
              }
              placeholder={t("wineDetails.alcoholPlaceholder")}
              step="0.1"
              type="number"
              value={draft.winePayload.alcoholAbv ?? ""}
            />
            <fieldset className="grape-editor">
              <legend>{t("wineDetails.grapes")}</legend>
              {(draft.winePayload.grapes ?? []).length === 0 ? (
                <p className="cache-note">{t("wineDetails.grapesEmpty")}</p>
              ) : (
                (draft.winePayload.grapes ?? []).map((grape: WineGrape, index: number) => (
                  <div className="grape-editor__row grape-editor__row--names" key={index}>
                    <input
                      aria-label={t("wineDetails.grapeName")}
                      maxLength={120}
                      onChange={(event) =>
                        updateWine(
                          "grapes",
                          (draft.winePayload.grapes ?? []).map((entry: WineGrape, i: number) =>
                            i === index ? { ...entry, name: event.target.value } : entry,
                          ),
                        )
                      }
                      placeholder={t("wineDetails.grapeName")}
                      value={grape.name}
                    />
                    <button
                      aria-label={t("wineDetails.grapeRemove")}
                      className="text-button text-button--danger"
                      onClick={() =>
                        updateWine(
                          "grapes",
                          (draft.winePayload.grapes ?? []).filter(
                            (_: WineGrape, i: number) => i !== index,
                          ),
                        )
                      }
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                ))
              )}
              <button
                className="action-link action-link--secondary"
                onClick={() =>
                  updateWine("grapes", [...(draft.winePayload.grapes ?? []), { name: "" }])
                }
                type="button"
              >
                {t("wineDetails.grapeAdd")}
              </button>
            </fieldset>
          </details>
        </fieldset>

        <details
          className="form-section form-section--collapsible"
          onToggle={(event) => setPhotoOpen(event.currentTarget.open)}
          open={photoOpen}
        >
          <summary>{t("quickLog.photoTitle")}</summary>
          <p className="section-help">{t("quickLog.photoHelp")}</p>
          <label className="photo-picker">
            <span>
              {processingPhoto ? t("quickLog.photoProcessing") : t("quickLog.photoAction")}
            </span>
            <input
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              disabled={processingPhoto}
              onChange={(event) => void choosePhoto(event.target.files?.[0])}
              type="file"
            />
          </label>
          {previewUrl === null ? null : (
            <div className="photo-preview">
              <img alt={t("quickLog.photoPreviewAlt")} src={previewUrl} />
              <button
                className="text-button text-button--danger"
                onClick={() =>
                  setDraft((current) => {
                    const withoutPhoto = { ...current };
                    delete withoutPhoto.photo;
                    return withoutPhoto;
                  })
                }
                type="button"
              >
                {t("quickLog.photoRemove")}
              </button>
            </div>
          )}
          {quotaWarning ? <p className="form-warning">{t("quickLog.quotaWarning")}</p> : null}
          {photoError ? (
            <p className="form-error" role="alert">
              {photoError}
            </p>
          ) : null}
        </details>

        <fieldset className="form-section">
          <legend>{t("quickLog.noteTitle")}</legend>
          <label className="check-row">
            <input
              checked={draft.includeNote}
              onChange={(event) =>
                setDraft((current) => ({ ...current, includeNote: event.target.checked }))
              }
              type="checkbox"
            />
            <span>{t("quickLog.includeNote")}</span>
          </label>
          {draft.includeNote ? (
            <div className="note-fields">
              <div className="form-grid">
                <label>
                  <span>{t("quickLog.tastedAt")}</span>
                  <input
                    onChange={(event) =>
                      updateNote("tastedAt", new Date(event.target.value).toISOString())
                    }
                    type="datetime-local"
                    value={localDateTime(draft.notePayload.tastedAt)}
                  />
                </label>
                <label>
                  <span>{t("quickLog.score")}</span>
                  <input
                    max="100"
                    min="0"
                    onChange={(event) =>
                      updateNote(
                        "score100",
                        event.target.value === "" ? undefined : Number(event.target.value),
                      )
                    }
                    type="number"
                    value={draft.notePayload.score100 ?? ""}
                  />
                </label>
              </div>
              <div className="form-grid form-grid--three">
                <label>
                  <span>{t("quickLog.sentiment")}</span>
                  <select
                    onChange={(event) =>
                      updateNote(
                        "sentiment",
                        (event.target.value ||
                          undefined) as QuickLogDraft["notePayload"]["sentiment"],
                      )
                    }
                    value={draft.notePayload.sentiment ?? ""}
                  >
                    <option value="">—</option>
                    <option value="dislike">{t("quickLog.sentimentValue.dislike")}</option>
                    <option value="neutral">{t("quickLog.sentimentValue.neutral")}</option>
                    <option value="like">{t("quickLog.sentimentValue.like")}</option>
                  </select>
                </label>
                <label>
                  <span>{t("quickLog.drinkAgain")}</span>
                  <select
                    onChange={(event) =>
                      updateNote(
                        "wouldDrinkAgain",
                        (event.target.value ||
                          undefined) as QuickLogDraft["notePayload"]["wouldDrinkAgain"],
                      )
                    }
                    value={draft.notePayload.wouldDrinkAgain ?? ""}
                  >
                    <option value="">—</option>
                    <option value="yes">{t("commonChoice.yes")}</option>
                    <option value="no">{t("commonChoice.no")}</option>
                    <option value="unsure">{t("commonChoice.unsure")}</option>
                  </select>
                </label>
                <label>
                  <span>{t("quickLog.buyAgain")}</span>
                  <select
                    onChange={(event) =>
                      updateNote(
                        "wouldBuy",
                        (event.target.value ||
                          undefined) as QuickLogDraft["notePayload"]["wouldBuy"],
                      )
                    }
                    value={draft.notePayload.wouldBuy ?? ""}
                  >
                    <option value="">—</option>
                    <option value="yes">{t("commonChoice.yes")}</option>
                    <option value="no">{t("commonChoice.no")}</option>
                    <option value="unsure">{t("commonChoice.unsure")}</option>
                  </select>
                </label>
              </div>
              <fieldset className="descriptor-fieldset">
                <legend>{t("quickLog.descriptors")}</legend>
                <p>{t("quickLog.descriptorHelp")}</p>
                <div className="descriptor-grid">
                  {descriptors.map((descriptor) => {
                    const checked = selectedDescriptors.includes(descriptor.code);
                    return (
                      <label className="descriptor-chip" key={descriptor.code}>
                        <input
                          checked={checked}
                          disabled={!checked && selectedDescriptors.length >= 3}
                          onChange={(event) =>
                            updateNote(
                              "descriptorCodes",
                              event.target.checked
                                ? [...selectedDescriptors, descriptor.code]
                                : selectedDescriptors.filter(
                                    (entry: string) => entry !== descriptor.code,
                                  ),
                            )
                          }
                          type="checkbox"
                        />
                        <span>{descriptor.text[locale].label}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label htmlFor="food">{t("quickLog.food")}</label>
              <input
                id="food"
                maxLength={500}
                onChange={(event) => updateNote("foodText", event.target.value || undefined)}
                value={draft.notePayload.foodText ?? ""}
              />
              <label htmlFor="comment">{t("quickLog.comment")}</label>
              <textarea
                id="comment"
                maxLength={2000}
                onChange={(event) => updateNote("comment", event.target.value || undefined)}
                rows={4}
                value={draft.notePayload.comment ?? ""}
              />
            </div>
          ) : (
            <p className="section-help">{t("quickLog.logOnlyHelp")}</p>
          )}
        </fieldset>

        <p className="local-save-state" role="status">
          {t("quickLog.autosave")}
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="primary-button" type="submit">
          {t("quickLog.reviewAction")}
        </button>
      </form>

      <ModalDialog
        labelledBy="confirm-wine-title"
        onDismiss={() => setReviewing(false)}
        open={reviewing}
      >
        <p className="eyebrow">{t("quickLog.confirmEyebrow")}</p>
        <h2 id="confirm-wine-title">{t("quickLog.confirmTitle")}</h2>
        <dl className="review-list">
          <div>
            <dt>{t("quickLog.producer")}</dt>
            <dd>{draft.winePayload.producerName}</dd>
          </div>
          <div>
            <dt>{t("quickLog.wineName")}</dt>
            <dd>{draft.winePayload.displayName}</dd>
          </div>
          <div>
            <dt>{t("quickLog.vintage")}</dt>
            <dd>
              {draft.winePayload.nonVintage
                ? t("quickLog.nonVintageShort")
                : (draft.winePayload.vintageYear ?? "—")}
            </dd>
          </div>
          <div>
            <dt>{t("quickLog.photoTitle")}</dt>
            <dd>
              {draft.photo === undefined ? t("quickLog.noPhoto") : t("quickLog.privatePhoto")}
            </dd>
          </div>
        </dl>
        <p>{t("quickLog.confirmHelp")}</p>
        <div className="hero__actions">
          <button className="primary-button" onClick={() => void confirm()} type="button">
            {t("quickLog.confirmAction")}
          </button>
          <button
            className="action-link action-link--secondary"
            onClick={() => setReviewing(false)}
            type="button"
          >
            {t("quickLog.editAction")}
          </button>
        </div>
      </ModalDialog>
    </section>
  );
}
