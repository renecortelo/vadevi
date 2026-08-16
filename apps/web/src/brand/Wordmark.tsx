import {
  type BrandShape,
  bottleRow,
  bottleRowPaths,
  lockupWordmark,
  monogramBox,
  monogramShapes,
  wordmarkBox,
  wordmarkShapes,
} from "./marks";

/**
 * The brand marks, drawn inline.
 *
 * Inline rather than an `<img>` so they take `currentColor` and therefore the
 * current theme, instead of the application shipping one file per palette and
 * choosing between them. It also means the letterforms are the same geometry as
 * the installed icon: both come from `scripts/generate-brand.ts`.
 *
 * Every mark here is decorative. The accessible name belongs to the link or
 * heading that contains it, so these are hidden from assistive technology
 * rather than announcing "Va de Vi" a second time.
 */

function shapes(list: readonly BrandShape[]) {
  return list.map((shape) =>
    shape.stroke === undefined ? (
      <path d={shape.d} fill="currentColor" key={shape.d} />
    ) : (
      <path
        d={shape.d}
        fill="none"
        key={shape.d}
        stroke="currentColor"
        strokeWidth={shape.stroke}
      />
    ),
  );
}

/** The lowercase `vadevi` lockup, sized by the font-size of its container. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      // 1em tall per x-height keeps the mark in step with surrounding text.
      style={{ height: `${wordmarkBox.height / 100}em`, width: "auto" }}
      viewBox={`0 ${wordmarkBox.top} ${wordmarkBox.width} ${wordmarkBox.height}`}
    >
      {shapes(wordmarkShapes)}
    </svg>
  );
}

/** The `vdv` monogram, for spaces too narrow for the full word. */
export function Monogram({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      style={{ height: `${monogramBox.height / 100}em`, width: "auto" }}
      viewBox={`0 ${monogramBox.top} ${monogramBox.width} ${monogramBox.height}`}
    >
      {shapes(monogramShapes)}
    </svg>
  );
}

/**
 * The full artwork: the row of bottles with the wordmark across it.
 *
 * The bottles use the palette's decorative tints rather than `currentColor`, so
 * they stay a row of different bottles in both themes instead of collapsing
 * into one silhouette.
 */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      preserveAspectRatio="xMidYMax meet"
      viewBox={`${bottleRow.start - 24} 150 ${bottleRow.span + 48} 574`}
    >
      {bottleRowPaths.map((path, index) => (
        <path d={path} fill={`var(--color-bottle-${(index % 7) + 1})`} key={path} />
      ))}
      <g
        transform={
          `translate(${lockupWordmark.centre - lockupWordmark.width / 2} ${lockupWordmark.baseline}) ` +
          `scale(${lockupWordmark.width / wordmarkBox.width}) translate(0 -100)`
        }
      >
        {shapes(wordmarkShapes)}
      </g>
    </svg>
  );
}
