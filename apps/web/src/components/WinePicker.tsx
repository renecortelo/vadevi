import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { createIdempotencyKey } from "../security/idempotency";
import { createWineDirectly } from "../services/cellar";
import { useSession } from "../session/SessionContext";

/**
 * Choose a wine, or add one without leaving.
 *
 * The cellar, the wishlist and the price list all needed a wine before they
 * could record anything, and offered only a list of wines already saved. Buying
 * a bottle you had never logged meant leaving the screen, logging it, and
 * finding your way back — which is the wrong order for the thing you are
 * actually doing, which is recording a purchase.
 *
 * The new wine is created as a draft, exactly as Quick Log creates one. Nothing
 * here makes a wine canonical; confirming it does, wherever that happens.
 */

type PickableWine = { displayName: string; id: string; producerName: string };

/** The value that reveals the two fields, rather than selecting a wine. */
const addValue = "__add__";

export function WinePicker({
  label,
  onChange,
  onCreated,
  required = false,
  value,
  wines,
}: {
  label: string;
  onChange: (wineId: string) => void;
  /** Lets the screen reload its own list once a wine exists. */
  onCreated: (wineId: string) => Promise<void> | void;
  required?: boolean;
  value: string;
  wines: PickableWine[];
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const [adding, setAdding] = useState(false);
  const [producerName, setProducerName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const ready = producerName.trim().length > 0 && displayName.trim().length > 0;

  async function add(event: FormEvent) {
    // Nested inside the screen's own form, so the outer one must not submit.
    event.preventDefault();
    event.stopPropagation();
    if (user === null || !ready || saving) return;
    setSaving(true);
    setFailed(false);
    try {
      const created = await createWineDirectly(
        user,
        bootstrap.data.user.activeSpaceId,
        {
          displayName: displayName.trim(),
          identityStatus: "draft",
          nonVintage: false,
          producerName: producerName.trim(),
        },
        createIdempotencyKey(),
      );
      const wineId = created.data.wine.id;
      await onCreated(wineId);
      onChange(wineId);
      setAdding(false);
      setProducerName("");
      setDisplayName("");
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wine-picker-field">
      <label htmlFor="wine-picker">{label}</label>
      <select
        id="wine-picker"
        onChange={(event) => {
          if (event.target.value === addValue) {
            setAdding(true);
            return;
          }
          setAdding(false);
          onChange(event.target.value);
        }}
        required={required}
        value={adding ? addValue : value}
      >
        <option value="">{t("winePicker.choose")}</option>
        {wines.map((wine) => (
          <option key={wine.id} value={wine.id}>
            {wine.producerName} · {wine.displayName}
          </option>
        ))}
        <option value={addValue}>{t("winePicker.addOption")}</option>
      </select>

      {adding ? (
        <div className="wine-picker-new">
          <p className="cache-note">{t("winePicker.addHelp")}</p>
          <label htmlFor="new-wine-producer">{t("quickLog.producer")}</label>
          <input
            id="new-wine-producer"
            maxLength={160}
            onChange={(event) => setProducerName(event.target.value)}
            value={producerName}
          />
          <label htmlFor="new-wine-name">{t("quickLog.wineName")}</label>
          <input
            id="new-wine-name"
            maxLength={160}
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
          <div className="hero__actions">
            <button
              className="primary-button"
              disabled={!ready || saving}
              onClick={(event) => void add(event)}
              type="button"
            >
              {saving ? t("winePicker.adding") : t("winePicker.addAction")}
            </button>
            <button
              className="action-link action-link--secondary"
              onClick={() => setAdding(false)}
              type="button"
            >
              {t("winePicker.cancel")}
            </button>
          </div>
          {failed ? (
            <p className="form-error" role="alert">
              {t("winePicker.addError")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
