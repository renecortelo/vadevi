import { ConnectionStatus } from "./ConnectionStatus";
import { NavLink, Outlet } from "react-router";
import { useTranslation } from "react-i18next";

const navigation = [
  { to: "/", key: "home", glyph: "⌂", end: true },
  { to: "/log/new", key: "log", glyph: "+", end: false },
  { to: "/sessions", key: "sessions", glyph: "◇", end: false },
  { to: "/memory", key: "memory", glyph: "▦", end: false },
  { to: "/vicenc", key: "assistant", glyph: "✦", end: false },
] as const;

export function AppShell() {
  const { t } = useTranslation();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t("skipToContent")}
      </a>

      <header className="topbar">
        <NavLink aria-label={t("appName")} className="wordmark" to="/">
          {t("appName")}
        </NavLink>
        <div className="topbar__context">
          <span className="space-chip">{t("previewSpace")}</span>
          <ConnectionStatus />
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
    </div>
  );
}
