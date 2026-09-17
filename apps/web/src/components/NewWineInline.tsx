import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { createIdempotencyKey } from "../security/idempotency";
import { createWineDirectly } from "../services/cellar";
import { useSession } from "../session/SessionContext";

/**
 * Add a wine from wherever you needed one.
 *
 * The cellar, the wishlist, the price list and a tasting session all needed a
 * wine before they could record anything, and all four offered only wines
 * already saved. A session is the sharpest case: sitting down to taste bottles
 * you have never logged is the ordinary reason to open one.
 *
 * The wine is created as a draft, exactly as Quick Log creates one. Nothing here
 * makes a wine canonical; confirming it does, wherever that happens.
 */
export function NewWineInline({
  onCreated,
}: {
  /** Given the new wine, so a screen can select it as well as reload its list. */
  onCreated: (wineId: string) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const [producerName, setProducerName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const ready = producerName.trim().length > 0 && displayName.trim().length > 0;

  async function add(event: FormEvent) {
    // It can sit inside another form, which must not submit on its behalf.
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
      await onCreated(created.data.wine.id);
      setProducerName("");
      setDisplayName("");
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
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
      <button
        className="primary-button"
        disabled={!ready || saving}
        onClick={(event) => void add(event)}
        type="button"
      >
        {saving ? t("winePicker.adding") : t("winePicker.addAction")}
      </button>
      {failed ? (
        <p className="form-error" role="alert">
          {t("winePicker.addError")}
        </p>
      ) : null}
    </div>
  );
}
