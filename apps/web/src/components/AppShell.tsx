import type { BootstrapResponse } from "@vadevi/contracts";
import { ConnectionStatus } from "./ConnectionStatus";
import { ThemeToggle } from "./ThemeToggle";
import { SyncStatus } from "./SyncStatus";
import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";

import { webEnvironment } from "../config/env";
import { useSession } from "../session/SessionContext";

type SpaceOption = BootstrapResponse["data"]["spaces"][number];

const navigation = [
  { to: "/", key: "home", glyph: "⌂", end: true },
  { to: "/log/new", key: "log", glyph: "+", end: false },
  { to: "/sessions", key: "sessions", glyph: "◇", end: false },
  { to: "/memory", key: "memory", glyph: "▦", end: false },
  { to: "/vicenc", key: "assistant", glyph: "✦", end: false },
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

      <header className="topbar">
        <NavLink aria-label={t("appName")} className="wordmark" to="/">
          {/* The brand sets the name as one lowercase word. The accessible name
              stays the translated "Va de Vi" via aria-label above. */}
          <span aria-hidden="true">vadevi</span>
        </NavLink>
        <div className="topbar__context">
          <div className="space-context">
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
            <NavLink className="text-link" to="/spaces">
              {t("spaces.manageAction")}
            </NavLink>
            <NavLink className="text-link" to="/settings/data">
              {t("dataRights.navAction")}
            </NavLink>
          </div>
          <ThemeToggle />
          <ConnectionStatus />
          <SyncStatus />
          <button className="text-button" onClick={() => void signOut()} type="button">
            {t("auth.signOut")}
          </button>
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
            <span aria-hidden="true" className="nav-link__glyph">
              {item.glyph}
            </span>
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
