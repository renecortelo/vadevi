import { useQuery } from "@tanstack/react-query";
import { Card } from "@vadevi/ui";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

import { getHealth } from "../services/api";

export function HomePage() {
  const { t } = useTranslation();
  const health = useQuery({
    queryKey: ["runtime", "health"],
    queryFn: ({ signal }) => getHealth(signal),
    retry: false,
    staleTime: 60_000,
  });

  const healthLabel = health.isPending
    ? t("healthChecking")
    : health.isSuccess
      ? t("healthReady")
      : t("healthUnavailable");

  return (
    <div className="home-page">
      <section className="hero">
        <p className="eyebrow">{t("phaseEyebrow")}</p>
        <h1>{t("welcomeTitle")}</h1>
        <p className="hero__lede">{t("welcomeBody")}</p>
        <div className="hero__actions">
          <Link className="action-link action-link--primary" to="/log/new">
            {t("quickLogCta")}
          </Link>
          <Link className="action-link action-link--secondary" to="/memory">
            {t("exploreMemory")}
          </Link>
        </div>
      </section>

      <section aria-labelledby="collection-tools-title" className="home-tools">
        <div>
          <p className="eyebrow">{t("homeTools.eyebrow")}</p>
          <h2 id="collection-tools-title">{t("homeTools.title")}</h2>
        </div>
        <div className="home-tools__grid">
          <Link to="/cellar">
            <strong>{t("homeTools.cellarTitle")}</strong>
            <span>{t("homeTools.cellarBody")}</span>
          </Link>
          <Link to="/wishlist">
            <strong>{t("homeTools.wishlistTitle")}</strong>
            <span>{t("homeTools.wishlistBody")}</span>
          </Link>
          <Link to="/shop">
            <strong>{t("homeTools.shopTitle")}</strong>
            <span>{t("homeTools.shopBody")}</span>
          </Link>
        </div>
      </section>

      <Card aria-labelledby="foundation-title" className="foundation-card">
        <div aria-hidden="true" className="foundation-card__mark">
          V
        </div>
        <div>
          <p className="eyebrow">Phase 0</p>
          <h2 id="foundation-title">{t("foundationTitle")}</h2>
          <p>{t("foundationBody")}</p>
          <p aria-live="polite" className="health-state" data-state={health.status}>
            {healthLabel}
          </p>
        </div>
      </Card>
    </div>
  );
}
