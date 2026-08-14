import type { WineSummary } from "@vadevi/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { offlineDatabase } from "../offline/database";
import { useOfflineSync } from "../offline/OfflineSyncContext";
import { queueNewSession } from "../offline/phase3";
import { getWineMemory } from "../services/api";
import { useSession } from "../session/SessionContext";

function localDateTime(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function NewSessionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const { flush, refreshStatus } = useOfflineSync();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const userId = user?.uid ?? "";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [venue, setVenue] = useState("");
  const [startsAt, setStartsAt] = useState(() => localDateTime(new Date()));
  const [status, setStatus] = useState<"active" | "draft">("active");
  const [wines, setWines] = useState<WineSummary[]>([]);
  const [selectedWineIds, setSelectedWineIds] = useState<string[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const loadCached = async () => {
      const snapshots = await offlineDatabase.snapshots
        .where("[userId+spaceId]")
        .equals([userId, spaceId])
        .toArray();
      setWines(snapshots.map((snapshot) => snapshot.wine));
    };
    if (user === null || !navigator.onLine) void loadCached();
    else {
      void getWineMemory(user, spaceId, { limit: 100 }, controller.signal)
        .then((response) => setWines(response.data))
        .catch(loadCached);
    }
    return () => controller.abort();
  }, [spaceId, user, userId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user === null || name.trim().length === 0) return;
    setError(false);
    try {
      const selected = wines.filter((wine) => selectedWineIds.includes(wine.id));
      const sessionId = await queueNewSession({
        createdByUserId: bootstrap.data.user.id,
        request: {
          ...(description.trim().length === 0 ? {} : { description: description.trim() }),
          name: name.trim(),
          startsAt: new Date(startsAt).toISOString(),
          status,
          ...(venue.trim().length === 0 ? {} : { venueText: venue.trim() }),
        },
        selectedWines: selected,
        spaceId,
        userId: user.uid,
      });
      await refreshStatus();
      if (navigator.onLine) void flush(spaceId);
      void navigate(`/sessions/${sessionId}`);
    } catch {
      setError(true);
    }
  }

  return (
    <section className="sessions-page">
      <header className="page-heading">
        <p className="eyebrow">{t("sessions.newEyebrow")}</p>
        <h1>{t("sessions.newTitle")}</h1>
        <p>{t("sessions.newBody")}</p>
      </header>
      <form className="quick-log-form" onSubmit={(event) => void submit(event)}>
        <fieldset className="form-section">
          <legend>{t("sessions.detailsTitle")}</legend>
          <label htmlFor="session-name">{t("sessions.nameLabel")}</label>
          <input
            id="session-name"
            maxLength={160}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <div className="form-grid">
            <label>
              <span>{t("sessions.startsAtLabel")}</span>
              <input
                onChange={(event) => setStartsAt(event.target.value)}
                required
                type="datetime-local"
                value={startsAt}
              />
            </label>
            <label>
              <span>{t("sessions.statusLabel")}</span>
              <select
                onChange={(event) => setStatus(event.target.value as "active" | "draft")}
                value={status}
              >
                <option value="draft">{t("sessions.status.draft")}</option>
                <option value="active">{t("sessions.status.active")}</option>
              </select>
            </label>
          </div>
          <label htmlFor="session-venue">{t("sessions.venueLabel")}</label>
          <input
            id="session-venue"
            maxLength={300}
            onChange={(event) => setVenue(event.target.value)}
            value={venue}
          />
          <label htmlFor="session-description">{t("sessions.descriptionLabel")}</label>
          <textarea
            id="session-description"
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            value={description}
          />
        </fieldset>
        <fieldset className="form-section">
          <legend>{t("sessions.flightTitle")}</legend>
          <p className="section-help">{t("sessions.flightHelp")}</p>
          {wines.length === 0 ? (
            <p>{t("sessions.noWines")}</p>
          ) : (
            <div className="wine-picker-grid">
              {wines.map((wine) => (
                <label className="wine-picker" key={wine.id}>
                  <input
                    checked={selectedWineIds.includes(wine.id)}
                    onChange={(event) =>
                      setSelectedWineIds((current) =>
                        event.target.checked
                          ? [...current, wine.id]
                          : current.filter((id) => id !== wine.id),
                      )
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>{wine.displayName}</strong>
                    <small>
                      {wine.producerName} · {wine.nonVintage ? "NV" : (wine.vintageYear ?? "—")}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <p className="local-save-state">{t("sessions.offlineReady")}</p>
        {error ? (
          <p className="form-error" role="alert">
            {t("sessions.saveError")}
          </p>
        ) : null}
        <div className="hero__actions">
          <button className="primary-button" type="submit">
            {t("sessions.createAction")}
          </button>
          <Link className="action-link action-link--secondary" to="/sessions">
            {t("spaces.cancelAction")}
          </Link>
        </div>
      </form>
    </section>
  );
}
