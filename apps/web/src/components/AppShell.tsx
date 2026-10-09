import type { BootstrapResponse } from "@vadevi/contracts";
import {
  BarrelIcon,
  WineryIcon,
  CrateIcon,
  GrapesIcon,
  PourIcon,
  ToastIcon,
} from "../brand/NavIcons";
import { BrandLockup } from "../brand/Wordmark";
import { ConnectionStatus } from "./ConnectionStatus";
import { LocaleToggle } from "./LocaleToggle";
import { ThemeButton } from "./ThemeToggle";
import { SyncStatus } from "./SyncStatus";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from "react-router";
import { useTranslation } from "react-i18next";

import { useSession } from "../session/SessionContext";

type SpaceOption = BootstrapResponse["data"]["spaces"][number];

const navigation = [
  { to: "/", key: "home", Icon: WineryIcon, end: true },
  { to: "/log/new", key: "log", Icon: PourIcon, end: false },
  { to: "/sessions", key: "sessions", Icon: ToastIcon, end: false },
  { to: "/memory", key: "memory", Icon: CrateIcon, end: false },
  { to: "/vicenc", key: "assistant", Icon: GrapesIcon, end: false },
  { to: "/about", key: "about", Icon: BarrelIcon, end: false },
] as const;

/**
 * The value that turns the Space menu into a way to reach Space management.
 * A menu that also performs an action is a compromise — it is chosen here
 * because the alternative was a separate link crowding the bar, and because the
 * option reads as a destination rather than as a Space. The selection is put
 * back immediately, so the menu never appears to hold a Space you are not in.
 */
const manageSpacesValue = "__manage__";

/** The name the server gives every personal Space when it is created. */
const defaultPersonalName = "Personal space";

export function AppShell() {
  const { bootstrap, isUpdating, signOut, updateProfile } = useSession();
  const { t } = useTranslation();
  const navigate = useNavigate();
  // A new page opens at its top. It used to keep the last page's scroll, so a
  // wine opened from far down a list opened halfway down, its way back out of
  // sight. Going back keeps the browser's own place; a change of filter on the
  // same page is not a new page.
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    if (navigationType !== "POP") globalThis.scrollTo?.(0, 0);
  }, [navigationType, pathname]);
  const [switchError, setSwitchError] = useState(false);
  const activeSpaceId = bootstrap.data.user.activeSpaceId;

  async function switchSpace(value: string) {
    if (value === manageSpacesValue) {
      void navigate("/spaces");
      return;
    }
    setSwitchError(false);
    try {
      await updateProfile({ activeSpaceId: value });
    } catch {
      setSwitchError(true);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>

      {/* The wordmark is a sibling of the bars rather than a child, so it can
          head the navigation column on wide viewports and sit beside the status
          on narrow ones without the markup changing. */}
      <NavLink aria-label={t("appName")} className="wordmark" to="/">
        {/* Decorative; the accessible name is the aria-label above. */}
        <BrandLockup />
      </NavLink>

      {/* Beside the brand: what you glance at, and the way out. */}
      <header className="topbar">
        <div className="topbar__status">
          <ConnectionStatus />
          <SyncStatus />
        </div>
        {/* The reader's own settings, small, beside the way out: a language
            code and a sun or a moon. */}
        <div className="topbar__preferences">
          <LocaleToggle />
          <ThemeButton />
          <button className="text-button" onClick={() => void signOut()} type="button">
            {t("auth.signOut")}
          </button>
        </div>
      </header>

      {/* Below it: the Space, the one menu worth its full width. Everything
          that used to sit here as a link now lives on the About screen. */}
      <div className="controlbar">
        <div className="space-switcher">
          <label className="sr-only" htmlFor="active-space">
            {t("space.switchLabel")}
          </label>
          <select
            aria-busy={isUpdating}
            disabled={isUpdating}
            id="active-space"
            onChange={(event) => void switchSpace(event.target.value)}
            value={activeSpaceId}
          >
            {bootstrap.data.spaces.map((space: SpaceOption) => (
              <option key={space.id} value={space.id}>
                {/* The personal Space is created with an English name before
                    the reader has chosen a language; until they rename it,
                    it is called what their language calls it. */}
                {space.type === "personal" && space.name === defaultPersonalName
                  ? t("spaces.type.personal")
                  : space.name}
              </option>
            ))}
            <option value={manageSpacesValue}>{t("spaces.manageAction")}</option>
          </select>
          {switchError ? (
            <span className="form-error" role="alert">
              {t("space.switchError")}
            </span>
          ) : null}
        </div>
      </div>

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
    </div>
  );
}
