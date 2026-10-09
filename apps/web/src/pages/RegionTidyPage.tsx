import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RegionProposal } from "@vadevi/contracts";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { getRegionProposals, renameRegions } from "../services/regions";
import { useSession } from "../session/SessionContext";

/**
 * Tidying the active Space's regions: the same place written several ways,
 * or a name one letter from a registered one, each offered to confirm. Only
 * a confirmed group is rewritten; every wine keeps its region otherwise.
 */
export function RegionTidyPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const queryClient = useQueryClient();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const space = bootstrap.data.spaces.find((entry) => entry.id === spaceId);
  const query = useQuery({
    enabled: user !== null,
    queryFn: ({ signal }) => getRegionProposals(user!, spaceId, signal),
    queryKey: ["region-proposals", spaceId],
  });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const keyOf = (proposal: RegionProposal) =>
    `${proposal.to}|${proposal.from.map((entry) => entry.region).join("|")}`;
  const shown = (query.data ?? []).filter((proposal) => !skipped.includes(keyOf(proposal)));

  async function apply(proposal: RegionProposal) {
    if (user === null) return;
    const key = keyOf(proposal);
    const to = (targets[key] ?? proposal.to).trim();
    if (to.length === 0) return;
    setWorking(key);
    setNotice(null);
    try {
      const renamed = await renameRegions(
        user,
        spaceId,
        proposal.from.map((entry) => entry.region),
        to,
      );
      setNotice(t("regionTidy.done", { count: renamed, name: to }));
      // The counts and the profile read regions too.
      await Promise.all([
        query.refetch(),
        queryClient.invalidateQueries({ queryKey: ["stats"] }),
        queryClient.invalidateQueries({ queryKey: ["taste-profile"] }),
      ]);
    } catch {
      setNotice(t("regionTidy.error"));
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="library-page taste-page">
      <header className="page-heading">
        <div>
          <p className="eyebrow">{space?.name ?? t("regionTidy.eyebrow")}</p>
          <h1>{t("regionTidy.title")}</h1>
          <p>{t("regionTidy.intro")}</p>
        </div>
      </header>
      {notice === null ? null : (
        <p className="settings-card" role="status">
          {notice}
        </p>
      )}
      {query.data === undefined ? (
        <p role={query.isError ? "alert" : "status"}>
          {query.isError ? t("stats.error") : t("stats.loading")}
        </p>
      ) : shown.length === 0 ? (
        <p className="settings-card">{t("regionTidy.empty")}</p>
      ) : (
        shown.map((proposal) => {
          const key = keyOf(proposal);
          return (
            <section className="settings-card region-proposal" key={key}>
              <p className="eyebrow">{t(`regionTidy.reason.${proposal.reason}`)}</p>
              <ul className="stats-list">
                {proposal.from.map((entry) => (
                  <li key={entry.region}>
                    <strong>{entry.region}</strong>{" "}
                    <span className="section-help">
                      · {t("regionTidy.wines", { count: entry.wines })}
                    </span>
                  </li>
                ))}
              </ul>
              <label className="taste-form__field">
                <span>{t("regionTidy.to")}</span>
                <input
                  maxLength={160}
                  onChange={(event) => setTargets({ ...targets, [key]: event.target.value })}
                  value={targets[key] ?? proposal.to}
                />
              </label>
              {proposal.unchanged === 0 ? null : (
                <p className="section-help">
                  {t("regionTidy.unchanged", { count: proposal.unchanged })}
                </p>
              )}
              <div className="taste-form__actions">
                <button
                  className="action-link action-link--primary"
                  disabled={working !== null}
                  onClick={() => void apply(proposal)}
                  type="button"
                >
                  {working === key ? t("regionTidy.applying") : t("regionTidy.apply")}
                </button>
                <button
                  className="action-link action-link--secondary"
                  onClick={() => setSkipped([...skipped, key])}
                  type="button"
                >
                  {t("regionTidy.skip")}
                </button>
              </div>
            </section>
          );
        })
      )}
      <p className="section-help taste-links">
        <Link className="text-link" to="/stats">
          {t("stats.title")}
        </Link>
        <Link className="text-link" to="/memory">
          {t("nav.memory")}
        </Link>
      </p>
    </section>
  );
}
