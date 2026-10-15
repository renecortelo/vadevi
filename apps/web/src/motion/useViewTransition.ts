import type { MouseEvent } from "react";
import { flushSync } from "react-dom";
import { type NavigateOptions, useNavigate } from "react-router";

import { motionWelcome } from "./motion";

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/** The name the touched link and the new page's title share, to travel. */
const travelling = "focus-title";

/**
 * A link's click that changes page as one cross-fade instead of a cut: the
 * browser's View Transitions API, where it has one and the reader welcomes
 * motion. Anything else — a click with a modifier to open a new tab, a
 * browser without the API, reduced motion — is left to the link as it is.
 * (The app's router is the declarative one, whose links take no
 * `viewTransition` of their own.)
 */
export function useViewTransition() {
  const navigate = useNavigate();
  return (to: string, options?: NavigateOptions) => (event: MouseEvent<HTMLAnchorElement>) => {
    const transitions = document as ViewTransitionDocument;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      transitions.startViewTransition === undefined ||
      !motionWelcome()
    ) {
      return;
    }
    event.preventDefault();
    // What was touched travels to the new page's title: named before the old
    // view is captured, and the title named once the new one is in place.
    const link = event.currentTarget;
    link.style.viewTransitionName = travelling;
    let title: HTMLElement | null = null;
    const transition = transitions.startViewTransition(() => {
      flushSync(() => navigate(to, options));
      link.style.viewTransitionName = "";
      title = document.querySelector<HTMLElement>("#main-content h1");
      if (title !== null) title.style.viewTransitionName = travelling;
    });
    void transition.finished.finally(() => {
      link.style.viewTransitionName = "";
      if (title !== null) title.style.viewTransitionName = "";
    });
  };
}
