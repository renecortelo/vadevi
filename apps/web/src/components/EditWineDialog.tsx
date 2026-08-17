import type { WineSummary } from "@vadevi/contracts";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
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

  async function save(event: FormEvent) {
    event.preventDefault();
    if (user === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateWine(user, bootstrap.data.user.activeSpaceId, wine.id, {
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
        <div className="hero__actions">
          <button className="primary-button" disabled={saving} type="submit">
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
