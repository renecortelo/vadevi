/**
 * The navigation icons.
 *
 * They were typographic characters — ⌂, +, ◇, ▦, ✦ — which render in whatever
 * the system font decides, at whatever weight it decides, and say nothing about
 * wine. These are drawn instead: one set, one stroke weight, one grid, so the
 * rail reads as a family rather than as five borrowed symbols.
 *
 * Each is decorative; the link's own text names the destination.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.6,
} as const;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" className="nav-icon" focusable="false" viewBox="0 0 24 24" {...stroke}>
      {children}
    </svg>
  );
}

/** Home: the vaulted cellar the bottles live in. */
export function CellarIcon() {
  return (
    <Frame>
      <path d="M3.9 20.4v-8.6a8.1 8.1 0 0 1 16.2 0v8.6" />
      <path d="M2.6 20.4h18.8" />
      <circle cx="8.4" cy="16.8" fill="currentColor" r="1.05" stroke="none" />
      <circle cx="12" cy="16.8" fill="currentColor" r="1.05" stroke="none" />
      <circle cx="15.6" cy="16.8" fill="currentColor" r="1.05" stroke="none" />
    </Frame>
  );
}

/** Log: a glass, and something being added to it. */
export function PourIcon() {
  return (
    <Frame>
      <path d="M4.4 4.9h8.4l-.75 5.3a3.45 3.45 0 0 1-6.9 0z" />
      <path d="M8.6 13.6v5.5" />
      <path d="M6.1 19.1h5" />
      <path d="M18.5 4.2v5.4" />
      <path d="M15.8 6.9h5.4" />
    </Frame>
  );
}

/** Sessions: two glasses meeting, which is what a shared tasting is. */
export function ToastIcon() {
  return (
    <Frame>
      <g transform="rotate(-11 7.4 12)">
        <path d="M4.2 4.9h6.4l-.6 4.2a2.6 2.6 0 0 1-5.2 0z" />
        <path d="M7.4 11.7v5.5" />
        <path d="M5.3 19.1h4.2" />
      </g>
      <g transform="rotate(11 16.6 12)">
        <path d="M13.4 4.9h6.4l-.6 4.2a2.6 2.6 0 0 1-5.2 0z" />
        <path d="M16.6 11.7v5.5" />
        <path d="M14.5 19.1h4.2" />
      </g>
    </Frame>
  );
}

/** Memory: a bottle with its label, which is the part you remember it by. */
export function LabelledBottleIcon() {
  return (
    <Frame>
      <path d="M10.1 2.9h3.8v3.3l1.7 2.7v10.3a1.2 1.2 0 0 1-1.2 1.2H9.6a1.2 1.2 0 0 1-1.2-1.2V8.9l1.7-2.7z" />
      <path d="M8.4 12.4h7.2" />
      <path d="M8.4 16.2h7.2" />
    </Frame>
  );
}

/** Vicenç: grapes, with the small piece of magic that tells you it is not you. */
export function GrapesIcon() {
  return (
    <Frame>
      <path d="M10.9 4.9v3.2" />
      <path d="M11.1 6.2c1.6-1.3 3.1-1 3.6 0-1.1 1.2-2.7 1.1-3.6 0z" />
      <g fill="currentColor" stroke="none">
        <circle cx="7.9" cy="11.5" r="1.7" />
        <circle cx="11.3" cy="11.1" r="1.7" />
        <circle cx="9.5" cy="14.5" r="1.7" />
        <circle cx="12.9" cy="14.1" r="1.7" />
        <circle cx="11.1" cy="17.5" r="1.7" />
      </g>
      <path d="M18.9 3.4l.65 1.75 1.75.65-1.75.65-.65 1.75-.65-1.75-1.75-.65 1.75-.65z" />
    </Frame>
  );
}
