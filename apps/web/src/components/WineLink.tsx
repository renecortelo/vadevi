import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";

import { useViewTransition } from "../motion/useViewTransition";
import { useSession } from "../session/SessionContext";

/**
 * A link to a wine's evidence that works from any Space: a wine in another
 * opens by moving there first. `state` is what the wine's page shows the way
 * back with (`trailFrom`).
 */
export function WineLink({
  children,
  state,
  wine,
}: {
  children?: ReactNode;
  state: unknown;
  wine: { spaceId: string; wineId: string; wineName: string };
}) {
  const { bootstrap, updateProfile } = useSession();
  const navigate = useNavigate();
  const transition = useViewTransition();
  const here = bootstrap.data.user.activeSpaceId === wine.spaceId;
  return (
    <Link
      className="text-link"
      onClick={(event) => {
        // In this Space: the page changes as one smooth transition.
        if (here) return transition(`/wines/${wine.wineId}/evidence`, { state })(event);
        event.preventDefault();
        void (async () => {
          await updateProfile({ activeSpaceId: wine.spaceId });
          void navigate(`/wines/${wine.wineId}/evidence`, { state });
        })();
      }}
      state={state}
      to={`/wines/${wine.wineId}/evidence`}
    >
      {children ?? wine.wineName}
    </Link>
  );
}
