import { bottleRowPaths } from "./marks";

/** How wide one repeat of the bottle row is, in the artwork's coordinates. */
const rowWidth = 1080;
const repeats = 3;

/**
 * The decorative bottle row behind the sign-in and invitation screens.
 *
 * It was a striped gradient standing in for bottles. These are the bottles: the
 * same silhouettes as the lockup and the installed icon, from
 * `scripts/generate-brand.ts`.
 *
 * The row repeats so a wide viewport is covered without stretching a single
 * copy, and `slice` crops the tops rather than squashing them, so the bottles
 * rise out of the bottom edge at any size. Purely decorative: hidden from
 * assistive technology and ignored by the pointer.
 */
export function AccessBackdrop() {
  return (
    <svg
      aria-hidden="true"
      className="access-page__bottles"
      focusable="false"
      preserveAspectRatio="xMidYMax slice"
      viewBox={`60 220 ${rowWidth * repeats} 480`}
    >
      {Array.from({ length: repeats }, (_, copy) => (
        <g key={copy} transform={`translate(${copy * rowWidth} 0)`}>
          {bottleRowPaths.map((path, index) => (
            <path d={path} fill={`var(--color-bottle-${(index % 7) + 1})`} key={path} />
          ))}
        </g>
      ))}
    </svg>
  );
}
