import { useCallback, useRef } from "react";

/**
 * Only the latest load may set state.
 *
 * A screen that loads for one wine, then for another, receives two answers
 * in whatever order the network returns them. Without this, the slower
 * answer for the first wine landed after the second's and was shown as the
 * second's — a Rioja's prices under a Kiwi's name. Each load takes a ticket;
 * before it sets anything it asks whether its ticket is still the latest.
 *
 * The function returned is stable across renders, so a load callback that
 * lists it as a dependency does not change — and re-run — on every render.
 */
export function useLatestLoad(): () => () => boolean {
  const ticket = useRef(0);
  return useCallback(() => {
    ticket.current += 1;
    const mine = ticket.current;
    return () => mine === ticket.current;
  }, []);
}
