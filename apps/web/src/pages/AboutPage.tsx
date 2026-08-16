import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { webEnvironment } from "../config/env";

/**
 * About: the screen the top bar used to be.
 *
 * Data and privacy, Space management and the source offer were links competing
 * for room beside the Space menu. They are consulted rarely and read carefully
 * when they are, so they belong on a page rather than in a bar.
 */
export function AboutPage() {
  const { t } = useTranslation();

  const destinations = [
    { body: t("about.dataBody"), title: t("dataRights.navAction"), to: "/settings/data" },
    { body: t("about.spacesBody"), title: t("spaces.manageAction"), to: "/spaces" },
  ];

  return (
    <section className="about-page">
      <p className="eyebrow">{t("about.eyebrow")}</p>
      <h1>{t("about.title")}</h1>
      <p>{t("about.body")}</p>

      <ul className="about-list">
        {destinations.map((destination) => (
          <li key={destination.to}>
            <Link to={destination.to}>
              <h2>{destination.title}</h2>
              <p>{destination.body}</p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="about-license">
        <h2>{t("about.licenseTitle")}</h2>
        <p>{t("about.licenseBody")}</p>
        {/*
          AGPL-3.0 §13: anyone interacting with this application over a network
          must be offered its Corresponding Source. The shell's footer carries
          the same offer; this is where someone looking for it would look.
        */}
        <a
          className="action-link"
          href={webEnvironment.sourceUrl}
          rel="noreferrer noopener"
          target="_blank"
        >
          {t("licenseSource")}
        </a>
      </div>
    </section>
  );
}
