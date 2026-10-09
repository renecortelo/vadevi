import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";

import {
  getGrapeProposals,
  getProducerProposals,
  getRegionProposals,
  renameGrapes,
  renameProducers,
  renameRegions,
} from "../services/regions";
import { useSession } from "../session/SessionContext";

/** A group of spellings to rename as one, whatever it names. */
type Proposal = Readonly<{
  from: { name: string; wines: number }[];
  reason: "grapes" | "producers" | "typo" | "variants";
  to: string;
  unchanged: number;
}>;

/**
 * Tidying the active Space's names: a region or a producer written several
 * ways, or a region one letter from a registered name, each offered to
 * confirm. Only a confirmed group is rewritten; every wine keeps its name
 * otherwise.
 */
export function RegionTidyPage() {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const queryClient = useQueryClient();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const space = bootstrap.data.spaces.find((entry) => entry.id === spaceId);
  const regions = useQuery({
    enabled: user !== null,
    queryFn: ({ signal }) => getRegionProposals(user!, spaceId, signal),
    queryKey: ["region-proposals", spaceId],
  });
  const producers = useQuery({
    enabled: user !== null,
    queryFn: ({ signal }) => getProducerProposals(user!, spaceId, signal),
    queryKey: ["producer-proposals", spaceId],
  });
  const grapes = useQuery({
    enabled: user !== null,
    queryFn: ({ signal }) => getGrapeProposals(user!, spaceId, locale, signal),
    queryKey: ["grape-proposals", spaceId, locale],
  });
  const [skipped, setSkipped] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const keyOf = (proposal: Proposal) =>
    `${proposal.reason}|${proposal.to}|${proposal.from.map((entry) => entry.name).join("|")}`;
  const regionProposals: Proposal[] = (regions.data ?? []).map((proposal) => ({
    from: proposal.from.map((entry) => ({ name: entry.region, wines: entry.wines })),
    reason: proposal.reason,
    to: proposal.to,
    unchanged: proposal.unchanged,
  }));
  const producerProposals: Proposal[] = (producers.data ?? []).map((proposal) => ({
    from: proposal.from.map((entry) => ({ name: entry.producer, wines: entry.wines })),
    reason: "producers",
    to: proposal.to,
    unchanged: proposal.unchanged,
  }));

  const grapeProposals: Proposal[] = (grapes.data ?? []).map((proposal) => ({
    from: proposal.from.map((entry) => ({ name: entry.grape, wines: entry.wines })),
    reason: "grapes",
    to: proposal.to,
    unchanged: proposal.unchanged,
  }));

  async function apply(proposal: Proposal) {
    if (user === null) return;
    const key = keyOf(proposal);
    const to = (targets[key] ?? proposal.to).trim();
    if (to.length === 0) return;
    setWorking(key);
    setNotice(null);
    try {
      const from = proposal.from.map((entry) => entry.name);
      const renamed =
        proposal.reason === "producers"
          ? await renameProducers(user, spaceId, from, to)
          : proposal.reason === "grapes"
            ? await renameGrapes(user, spaceId, from, to)
            : await renameRegions(user, spaceId, from, to);
      setNotice(t("regionTidy.done", { count: renamed, name: to }));
      // The counts and the profile read these names too.
      await Promise.all([
        regions.refetch(),
        producers.refetch(),
        grapes.refetch(),
        queryClient.invalidateQueries({ queryKey: ["stats"] }),
        queryClient.invalidateQueries({ queryKey: ["taste-profile"] }),
      ]);
    } catch {
      setNotice(t("regionTidy.error"));
    } finally {
      setWorking(null);
    }
  }

  const list = (proposals: Proposal[], loading: boolean, failed: boolean, empty: string) => {
    const shown = proposals.filter((proposal) => !skipped.includes(keyOf(proposal)));
    if (loading || failed) {
      return (
        <p role={failed ? "alert" : "status"}>{failed ? t("stats.error") : t("stats.loading")}</p>
      );
    }
    if (shown.length === 0) return <p className="settings-card">{empty}</p>;
    return shown.map((proposal) => {
      const key = keyOf(proposal);
      return (
        <section className="settings-card region-proposal" key={key}>
          <p className="eyebrow">{t(`regionTidy.reason.${proposal.reason}`)}</p>
          <ul className="stats-list">
            {proposal.from.map((entry) => (
              <li key={entry.name}>
                <strong>{entry.name}</strong>{" "}
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
    });
  };

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
      <h2>{t("regionTidy.regionsTitle")}</h2>
      {list(
        regionProposals,
        regions.data === undefined && !regions.isError,
        regions.isError,
        t("regionTidy.empty"),
      )}
      <h2>{t("regionTidy.producersTitle")}</h2>
      {list(
        producerProposals,
        producers.data === undefined && !producers.isError,
        producers.isError,
        t("regionTidy.producersEmpty"),
      )}
      <h2>{t("regionTidy.grapesTitle")}</h2>
      {list(
        grapeProposals,
        grapes.data === undefined && !grapes.isError,
        grapes.isError,
        t("regionTidy.grapesEmpty"),
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
