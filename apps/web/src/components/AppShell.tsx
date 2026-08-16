import type { BootstrapResponse } from "@vadevi/contracts";
import { CellarIcon, GrapesIcon, LabelledBottleIcon, PourIcon, ToastIcon } from "../brand/NavIcons";
import { BrandLockup } from "../brand/Wordmark";
import { ConnectionStatus } from "./ConnectionStatus";
import { LocaleToggle } from "./LocaleToggle";
import { ThemeToggle } from "./ThemeToggle";
import { SyncStatus } from "./SyncStatus";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";

import { webEnvironment } from "../config/env";
import { useSession } from "../session/SessionContext";

type SpaceOption = BootstrapResponse["data"]["spaces"][number];

const navigation = [
  { to: "/", key: "home", Icon: CellarIcon, end: true },
  { to: "/log/new", key: "log", Icon: PourIcon, end: false },
  { to: "/sessions", key: "sessions", Icon: ToastIcon, end: false },
  { to: "/memory", key: "memory", Icon: LabelledBottleIcon, end: false },
  { to: "/vicenc", key: "assistant", Icon: GrapesIcon, end: false },
] as const;

export function AppShell() {
  const { bootstrap, isUpdating, signOut, updateProfile } = useSession();
  const { t } = useTranslation();
  const [switchError, setSwitchError] = useState(false);

  async function switchSpace(activeSpaceId: string) {
    setSwitchError(false);
    try {
      await updateProfile({ activeSpaceId });
    } catch {
      setSwitchError(true);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>

      {/* The wordmark is a sibling of the header rather than a child so it can
          occupy the navigation column on wide viewports, where the brand belongs
          above the navigation rather than beside the Space controls. */}
      <NavLink aria-label={t("appName")} className="wordmark" to="/">
        {/* The full lockup, not just the letters: this is the one place in the
            signed-in application where the brand appears, so it appears whole.
            Decorative — the accessible name stays the translated "Va de Vi" via
            aria-label above. */}
        <BrandLockup />
      </NavLink>

      {/*
        Two bands rather than one queue of eight controls. The first carries what
        you act on and what you need to glance at: which Space you are in, whether
        it is saved, and the way out. The second carries the things you set once
        and rarely touch again. The bar is not sticky, so it scrolls away as soon
        as you start reading.
      */}
      <header className="topbar">
        <div className="topbar__band topbar__band--primary">
          <div className="space-switcher">
            <label className="sr-only" htmlFor="active-space">
              {t("space.switchLabel")}
            </label>
            <select
              aria-busy={isUpdating}
              disabled={isUpdating}
              id="active-space"
              onChange={(event) => void switchSpace(event.target.value)}
              value={bootstrap.data.user.activeSpaceId}
            >
              {bootstrap.data.spaces.map((space: SpaceOption) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
            {switchError ? (
              <span className="form-error" role="alert">
                {t("space.switchError")}
              </span>
            ) : null}
          </div>

          <div className="topbar__status">
            <ConnectionStatus />
            <SyncStatus />
          </div>

          <button className="text-button" onClick={() => void signOut()} type="button">
            {t("auth.signOut")}
          </button>
        </div>

        <div className="topbar__band topbar__band--secondary">
          <nav aria-label={t("space.sectionLabel")} className="space-links">
            <NavLink className="text-link" to="/spaces">
              {t("spaces.manageAction")}
            </NavLink>
            <NavLink className="text-link" to="/settings/data">
              {t("dataRights.navAction")}
            </NavLink>
          </nav>

          <div className="topbar__preferences">
            <LocaleToggle />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <nav aria-label="Primary" className="primary-nav">
        {navigation.map((item) => (
          <NavLink
            className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
            end={item.end}
            key={item.key}
            to={item.to}
          >
            <item.Icon />
            <span>{t(`nav.${item.key}`)}</span>
          </NavLink>
        ))}
      </nav>

      <main className="main-content" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      {/*
        AGPL-3.0 §13: a user interacting with this application over a network
        must be offered its Corresponding Source. The link is part of the shell
        so the offer reaches every authenticated screen.
      */}
      <footer className="app-footer">
        <a href={webEnvironment.sourceUrl} rel="noreferrer noopener" target="_blank">
          {t("licenseSource")}
        </a>
      </footer>
    </div>
  );
}
