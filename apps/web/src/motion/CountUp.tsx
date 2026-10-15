import { useLayoutEffect, useRef, useState } from "react";

import { motionWelcome } from "./motion";

/** How long a figure takes to count to its value: `--motion-slow`. */
const duration = 600;

/**
 * A figure that counts up to its value as it arrives, and from its old value
 * to the new one when it changes — easing out, as a dashboard does. Only the
 * eye sees the count: screen readers, and a page rendered without a browser,
 * read the value itself, and a reader who asks for reduced motion sees it at
 * once.
 */
export function CountUp({ format, value }: { format: (value: number) => string; value: number }) {
  const [shown, setShown] = useState(value);
  const previous = useRef<number | null>(null);
  useLayoutEffect(() => {
    const from = previous.current ?? 0;
    previous.current = value;
    if (from === value || !motionWelcome()) {
      setShown(value);
      return;
    }
    setShown(from);
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / duration);
      setShown(from + (value - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);
  // A whole number counts in whole numbers; an average in tenths.
  const rounded = Number.isInteger(value) ? Math.round(shown) : Math.round(shown * 10) / 10;
  return (
    <>
      <span aria-hidden="true">{format(rounded)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
