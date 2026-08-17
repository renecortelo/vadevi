import type { WineSummary } from "@vadevi/contracts";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { preprocessImage } from "../media/image";
import { createIdempotencyKey } from "../security/idempotency";
import { reserveMedia, uploadMedia } from "../services/api";
import { updateWine } from "../services/cellar";
import { useSession } from "../session/SessionContext";
import { ModalDialog } from "./ModalDialog";

/**
 * Correct a wine after it exists.
 *
 * A bottle logged in a restaurant is logged in a hurry — the vintage guessed,
 * the producer half-read. Until now the only way to change any of it was to log
 * the bottle again, which leaves two wines where there is one bottle.
 *
 * The version travels with the edit, so two people correcting the same wine get
 * a conflict rather than one of them quietly losing their work.
 */
export function EditWineDialog({
  onClose,
  onSaved,
  wine,
}: {
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  wine: WineSummary;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const [producerName, setProducerName] = useState(wine.producerName);
  const [displayName, setDisplayName] = useState(wine.displayName);
  const [vintageYear, setVintageYear] = useState(
    wine.vintageYear === null ? "" : String(wine.vintageYear),
  );
  const [region, setRegion] = useState(wine.region ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<"conflict" | "failed" | null>(null);
  // A photograph chosen here is held until the edit is saved, so cancelling
  // leaves nothing uploaded and nothing to clean up.
  const [photo, setPhoto] = useState<Awaited<ReturnType<typeof preprocessImage>> | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const preview = useMemo(() => (photo === null ? null : URL.createObjectURL(photo.blob)), [photo]);
  useEffect(
    () => () => {
      if (preview !== null) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function choosePhoto(file: File | undefined) {
    if (file === undefined) return;
    setPhotoError(false);
    setPhotoBusy(true);
    try {
      // The same downscale-and-strip the Quick Log uses: the original never
      // leaves the device, and its location metadata never leaves the file.
      setPhoto(await preprocessImage(file));
    } catch {
      setPhotoError(true);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (user === null || saving) return;
    setSaving(true);
    setError(null);
    const spaceId = bootstrap.data.user.activeSpaceId;
    try {
      // The photograph is reserved and uploaded first, so the wine is only
      // pointed at media that already exists.
      let mediaId: string | undefined;
      if (photo !== null) {
        const reservation = await reserveMedia(
          user,
          spaceId,
          {
            byteSize: photo.byteSize,
            height: photo.height,
            kind: "label",
            mimeType: photo.mimeType,
            sha256: photo.sha256,
            width: photo.width,
          },
          createIdempotencyKey(),
        );
        mediaId = await uploadMedia(user, reservation.data.uploadPath, photo.blob);
      }
      await updateWine(user, spaceId, wine.id, {
        ...(mediaId === undefined ? {} : { mediaId }),
        displayName: displayName.trim(),
        producerName: producerName.trim(),
        region: region.trim().length === 0 ? null : region.trim(),
        version: wine.version,
        vintageYear: vintageYear.trim().length === 0 ? null : Number(vintageYear),
      });
      await onSaved();
      onClose();
    } catch (cause) {
      // A conflict is not a failure: someone else got there first, and saying so
      // is the difference between "try again" and "your work is gone".
      const status = (cause as { status?: number }).status;
      setError(status === 409 ? "conflict" : "failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalDialog labelledBy="edit-wine-title" onDismiss={onClose} open>
      <h2 id="edit-wine-title">{t("memory.editTitle")}</h2>
      <form className="field-stack" onSubmit={(event) => void save(event)}>
        <label htmlFor="edit-producer">{t("quickLog.producer")}</label>
        <input
          id="edit-producer"
          maxLength={160}
          onChange={(event) => setProducerName(event.target.value)}
          required
          value={producerName}
        />
        <label htmlFor="edit-name">{t("quickLog.wineName")}</label>
        <input
          id="edit-name"
          maxLength={160}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          value={displayName}
        />
        <label htmlFor="edit-vintage">{t("quickLog.vintage")}</label>
        <input
          id="edit-vintage"
          inputMode="numeric"
          onChange={(event) => setVintageYear(event.target.value)}
          value={vintageYear}
        />
        <label htmlFor="edit-region">{t("quickLog.region")}</label>
        <input
          id="edit-region"
          maxLength={160}
          onChange={(event) => setRegion(event.target.value)}
          value={region}
        />
        {/* The label the hurried entry never had. */}
        <label className="photo-picker">
          <span>{photoBusy ? t("quickLog.photoProcessing") : t("memory.editPhotoAction")}</span>
          <input
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            disabled={photoBusy || saving}
            onChange={(event) => void choosePhoto(event.target.files?.[0])}
            type="file"
          />
        </label>
        {preview === null ? null : (
          <div className="photo-preview">
            <img alt={t("quickLog.photoPreviewAlt")} src={preview} />
            <button
              className="text-button text-button--danger"
              onClick={() => setPhoto(null)}
              type="button"
            >
              {t("quickLog.photoRemove")}
            </button>
          </div>
        )}
        {photoError ? (
          <p className="form-error" role="alert">
            {t("quickLog.photoError")}
          </p>
        ) : null}

        <div className="hero__actions">
          <button className="primary-button" disabled={saving || photoBusy} type="submit">
            {saving ? t("memory.editSaving") : t("memory.editSave")}
          </button>
          <button className="action-link action-link--secondary" onClick={onClose} type="button">
            {t("memory.editCancel")}
          </button>
        </div>
        {error === null ? null : (
          <p className="form-error" role="alert">
            {t(error === "conflict" ? "memory.editConflict" : "memory.editError")}
          </p>
        )}
      </form>
    </ModalDialog>
  );
}
