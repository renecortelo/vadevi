import { Component, type ErrorInfo, type ReactNode, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

/**
 * What stands between one screen's mistake and a blank page.
 *
 * Suspense catches a screen that is not ready yet; nothing caught a screen
 * that threw — a date field cleared to nothing, a chunk the deploy replaced
 * under an open tab — and React unmounted the whole tree to white, with no
 * message and no way back that did not start with the address bar. A boundary
 * keeps the failure to the screen it happened on and offers the two things
 * that fix nearly all of them: trying the screen again, and reloading the app.
 *
 * Nothing about the error leaves the device. It is written to the console for
 * whoever is looking; there is no telemetry to send it to, by design.
 */
type State = { error: Error | null };

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode },
  State
> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("A screen failed to render and was caught by its boundary.", error, info);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;
    return this.props.fallback(this.state.error, () => this.setState({ error: null }));
  }
}

/**
 * A chunk the deploy replaced under an open tab: the import fails, and the
 * only cure is a reload, which fetches the new one. Recognised by the message
 * the browsers give it, since there is no standard error for it.
 */
function isStaleChunkError(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(
    `${error.name} ${error.message}`,
  );
}

/**
 * The screen a caught error is replaced with: named, explained, and with a
 * way out. Focus moves to the heading so a keyboard or screen-reader user
 * lands on the explanation rather than wherever focus was when the tree went.
 */
export function ErrorFallback({
  error,
  home = false,
  reset,
}: {
  error: Error;
  /** Offer the way back to the start — for a boundary inside the shell. */
  home?: boolean;
  reset: () => void;
}) {
  const { t } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const stale = isStaleChunkError(error);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <section aria-live="assertive" className="empty-state error-fallback" role="alert">
      <h1 ref={heading} tabIndex={-1}>
        {t("errorBoundary.title")}
      </h1>
      <p>{t(stale ? "errorBoundary.staleBody" : "errorBoundary.body")}</p>
      <div className="hero__actions">
        {stale ? null : (
          <button className="action-link action-link--primary" onClick={reset} type="button">
            {t("errorBoundary.retry")}
          </button>
        )}
        <button
          className={`action-link ${stale ? "action-link--primary" : "action-link--secondary"}`}
          onClick={() => globalThis.location.reload()}
          type="button"
        >
          {t("errorBoundary.reload")}
        </button>
        {home ? (
          <Link className="action-link action-link--quiet" onClick={reset} to="/">
            {t("errorBoundary.home")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
