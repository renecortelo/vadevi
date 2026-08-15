/**
 * Applies the stored theme before the application renders.
 *
 * Without this the page paints in the default palette and then snaps to the
 * chosen one, which is a visible flash on every load. It is a separate file
 * rather than an inline script because the deployed Content-Security-Policy
 * sets `script-src 'self'` with no `unsafe-inline`.
 *
 * The value here is only a cache of the account preference; the server remains
 * the source of truth once bootstrap resolves.
 */
(function applyStoredTheme() {
  try {
    var stored = window.localStorage.getItem("vadevi.theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (error) {
    // A browser that refuses storage simply gets the system preference.
  }
})();
