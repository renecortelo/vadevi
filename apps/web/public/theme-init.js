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

/**
 * If the application has not started after a while, say so.
 *
 * The boot content above is replaced the moment React mounts. When it is still
 * there after this long, something between the HTML and the first render has
 * failed — a bundle the network could not deliver, a module that threw — and a
 * mark breathing on its own forever is not an answer. This replaces it with one
 * line in the reader's stored language and a way to try again.
 *
 * Lives here rather than inline for the same reason as the theme: the deployed
 * policy allows no inline script.
 */
(function watchForStalledBoot() {
  var copy = {
    ca: "Va de Vi no ha pogut arrencar. Comprova la connexió i torna a obrir-la.",
    de: "Va de Vi konnte nicht starten. Prüfe die Verbindung und öffne es erneut.",
    en: "Va de Vi could not start. Check your connection and open it again.",
    es: "Va de Vi no pudo arrancar. Comprueba la conexión y vuelve a abrirla.",
    fr: "Va de Vi n’a pas pu démarrer. Vérifiez la connexion et rouvrez-la.",
    it: "Va de Vi non è riuscito ad avviarsi. Controlla la connessione e riaprilo.",
    nl: "Va de Vi kon niet starten. Controleer de verbinding en open het opnieuw.",
    "pt-PT": "O Va de Vi não conseguiu arrancar. Verifica a ligação e volta a abri-lo.",
  };
  var retry = { ca: "Tornar-ho a provar", de: "Erneut versuchen", en: "Try again", es: "Reintentar",
    fr: "Réessayer", it: "Riprova", nl: "Opnieuw proberen", "pt-PT": "Tentar de novo" };
  window.setTimeout(function () {
    var boot = document.getElementById("boot");
    if (!boot || !boot.isConnected) return;
    var locale = "en";
    try {
      var stored = window.localStorage.getItem("vadevi.locale");
      if (stored && copy[stored]) locale = stored;
    } catch (error) {
      // No storage: English is fine for a line that says "try again".
    }
    boot.className += " boot--stalled";
    var note = document.createElement("p");
    note.className = "boot__note";
    note.textContent = copy[locale];
    var button = document.createElement("button");
    button.className = "boot__retry";
    button.type = "button";
    button.textContent = retry[locale];
    button.addEventListener("click", function () {
      window.location.reload();
    });
    boot.appendChild(note);
    boot.appendChild(button);
  }, 10000);
})();
