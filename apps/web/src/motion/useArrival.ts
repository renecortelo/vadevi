import { useLayoutEffect, useRef, useState } from "react";

import { motionWelcome } from "./motion";
import { pageSettled } from "./useViewTransition";

/**
 * When a block of figures comes into view: `"waiting"` while it is out of
 * sight, then `"shown"` — each time it comes back, so its bars grow and its
 * figures count whenever the reader reaches them, and after a page change has
 * finished, not beneath its cross-fade. Without a browser, without the
 * observer, or with reduced motion, there is nothing to wait for
 * (`undefined`), and the stylesheet leaves the figures as they are.
 * `arrived` says whether figures in the block should show their value.
 */
export function useArrival<Element extends HTMLElement>() {
  const ref = useRef<Element>(null);
  const [state, setState] = useState<"shown" | "waiting" | undefined>(undefined);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || !motionWelcome() || globalThis.IntersectionObserver === undefined) {
      return;
    }
    let live = true;
    let visible = false;
    setState("waiting");
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry === undefined) return;
        visible = entry.isIntersecting;
        if (!visible) {
          setState("waiting");
          return;
        }
        void pageSettled().then(() => {
          if (live && visible) setState("shown");
        });
      },
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, []);
  return { arrived: state !== "waiting", props: { "data-arrival": state, ref } };
}
