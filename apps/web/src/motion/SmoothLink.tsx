import { Link, type LinkProps } from "react-router";

import { useViewTransition } from "./useViewTransition";

/**
 * A link to another page that changes it as one smooth transition (see
 * `useViewTransition`): the same link otherwise, its own click handled first.
 */
export function SmoothLink({ onClick, to, ...props }: LinkProps & { to: string }) {
  const transition = useViewTransition();
  return (
    <Link
      {...props}
      onClick={(event) => {
        onClick?.(event);
        transition(to, {
          ...(props.replace === undefined ? {} : { replace: props.replace }),
          state: props.state,
        })(event);
      }}
      to={to}
    />
  );
}
