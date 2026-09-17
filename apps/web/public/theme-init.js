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
  var stored = null;
  try {
    stored = window.localStorage.getItem("vadevi.theme");
  } catch (error) {
    // A browser that refuses storage simply gets the system preference.
  }
  if (stored === "light" || stored === "dark") {
    document.documentElement.setAttribute("data-theme", stored);
  }
  // The browser paints its own chrome from this tag before the application
  // runs, so a dark member would otherwise get a cream status bar for the first
  // frame. Kept in step with the palette in packages/ui/src/styles/tokens.css.
  var prefersDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var resolved = stored === null ? (prefersDark ? "dark" : "light") : stored;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#2b0709" : "#fbeee5");
})();
