import { useLayoutEffect, useRef, useState } from "react";

import { motionWelcome } from "./motion";

/**
 * When a block of figures comes into view: `"waiting"` until it does, then
 * `"shown"` — for its bars to grow as the reader reaches them, not while they
 * are still below the fold. Without a browser, without the observer, or with
 * reduced motion, there is nothing to wait for (`undefined`), and the
 * stylesheet leaves the figures as they are.
 */
export function useArrival<Element extends HTMLElement>() {
  const ref = useRef<Element>(null);
  const [state, setState] = useState<"shown" | "waiting" | undefined>(undefined);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || !motionWelcome() || globalThis.IntersectionObserver === undefined) {
      return;
    }
    setState("waiting");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState("shown");
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { "data-arrival": state, ref };
}
