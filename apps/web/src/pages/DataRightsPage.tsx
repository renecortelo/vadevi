import type { DeletionJob, UsageReportResponse } from "@vadevi/contracts";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import {
  cancelSpaceDeletion,
  getSelectedMediaArchive,
  getSpaceCsvExport,
  getSpaceExport,
  getUsageReport,
  leaveSpace,
  scheduleAccountDeletion,
  scheduleSpaceDeletion,
} from "../services/data-rights";
import { useSession } from "../session/SessionContext";

const csvDatasets = ["wines", "tastings", "bottles", "purchases", "prices"] as const;
type CsvDataset = (typeof csvDatasets)[number];

type MediaChoice = { byteSize: number; id: string; kind: string };
type SpaceOption = { id: string; name: string; role: string; type: string };
type UsageCounter = UsageReportResponse["data"]["counters"][number];

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Data rights: export, media selection, leaving, and confirmed deletion, plus
 * the private usage report. Every destructive action here is explicit: the user
 * types the confirmation or selects the exact media before anything leaves or
 * is scheduled for removal.
 */
export function DataRightsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap, refresh } = useSession();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const space = bootstrap.data.spaces.find((entry: SpaceOption) => entry.id === spaceId);
  const isOwner = space?.role === "owner";
  const isPersonal = space?.type === "personal";

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<MediaChoice[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [confirmationText, setConfirmationText] = useState("");
  const [deletionJob, setDeletionJob] = useState<DeletionJob | null>(null);
  const [accountConfirm, setAccountConfirm] = useState("");

  const usageQuery = useQuery({
    enabled: user !== null,
    queryFn: ({ signal }) => getUsageReport(user!, spaceId, signal),
    queryKey: ["usage", spaceId],
  });
  const usage: UsageReportResponse["data"] | null = usageQuery.data?.data ?? null;

  async function run(action: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      setStatus(await action());
    } catch {
      setError(t("dataRights.actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function exportJson() {
    await run(async () => {
      const document_ = await getSpaceExport(user!, spaceId);
      download(
        new Blob([JSON.stringify(document_, null, 2)], { type: "application/json" }),
        "vadevi-export.json",
      );
      setMedia(
        (document_.data.media as MediaChoice[]).map((asset: MediaChoice) => ({
          byteSize: asset.byteSize,
          id: asset.id,
          kind: asset.kind,
        })),
      );
      return t("dataRights.exportReady", { version: document_.data.schemaVersion });
    });
  }

  async function exportCsv(dataset: CsvDataset) {
    await run(async () => {
      const csv = await getSpaceCsvExport(user!, spaceId, dataset);
      download(new Blob([csv], { type: "text/csv" }), `vadevi-${dataset}.csv`);
      return t("dataRights.csvReady", { dataset: t(`dataRights.dataset.${dataset}`) });
    });
  }

  async function exportMedia() {
    await run(async () => {
      const archive = await getSelectedMediaArchive(user!, spaceId, selectedMedia);
      download(archive, "vadevi-media.zip");
      return t("dataRights.mediaReady", { count: selectedMedia.length });
    });
  }

  async function scheduleDeletion() {
    await run(async () => {
      const job = await scheduleSpaceDeletion(user!, spaceId, confirmationText);
      setDeletionJob(job.data);
      setConfirmationText("");
      return t("dataRights.deletionScheduled");
    });
  }

  async function cancelDeletion() {
    await run(async () => {
      const job = await cancelSpaceDeletion(user!, spaceId);
      setDeletionJob(job.data);
      return t("dataRights.deletionCanceled");
    });
  }

  async function leave() {
    await run(async () => {
      await leaveSpace(user!, spaceId, false);
      await refresh();
      return t("dataRights.leftSpace");
    });
  }

  async function deleteAccount() {
    await run(async () => {
      const job = await scheduleAccountDeletion(user!);
      setAccountConfirm("");
      return t("dataRights.accountScheduled", { hours: job.data.gracePeriodSeconds / 3_600 });
    });
  }

  return (
    <section className="settings-page">
      <div className="settings-heading">
        <div>
          <p className="eyebrow">{t("dataRights.eyebrow")}</p>
          <h1>{t("dataRights.title")}</h1>
          <p>{t("dataRights.body")}</p>
        </div>
      </div>

      <section aria-labelledby="export-title" className="settings-card">
        <h2 id="export-title">{t("dataRights.exportTitle")}</h2>
        <p>{t("dataRights.exportBody")}</p>
        <div className="hero__actions">
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => void exportJson()}
            type="button"
          >
            {t("dataRights.exportJsonAction")}
          </button>
          {csvDatasets.map((dataset) => (
            <button
              className="action-link action-link--secondary"
              disabled={busy}
              key={dataset}
              onClick={() => void exportCsv(dataset)}
              type="button"
            >
              {t("dataRights.csvAction", { dataset: t(`dataRights.dataset.${dataset}`) })}
            </button>
          ))}
        </div>

        <h3>{t("dataRights.mediaTitle")}</h3>
        <p>{t("dataRights.mediaBody")}</p>
        {media.length === 0 ? (
          <p className="cache-note">{t("dataRights.mediaEmpty")}</p>
        ) : (
          <>
            <ul className="member-list">
              {media.map((asset) => (
                <li key={asset.id}>
                  <label>
                    <input
                      checked={selectedMedia.includes(asset.id)}
                      onChange={(event) =>
                        setSelectedMedia((current) =>
                          event.target.checked
                            ? [...current, asset.id]
                            : current.filter((id) => id !== asset.id),
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      {t(`dataRights.mediaKind.${asset.kind}`, { defaultValue: asset.kind })}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              className="primary-button"
              disabled={busy || selectedMedia.length === 0}
              onClick={() => void exportMedia()}
              type="button"
            >
              {t("dataRights.mediaAction", { count: selectedMedia.length })}
            </button>
          </>
        )}
      </section>

      <section aria-labelledby="usage-title" className="settings-card">
        <h2 id="usage-title">{t("dataRights.usageTitle")}</h2>
        <p>{t("dataRights.usageBody")}</p>
        {usage === null ? (
          <p className="cache-note">{t("dataRights.usageUnavailable")}</p>
        ) : (
          <>
            <p>
              {t("dataRights.providerModes", {
                ai: usage.providers.aiProvider,
                research: usage.providers.researchProvider,
              })}
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>{t("dataRights.usageMetric")}</th>
                    <th>{t("dataRights.usageScope")}</th>
                    <th>{t("dataRights.usageUsed")}</th>
                    <th>{t("dataRights.usageLimit")}</th>
                    <th>{t("dataRights.usageStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.counters.map((counter: UsageCounter) => (
                    <tr key={`${counter.metric}:${counter.scope}`}>
                      <td>{t(`dataRights.metric.${counter.metric}`)}</td>
                      <td>{t(`dataRights.scope.${counter.scope}`)}</td>
                      <td>{counter.used}</td>
                      <td>{counter.limit}</td>
                      <td>{t(`dataRights.budgetStatus.${counter.status}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="cache-note">{t("dataRights.usageResets", { date: usage.resetsAt })}</p>
          </>
        )}
      </section>

      {isPersonal ? null : (
        <section aria-labelledby="leave-title" className="settings-card">
          <h2 id="leave-title">{t("dataRights.leaveTitle")}</h2>
          <p>{t("dataRights.leaveBody")}</p>
          <button
            className="text-button text-button--danger"
            disabled={busy}
            onClick={() => void leave()}
            type="button"
          >
            {t("dataRights.leaveAction")}
          </button>
        </section>
      )}

      {isOwner && !isPersonal ? (
        <section aria-labelledby="delete-space-title" className="settings-card">
          <h2 id="delete-space-title">{t("dataRights.deleteSpaceTitle")}</h2>
          <p>{t("dataRights.deleteSpaceBody", { name: space?.name ?? "" })}</p>
          <label htmlFor="space-confirmation">{t("dataRights.confirmationLabel")}</label>
          <input
            id="space-confirmation"
            onChange={(event) => setConfirmationText(event.target.value)}
            value={confirmationText}
          />
          <div className="hero__actions">
            <button
              className="text-button text-button--danger"
              disabled={busy || confirmationText !== space?.name}
              onClick={() => void scheduleDeletion()}
              type="button"
            >
              {t("dataRights.deleteSpaceAction")}
            </button>
            {deletionJob !== null && deletionJob.state === "scheduled" ? (
              <button
                className="action-link action-link--secondary"
                disabled={busy}
                onClick={() => void cancelDeletion()}
                type="button"
              >
                {t("dataRights.cancelDeletionAction")}
              </button>
            ) : null}
          </div>
          {deletionJob !== null && deletionJob.state === "scheduled" ? (
            <p role="status">
              {t("dataRights.deletionPending", { purgeAfter: deletionJob.purgeAfter })}
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="delete-account-title" className="settings-card">
        <h2 id="delete-account-title">{t("dataRights.deleteAccountTitle")}</h2>
        <p>{t("dataRights.deleteAccountBody")}</p>
        <label htmlFor="account-confirmation">{t("dataRights.deleteAccountLabel")}</label>
        <input
          id="account-confirmation"
          onChange={(event) => setAccountConfirm(event.target.value)}
          value={accountConfirm}
        />
        <button
          className="text-button text-button--danger"
          disabled={busy || accountConfirm !== "DELETE"}
          onClick={() => void deleteAccount()}
          type="button"
        >
          {t("dataRights.deleteAccountAction")}
        </button>
      </section>

      <section aria-labelledby="retention-title" className="settings-card">
        <h2 id="retention-title">{t("dataRights.retentionTitle")}</h2>
        <p>{t("dataRights.retentionBody")}</p>
      </section>

      {status === null ? null : <p role="status">{status}</p>}
      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
